import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarAddDays, calendarCells, calendarDate, calendarLabel, calendarMoveMonth, calendarToday } from '../lib/calendar-date'

test('calendar dates retain WIB boundaries and reject invalid calendars without timezone shifts',()=>{
  assert.equal(calendarToday(new Date('2026-11-03T16:59:59Z')),'2026-11-03')
  assert.equal(calendarToday(new Date('2026-11-03T17:00:00Z')),'2026-11-04')
  assert.equal(calendarDate('2026-02-29'),null)
  assert.equal(calendarDate('2026-02-30'),null)
  assert.ok(calendarDate('2028-02-29'))
  assert.ok(calendarDate('2100-12-31'))
  assert.equal(calendarDate('2100-02-29'),null)
  assert.equal(calendarLabel('2026-11-03'),'3 November 2026')
  assert.equal(calendarAddDays('2026-12-31',1),'2027-01-01')
})
test('calendar uses Monday-first cells and clamps month jumps across leap years',()=>{
  assert.equal(calendarMoveMonth('2026-01-31',1),'2026-02-28')
  assert.equal(calendarMoveMonth('2028-01-31',1),'2028-02-29')
  assert.equal(calendarMoveMonth('2028-02-29',12),'2029-02-28')
  const days=calendarCells('2026-11')
  assert.equal(days.length,42)
  assert.equal(days[0],'2026-10-26')
  assert.equal(days[6],'2026-11-01')
  assert.equal(new Set(days).size,42)
  assert.equal(calendarCells('2000-01')[0],'1999-12-27')
})
