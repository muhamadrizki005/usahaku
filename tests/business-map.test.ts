import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchMapAddress, enrichMapAddress } from '../lib/business-map-matching'
import { mapPointSchema, locationRequestSchema } from '../lib/business-map'
import { profileSchema } from '../lib/business-profile'
import { geocodeLocation } from '../lib/business-map-provider'

const point = { latitude: -6.8945, longitude: 107.613 }
const complete = { country_code: 'id', state: 'Jawa Barat', county: 'Kota Bandung', district: 'Coblong', suburb: 'Cipaganti', street: 'Jalan Uji', housenumber: '10', formatted: 'Jalan Uji 10, Cipaganti' }
test('map matching respects CSV parents, distinguishes kota/kabupaten and never guesses absent or ambiguous regions', () => {
  const result = matchMapAddress(complete, point)!
  assert.equal(result.province, 'Jawa Barat'); assert.equal(result.city, 'Kota Bandung'); assert.equal(result.district, 'Coblong'); assert.equal(result.village, 'Cipaganti'); assert.equal(result.incomplete, false)
  assert.equal(matchMapAddress({ ...complete, county: 'Bandung' }, point)?.city, '')
  assert.equal(matchMapAddress({ ...complete, county: 'Kota Surabaya' }, point)?.city, '')
  assert.equal(matchMapAddress({ ...complete, district: 'Wonocolo' }, point)?.district, '')
  assert.equal(matchMapAddress({ ...complete, suburb: 'Tidak ada' }, point)?.village, '')
  assert.equal(matchMapAddress({ ...complete, country_code: 'my' }, point), null)
  assert.equal(matchMapAddress({ ...complete, state: 'Papua Barat Daya' }, point)?.province, '')
})
test('coordinates are optional paired finite Indonesian bounds and reject forged lookup parameters', () => {
  assert.equal(mapPointSchema.safeParse(point).success, true)
  for (const input of [{ latitude: NaN, longitude: 107 }, { latitude: -20, longitude: 107 }, { latitude: 1, longitude: 180 }]) assert.equal(mapPointSchema.safeParse(input).success, false)
  assert.equal(locationRequestSchema.safeParse({ mode: 'reverse', ...point, businessId: 'forged' }).success, false)
  assert.equal(locationRequestSchema.safeParse({ mode: 'search', query: 'ab' }).success, false)
  const profile = { name: 'Toko Uji', address: 'Jalan', city: 'Kota Bandung', province: 'Jawa Barat', phone: '0812', description: '' }
  assert.equal(profileSchema.safeParse(profile).success, true)
  assert.equal(profileSchema.safeParse({ ...profile, latitude: '-6.89' }).success, false)
  assert.equal(profileSchema.safeParse({ ...profile, latitude: '-6.89', longitude: '107.61' }).success, true)
})

test('administrative boundaries resolve the reported Tasikmalaya point and Kemendagri IDs without guessing city/regency', () => {
  const tasik = { latitude: -7.329249, longitude: 108.203538 }
  const partial = matchMapAddress({ country_code: 'id', state: 'Jawa Barat', county: 'Tasikmalaya', city: 'Tasikmalaya', district: 'Cihideung', street: 'Jalan Uji' }, tasik)!
  assert.equal(partial.city, '')
  const boundary = (name: string, extra = {}) => ({ properties: { country_code: 'id', name, state: 'Jawa Barat', ...extra } })
  const matched = enrichMapAddress(partial, [boundary('Jawa Barat'), boundary('Tasikmalaya'), boundary('Cihideung'), boundary('Cilembang')])
  assert.deepEqual([matched.province, matched.city, matched.district, matched.village], ['Jawa Barat', 'Kota Tasikmalaya', 'Cihideung', 'Cilembang'])
  assert.equal(enrichMapAddress(partial, [boundary('Jawa Barat'), boundary('Tasikmalaya')]).city, '')
  const bandung = enrichMapAddress(matchMapAddress({ ...complete, district: undefined, suburb: undefined }, point)!, [boundary('Lebak Siliwangi', { ref_other: { kemendagri: '32.73.02.1006' } })])
  assert.equal(bandung.district, 'Coblong'); assert.equal(bandung.village, 'Lebak Siliwangi')
  const ambiguous = enrichMapAddress(partial, [boundary('Kota Bandung', { ref_other: { kemendagri: '32.73' } }), boundary('Kota Tasikmalaya', { ref_other: { kemendagri: '32.78' } })])
  assert.equal(ambiguous.city, '')
})

test('reverse enriches partial addresses with containing boundaries and tolerates unavailable boundary service', async () => {
  const send: typeof fetch = async input => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/part-of')) return Response.json({ features: [{ properties: { country_code: 'id', name: 'Cilembang', ref_other: { kemendagri: '32.78.01.1003' } } }] })
    return Response.json({ results: [{ country_code: 'id', state: 'Jawa Barat', city: 'Tasikmalaya', street: 'Jalan Uji' }] })
  }
  const input = { mode: 'reverse', latitude: -7.329249, longitude: 108.203538 }
  assert.equal((await geocodeLocation(input, 'test-secret', send))[0].village, 'Cilembang')
  const unavailable: typeof fetch = async (input, init) => new URL(String(input)).pathname.endsWith('/part-of') ? new Response('private-provider-error', { status: 429 }) : send(input, init)
  const partial = await geocodeLocation(input, 'test-secret', unavailable)
  assert.equal(partial[0].incomplete, true); assert.equal(JSON.stringify(partial).includes('private-provider'), false)
})
test('Geoapify calls use fixed endpoints, server-only key and sanitized results/failures', async () => {
  let calls = 0
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls++
    assert.equal(url.hostname, 'api.geoapify.com'); assert.equal(url.searchParams.get('apiKey'), 'test-secret'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error')
    if (url.pathname.endsWith('/search')) assert.equal(url.searchParams.get('filter'), 'countrycode:id')
    return Response.json({ results: [{ ...complete, lat: point.latitude, lon: point.longitude, secret: 'never-return' }] })
  }
  const result = await geocodeLocation({ mode: 'reverse', ...point }, 'test-secret', send)
  assert.equal(result[0].village, 'Cipaganti'); assert.equal(JSON.stringify(result).includes('secret'), false)
  await geocodeLocation({ mode: 'search', query: 'Bandung' }, 'test-secret', send)
  assert.equal(calls, 2)
  await assert.rejects(geocodeLocation({ mode: 'reverse', ...point }, undefined, send), /belum dikonfigurasi/)
  for (const status of [401, 429, 500]) await assert.rejects(geocodeLocation({ mode: 'reverse', ...point }, 'test-secret', async () => new Response('provider-private-key', { status })), error => error instanceof Error && !error.message.includes('private-key') && !error.message.includes('test-secret'))
  await assert.rejects(geocodeLocation({ mode: 'reverse', ...point }, 'test-secret', async () => { throw Error('URL contains test-secret') }), /belum dapat dihubungi/)
  await assert.rejects(geocodeLocation({ mode: 'reverse', ...point }, 'test-secret', async () => Response.json({ bad: true })), /belum dapat dibaca/)
})
