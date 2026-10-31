import districts from './data/indonesia-districts.json'
import villages from './data/indonesia-villages.json'
import { findBusinessProvince, findBusinessCity, type BusinessLocation } from './business-regions'

export type RegionOption = { id: string; parentId: string; name: string }
function groups(rows: RegionOption[]) {
  const result = new Map<string, RegionOption[]>()
  for (const row of rows) { const group = result.get(row.parentId) || []; group.push(row); result.set(row.parentId, group) }
  return result
}
const districtGroups = groups(districts), villageGroups = groups(villages)
export function regionChildren(level: 'district' | 'village', parentId: string): RegionOption[] {
  return (level === 'district' ? districtGroups : villageGroups).get(parentId) || []
}
const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleUpperCase('id-ID').replace(/\s+/g, ' ')
export function detailedLocationProblem(value: BusinessLocation, previous?: Partial<BusinessLocation>): string | null {
  if (previous && ['province', 'city', 'district', 'village'].every(key => normalized(value[key as keyof BusinessLocation] || '') === normalized(previous[key as keyof BusinessLocation] || ''))) return null
  const district = value.district?.trim(), village = value.village?.trim()
  if (!district && !village) return null
  const province = findBusinessProvince(value.province), city = province && findBusinessCity(province.id, value.city)
  const selected = city && regionChildren('district', city.id).find(row => normalized(row.name) === normalized(district || ''))
  if (!selected) return 'Pilih kecamatan yang sesuai dengan kota/kabupaten.'
  if (village && !regionChildren('village', selected.id).some(row => normalized(row.name) === normalized(village))) return 'Pilih kelurahan/desa yang sesuai dengan kecamatan.'
  return null
}
