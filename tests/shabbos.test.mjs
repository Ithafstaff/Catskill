import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { getShabbosCalendar, getPublishedShabbosRows } from "../src/shabbos.ts"

test("calculates the Catskills calendar and candle lighting without placeholders", () => {
  const result = getShabbosCalendar(new Date("2026-11-06T16:00:00Z"))
  assert.equal(result.reading, "Parshas Chayei Sara")
  assert.equal(result.saturdayISO, "2026-11-07")
  assert.equal(result.hebrewDate, "27 Cheshvan 5787")
  assert.equal(result.fridayISO, "2026-11-06")
  assert.equal(result.candleISO, "2026-11-06T21:29:00.000Z")
  assert.equal(result.candleTime, "4:29 PM EST")
})

test("keeps the current Shabbos on Saturday and advances at New York Sunday midnight", () => {
  assert.equal(
    getShabbosCalendar(new Date("2026-11-08T04:59:59Z")).saturdayISO,
    "2026-11-07",
  )
  assert.equal(
    getShabbosCalendar(new Date("2026-11-08T05:00:00Z")).saturdayISO,
    "2026-11-14",
  )
  assert.equal(
    getShabbosCalendar(new Date("2025-12-31T16:00:00Z")).saturdayISO,
    "2026-01-03",
  )
})

test("uses the holiday reading when a festival replaces the weekly parsha", () => {
  const result = getShabbosCalendar(new Date("2026-04-03T16:00:00Z"))
  assert.match(result.reading, /Pesach/)
  assert.doesNotMatch(result.reading, /Parshas/)
  assert.equal(result.hebrewDate, "17 Nisan 5786")
})

test("formats EST and EDT correctly and rejects an invalid device clock", () => {
  assert.match(
    getShabbosCalendar(new Date("2026-03-06T16:00:00Z")).candleTime,
    /EST$/,
  )
  assert.match(
    getShabbosCalendar(new Date("2026-03-13T16:00:00Z")).candleTime,
    /EDT$/,
  )
  assert.throws(() => getShabbosCalendar(new Date("invalid")), /Invalid/)
})

test("visitors in other timezones see the same dates and candle-lighting instant", () => {
  const script = `import {getShabbosCalendar} from './src/shabbos.ts'; console.log(JSON.stringify(getShabbosCalendar(new Date('2026-11-06T01:00:00Z'))))`
  const expected = getShabbosCalendar(new Date("2026-11-06T01:00:00Z"))
  for (const timezone of [
    "Asia/Manila",
    "Pacific/Honolulu",
    "Pacific/Kiritimati",
  ]) {
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", script],
        {
          env: { ...process.env, TZ: timezone },
          encoding: "utf8",
        },
      ),
    )
    assert.deepEqual(actual, expected, timezone)
  }
})

const service = (changes = {}) => ({
  id: "test-service",
  prayerType: "Shacharis",
  customPrayerName: "",
  scheduleType: "shabbos",
  daysOfWeek: [],
  shabbosPeriod: "Shabbos day",
  occasion: "",
  seasonalPattern: "",
  timeType: "fixed",
  startTime: "09:00",
  timeDescription: "",
  notes: "",
  ...changes,
})
const listing = (changes = {}) => ({
  id: "test-shul",
  type: "Shul",
  status: "Published",
  visibility: "published",
  name: "Test congregation",
  address: "Test street",
  city: "Test town",
  state: "NY",
  primarySchedules: [service()],
  locations: [],
  ...changes,
})

test("uses only published shul schedules and excludes drafts, pending changes and other recurrence types", () => {
  const rows = getPublishedShabbosRows([
    listing(),
    listing({ status: "Draft" }),
    listing({ status: "Pending Review" }),
    listing({ visibility: "archived" }),
    listing({ type: "Mikvah" }),
    listing({
      primarySchedules: [service({ scheduleType: "weekly", daysOfWeek: [5] })],
    }),
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].services[0].time, "9:00 AM")
  assert.equal(rows[0].listingId, "test-shul")
})

test("preserves variable times, custom learning names, notes and additional locations", () => {
  const rows = getPublishedShabbosRows([
    listing({
      primarySchedules: [
        service({
          prayerType: "Other",
          customPrayerName: "Daf Yomi",
          timeType: "variable",
          timeDescription: "30 minutes before Shacharis",
          notes: "In the study room",
        }),
      ],
      locations: [
        {
          id: "annex",
          name: "Annex",
          address: "Another street",
          schedules: [
            service({
              id: "annex-mincha",
              prayerType: "Mincha",
              startTime: "16:15",
            }),
          ],
        },
      ],
    }),
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].services[0].prayer, "Daf Yomi")
  assert.equal(rows[0].services[0].time, "30 minutes before Shacharis")
  assert.equal(rows[0].services[0].notes, "In the study room")
  assert.equal(rows[1].name, "Test congregation · Annex")
  assert.equal(rows[1].services[0].time, "4:15 PM")
})

test("missing or malformed schedules never become invented times", () => {
  assert.deepEqual(getPublishedShabbosRows([]), [])
  assert.deepEqual(
    getPublishedShabbosRows([listing({ primarySchedules: [] })]),
    [],
  )
  assert.deepEqual(
    getPublishedShabbosRows([
      listing({
        primarySchedules: [
          service({ startTime: "25:00" }),
          service({ shabbosPeriod: "" }),
          service({ prayerType: "Other", customPrayerName: "" }),
          service({ timeType: "variable", timeDescription: " " }),
        ],
      }),
    ]),
    [],
  )
})
