import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { businessProvinces, businessRegencies, businessLocationProblem, citiesForProvince, findBusinessProvince, findBusinessCity } from '../lib/business-regions'
import { regionChildren, detailedLocationProblem } from '../lib/business-region-details'

test('bundled regions retain CSV identifiers, province relations and distinct city/regency names', () => {
  const manifest = JSON.parse(readFileSync('data/indonesia/manifest.json', 'utf8'))
  assert.equal(businessProvinces.length, 37)
  assert.equal(businessRegencies.length, 514)
  assert.equal(new Set(businessRegencies.map(r => r.id)).size, 514)
  for (const region of businessRegencies) assert.ok(businessProvinces.some(p => p.id === region.provinceId))
  const west = findBusinessProvince('  jawa   barat ')!
  assert.equal(west.id, '32')
  assert.equal(findBusinessCity(west.id, 'Kota Bandung')?.label, 'Kota Bandung')
  assert.equal(findBusinessCity(west.id, 'Kabupaten Bandung')?.label, 'Kab. Bandung')
  assert.equal(findBusinessCity(west.id, 'Bandung'), undefined)
  assert.equal(findBusinessCity(west.id, 'Kota Surabaya'), undefined)
  assert.ok(citiesForProvince(west.id).every(c => c.provinceId === west.id))
  assert.equal(citiesForProvince('missing').length, 0)
  for (const name of ['provinces', 'regencies', 'districts', 'villages']) {
    const bytes = readFileSync(`data/indonesia/${name}.csv`)
    assert.equal(createHash('sha256').update(bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex'), manifest[name].sha256)
  }
})

test('districts and villages are scoped to their parent and reject cross-region values', () => {
  const city = findBusinessCity('32', 'Kota Bandung')!
  const district = regionChildren('district', city.id)[0], village = regionChildren('village', district.id)[0]
  assert.ok(district && village)
  const location = { province: 'Jawa Barat', city: 'Kota Bandung', district: district.name, village: village.name }
  assert.equal(detailedLocationProblem(location), null)
  assert.ok(detailedLocationProblem({ ...location, district: 'Tidak ada' }))
  assert.ok(detailedLocationProblem({ ...location, village: 'Tidak ada' }))
  assert.ok(detailedLocationProblem({ ...location, district: '' }))
  assert.equal(detailedLocationProblem({ province: 'Jawa Barat', city: 'Bandung' }), null)
  assert.equal(regionChildren('district', '9999').length, 0)
})

test('location validation rejects missing and cross-province selections while preserving unchanged legacy records', () => {
  assert.equal(businessLocationProblem({ province: 'Jawa Barat', city: 'Kota Bandung' }), null)
  assert.ok(businessLocationProblem({ province: '', city: '' }))
  assert.ok(businessLocationProblem({ province: 'Jawa Barat', city: '' }))
  assert.ok(businessLocationProblem({ province: 'Jawa Barat', city: 'Kota Surabaya' }))
  assert.ok(businessLocationProblem({ province: 'Jawa Barat', city: 'Bandung' }))
  const previous = { province: 'Jawa Barat', city: 'Bandung' }
  assert.equal(businessLocationProblem(previous, previous), null)
  assert.ok(businessLocationProblem({ province: 'Jawa Timur', city: 'Bandung' }, previous))
  assert.ok(businessLocationProblem({ province: 'Jawa Barat', city: 'Surabaya' }, previous))
  assert.equal(businessLocationProblem({ province: 'Jawa Timur', city: 'Kota Surabaya' }, previous), null)
})
