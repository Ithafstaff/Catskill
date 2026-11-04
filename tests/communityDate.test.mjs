import test from 'node:test'
import assert from 'node:assert/strict'
import { getCommunityDate } from '../src/communityDate.ts'

const date = value => getCommunityDate(new Date(value))
test('replaces the screenshot date with the correct Gregorian and Hebrew dates', () => {
  assert.deepEqual(date('2025-09-16T16:00:00Z'), {civil: 'Tuesday, September 16, 2025', civilISO: '2025-09-16', hebrew: '23 Elul 5785'})
  assert.deepEqual(date('2026-10-30T16:00:00Z'), {civil:'Friday, October 30, 2026',civilISO:'2026-10-30',hebrew:'19 Cheshvan 5787'})
})
test('uses New York midnight rather than UTC or the visitor timezone', () => {
  assert.equal(date('2026-10-30T03:59:59Z').civilISO, '2026-10-29')
  assert.equal(date('2026-10-30T04:00:00Z').civilISO, '2026-10-30')
  assert.equal(date('2026-10-30T03:59:59Z').hebrew, date('2026-10-30T04:00:00Z').hebrew)
})
test('Hebrew month changes at the calculated sunset, while civil day stays fixed', () => {
  // Central Catskills sunset from Hebcal's NOAA calculation for this location.
  assert.equal(date('2024-04-08T23:32:13Z').hebrew, '29 Adar II 5784')
  assert.equal(date('2024-04-08T23:32:14Z').hebrew, '1 Nisan 5784')
  assert.equal(date('2024-04-08T23:32:14Z').civilISO, '2024-04-08')
})
test('Hebrew year changes on the evening before Rosh Hashanah', () => {
  assert.equal(date('2025-09-22T16:00:00Z').hebrew, '29 Elul 5785')
  assert.equal(date('2025-09-23T00:00:00Z').hebrew, '1 Tishrei 5786')
})
test('handles daylight saving transitions and leap day', () => {
  assert.equal(date('2026-03-08T06:59:59Z').civilISO, '2026-03-08')
  assert.equal(date('2026-03-08T07:00:00Z').civilISO, '2026-03-08')
  assert.equal(date('2026-11-01T05:59:59Z').civilISO, '2026-11-01')
  assert.equal(date('2026-11-01T06:00:00Z').civilISO, '2026-11-01')
  assert.equal(date('2024-02-29T17:00:00Z').hebrew, '20 Adar I 5784')
})
test('rejects invalid clock input', () => assert.throws(() => getCommunityDate(new Date('invalid')), /Invalid/))
