import data from './data/indonesia-regions.json'

const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID').replace(/^KABUPATEN /, 'KAB. ')
const label = (value: string) => value.split(' ').map(word => ['DKI', 'DI', 'D.I.'].includes(word) ? word : word.charAt(0) + word.slice(1).toLocaleLowerCase('id-ID')).join(' ')
export const businessProvinces = data.provinces.map(region => ({ ...region, label: label(region.name) })).sort((a, b) => a.label.localeCompare(b.label, 'id-ID'))
export const businessRegencies = data.regencies.map(region => ({ ...region, label: label(region.name) }))
export function findBusinessProvince(value: string) {
  const key = normalize(value)
  return businessProvinces.find(region => normalize(region.name) === key)
}
export function citiesForProvince(provinceId: string) {
  return businessRegencies.filter(region => region.provinceId === provinceId).sort((a, b) => a.label.localeCompare(b.label, 'id-ID'))
}
export function findBusinessCity(provinceId: string, value: string) {
  const key = normalize(value)
  return businessRegencies.find(region => region.provinceId === provinceId && normalize(region.name) === key)
}
export type BusinessLocation = { province: string; city: string; district?: string; village?: string }
export function businessLocationProblem(value: BusinessLocation, previous?: { province?: string; city?: string }): string | null {
  if (previous?.province && previous.city && normalize(value.province) === normalize(previous.province) && normalize(value.city) === normalize(previous.city)) return null
  const province = findBusinessProvince(value.province)
  if (!province) return 'Pilih provinsi dari daftar yang tersedia.'
  if (!findBusinessCity(province.id, value.city)) return 'Pilih kota/kabupaten yang sesuai dengan provinsi.'
  return null
}
