import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

function csv(file, header) {
  const source = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const rows = source.trim().split(/\r?\n/).map(line => {
    const fields = []; let value = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted }
      else if (char === ';' && !quoted) { fields.push(value); value = '' } else value += char
    }
    if (quoted) throw Error('Unclosed CSV quote')
    fields.push(value); return fields
  })
  if (JSON.stringify(rows.shift()) !== JSON.stringify(header) || rows.some(row => row.length !== header.length)) throw Error('Unexpected CSV schema: ' + file)
  return { rows, sha256: createHash('sha256').update(source).digest('hex') }
}
const provinces = csv('data/indonesia/provinces.csv', ['id', 'name'])
const regencies = csv('data/indonesia/regencies.csv', ['id', 'province_id', 'name'])
const districts = csv('data/indonesia/districts.csv', ['id', 'regency_id', 'name'])
const villages = csv('data/indonesia/villages.csv', ['id', 'district_id', 'name'])
const ids = new Set(provinces.rows.map(row => row[0])), regencyIds = new Set(regencies.rows.map(row => row[0]))
if (ids.size !== provinces.rows.length || regencyIds.size !== regencies.rows.length || regencies.rows.some(row => !ids.has(row[1]))) throw Error('Duplicate or orphan region ID')
const districtIds = new Set(districts.rows.map(row => row[0])), villageIds = new Set(villages.rows.map(row => row[0]))
if (districtIds.size !== districts.rows.length || villageIds.size !== villages.rows.length || districts.rows.some(row => !regencyIds.has(row[1])) || villages.rows.some(row => !districtIds.has(row[1]))) throw Error('Duplicate or orphan district/village ID')
const data = { provinces: provinces.rows.map(([id, name]) => ({ id, name })), regencies: regencies.rows.map(([id, provinceId, name]) => ({ id, provinceId, name })) }
mkdirSync('lib/data', { recursive: true })
writeFileSync('lib/data/indonesia-regions.json', JSON.stringify(data) + '\n')
writeFileSync('lib/data/indonesia-districts.json', JSON.stringify(districts.rows.map(([id, parentId, name]) => ({ id, parentId, name }))) + '\n')
writeFileSync('lib/data/indonesia-villages.json', JSON.stringify(villages.rows.map(([id, parentId, name]) => ({ id, parentId, name }))) + '\n')
writeFileSync('data/indonesia/manifest.json', JSON.stringify({ source: 'User-supplied Wilayah-Administrasi-Indonesia-master/csv', provinces: { count: data.provinces.length, sha256: provinces.sha256 }, regencies: { count: data.regencies.length, sha256: regencies.sha256 }, districts: { count: districts.rows.length, sha256: districts.sha256 }, villages: { count: villages.rows.length, sha256: villages.sha256 }, note: 'Source README states Papua Barat Daya is not included. Preserve source IDs and names.' }, null, 2) + '\n')
console.log(`Generated ${data.provinces.length} provinces and ${data.regencies.length} regencies`)
console.log(`Generated ${districts.rows.length} districts and ${villages.rows.length} villages (server data)`)
