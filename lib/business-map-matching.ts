import { businessProvinces, citiesForProvince } from './business-regions'
import { regionChildren } from './business-region-details'
import type { MapAddress, MapPoint } from './business-map'

export type ProviderAddress = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 500) : ''
const normalize = (value: string) => value.normalize('NFKC').toLocaleUpperCase('id-ID').replace(/^(PROVINSI|KECAMATAN|KELURAHAN|DESA)\s+/, '').replace(/KABUPATEN\s+/, 'KAB. ').replace(/\s+/g, ' ').trim()
function unique<T>(rows: T[], names: string[], name: (row: T) => string): T | undefined {
  const matches = rows.filter(row => names.some(candidate => normalize(candidate) === normalize(name(row))))
  return matches.length === 1 ? matches[0] : undefined
}
export function matchMapAddress(properties: ProviderAddress, point: MapPoint): MapAddress | null {
  if (text(properties.country_code).toLowerCase() !== 'id') return null
  const aliases: Record<string, string> = { 'DAERAH KHUSUS IBUKOTA JAKARTA': 'DKI JAKARTA', 'JAKARTA': 'DKI JAKARTA', 'DAERAH ISTIMEWA YOGYAKARTA': 'DI YOGYAKARTA' }
  const state = text(properties.state), province = unique(businessProvinces, [aliases[normalize(state)] || state], row => row.name)
  const names = [properties.county, properties.city, properties.municipality].map(text).filter(Boolean)
  const cities = province ? citiesForProvince(province.id) : []
  const city = unique(cities, names, row => row.name) || unique(cities, names, row => row.name.replace(/^(KOTA|KAB\.)\s+/, ''))
  const areas = [properties.district, properties.suburb, properties.quarter, properties.village, properties.city_district].map(text).filter(Boolean)
  const district = city && unique(regionChildren('district', city.id), areas, row => row.name)
  const village = district && unique(regionChildren('village', district.id), areas, row => row.name)
  const address = [text(properties.street), text(properties.housenumber)].filter(Boolean).join(' ').slice(0, 300)
  return { ...point, address, province: province?.label || '', city: city?.label || '', district: district?.name || '', village: village?.name || '', display: text(properties.formatted) || [address, city?.label, province?.label].filter(Boolean).join(', '), incomplete: !address || !province || !city || !district || !village }
}

export function enrichMapAddress(address: MapAddress, features: unknown): MapAddress {
  if (!Array.isArray(features)) return address
  const areas = features.slice(0, 30).map(feature => feature?.properties).filter(properties => properties && text(properties.country_code).toLowerCase() === 'id') as ProviderAddress[]
  const codes = areas.map(properties => {
    const ref = properties.ref_other as Record<string, unknown> | undefined
    const raw = (properties.datasource as { raw?: Record<string, unknown> } | undefined)?.raw
    const code = text(ref?.kemendagri || raw?.['ref:kemendagri']).replace(/\./g, '')
    return /^(\d{2}|\d{4}|\d{6}|\d{10})$/.test(code) ? code : ''
  }).filter(Boolean)
  const allNames = areas.flatMap(properties => [properties.name, properties.state, properties.city, properties.county, properties.district, properties.suburb].map(text)).filter(Boolean)
  const byCode = <T extends { id: string }>(rows: T[], length: number) => {
    const matches = rows.filter(row => codes.some(code => code.length >= length && code.slice(0, length) === row.id))
    return matches
  }
  const choose = <T extends { id: string }>(rows: T[], length: number, name: (row: T) => string): T | undefined => {
    const coded = byCode(rows, length)
    return coded.length ? (coded.length === 1 ? coded[0] : undefined) : unique(rows, allNames, name)
  }
  const province = choose(businessProvinces, 2, row => row.name)
  if (!province) return address
  const cities = citiesForProvince(province.id)
  let city = choose(cities, 4, row => row.name)
  if (!city && !byCode(cities, 4).length) {
    const candidates = cities.filter(row => allNames.some(name => normalize(name) === normalize(row.name.replace(/^(KOTA|KAB\.)\s+/, ''))))
    const narrowed = candidates.length === 1 ? candidates : candidates.filter(row => unique(regionChildren('district', row.id), allNames, item => item.name))
    if (narrowed.length === 1) city = narrowed[0]
  }
  const districts = city ? regionChildren('district', city.id) : [], district = choose(districts, 6, row => row.name)
  const villages = district ? regionChildren('village', district.id) : [], village = choose(villages, 10, row => row.name)
  const result = { ...address, province: province.label, city: city?.label || '', district: district?.name || '', village: village?.name || '' }
  result.incomplete = !result.address || !result.province || !result.city || !result.district || !result.village
  result.display = [result.address, result.village, result.district, result.city, result.province].filter(Boolean).join(', ')
  return result
}
