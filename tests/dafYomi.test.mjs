import test from "node:test"
import assert from "node:assert/strict"
import {
  fetchDafYomiForDate,
  getCachedDafYomi,
  getNewYorkCalendarDate,
  parseDafYomiResponse,
} from "../src/dafYomi.ts"

const storage = new Map()
globalThis.sessionStorage = {
  get length() {
    return storage.size
  },
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
  key: (index) => [...storage.keys()][index] ?? null,
}
const event = (date, title) => ({
  items: [{ category: "dafyomi", date, title }],
})

test("New York dates remain correct across UTC, DST, month, year and leap-day boundaries", () => {
  const cases = [
    ["2026-10-28T03:59:00Z", "2026-10-27"],
    ["2026-10-28T04:01:00Z", "2026-10-28"],
    ["2026-03-08T06:59:00Z", "2026-03-08"],
    ["2026-03-08T07:01:00Z", "2026-03-08"],
    ["2026-11-01T05:59:00Z", "2026-11-01"],
    ["2026-11-01T06:01:00Z", "2026-11-01"],
    ["2025-01-01T04:59:00Z", "2024-12-31"],
    ["2025-01-01T05:01:00Z", "2025-01-01"],
    ["2024-03-01T04:59:00Z", "2024-02-29"],
    ["2024-03-01T05:01:00Z", "2024-03-01"],
  ]
  for (const [instant, date] of cases)
    assert.equal(getNewYorkCalendarDate(new Date(instant)), date)
})

test("extracts the dated Daf Yomi event without relying on array order", () => {
  const payload = {
    items: [
      { category: "holiday", date: "2022-06-06", title: "Shavuot" },
      ...event("2022-06-06", "Yevamot 91").items,
    ],
  }
  assert.deepEqual(parseDafYomiResponse(payload, "2022-06-06"), {
    date: "2022-06-06",
    masechta: "Yevamot",
    daf: 91,
  })
})

test("rejects missing, contradictory, wrong-date and malformed events", () => {
  for (const payload of [
    null,
    {},
    { items: [] },
    event("2022-06-05", "Yevamot 91"),
    event("2022-06-06", "Yevamot 999"),
    event("2022-06-06", "Fiction 4"),
    event("2022-06-06", "Bechorot 62"),
    event("2022-06-06", "<script> 3"),
    {
      items: [
        ...event("2022-06-06", "Yevamot 91").items,
        ...event("2022-06-06", "Yevamot 92").items,
      ],
    },
  ]) {
    assert.throws(() => parseDafYomiResponse(payload, "2022-06-06"))
  }
})

test("independently published cycle opening examples parse correctly", () => {
  assert.equal(
    parseDafYomiResponse(event("2020-01-05", "Berakhot 2"), "2020-01-05").daf,
    2,
  )
  assert.equal(
    parseDafYomiResponse(event("2020-01-06", "Berakhot 3"), "2020-01-06").daf,
    3,
  )
})

test("parses cross-checked leap-day and mid-tractate examples", () => {
  assert.equal(
    parseDafYomiResponse(event("2024-02-29", "Baba Kamma 119"), "2024-02-29")
      .daf,
    119,
  )
  assert.equal(
    parseDafYomiResponse(event("2026-06-06", "Chullin 37"), "2026-06-06").daf,
    37,
  )
})

test("accepts independently checked tractate transition and special folio numbering", () => {
  assert.deepEqual(
    parseDafYomiResponse(event("2026-11-18", "Bechorot 61"), "2026-11-18"),
    { date: "2026-11-18", masechta: "Bechorot", daf: 61 },
  )
  assert.deepEqual(
    parseDafYomiResponse(event("2026-11-19", "Arachin 2"), "2026-11-19"),
    { date: "2026-11-19", masechta: "Arachin", daf: 2 },
  )
  assert.equal(
    parseDafYomiResponse(event("2027-03-13", "Kinnim 23"), "2027-03-13").daf,
    23,
  )
  assert.throws(() =>
    parseDafYomiResponse(event("2027-03-13", "Kinnim 2"), "2027-03-13"),
  )
})

test("deduplicates simultaneous requests and reuses a validated date-keyed result", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url) => {
    calls++
    assert.equal(url.searchParams.get("start"), "2026-10-27")
    assert.equal(url.searchParams.get("end"), "2026-10-27")
    return new Response(JSON.stringify(event("2026-10-27", "Bechorot 39")), {
      status: 200,
    })
  }
  try {
    const [first, second] = await Promise.all([
      fetchDafYomiForDate("2026-10-27"),
      fetchDafYomiForDate("2026-10-27"),
    ])
    assert.deepEqual(first, second)
    assert.equal(calls, 1)
    assert.equal((await fetchDafYomiForDate("2026-10-27")).daf, 39)
    assert.equal(getCachedDafYomi("2026-10-28"), undefined)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
  }
})

test("network and invalid responses fail without populating the cache", async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => {
      throw new Error("offline")
    }
    await assert.rejects(fetchDafYomiForDate("2026-10-28"))
    assert.equal(getCachedDafYomi("2026-10-28"), undefined)
    globalThis.fetch = async () =>
      new Response(JSON.stringify(event("2026-10-27", "Bechorot 39")))
    await assert.rejects(fetchDafYomiForDate("2026-10-28"))
    assert.equal(getCachedDafYomi("2026-10-28"), undefined)
  } finally {
    globalThis.fetch = original
  }
})

test("refresh controller updates at New York midnight and ignores late responses", async () => {
  const { createDafYomiRefreshController } = await import(
    "../src/dafYomiRefresh.ts"
  )
  let instant = new Date("2026-10-28T03:59:00Z")
  const states = []
  const requested = []
  let finishYesterday
  const controller = createDafYomiRefreshController({
    now: () => instant,
    cached: () => undefined,
    onChange: (state) => states.push(state),
    load: (date) => {
      requested.push(date)
      if (date === "2026-10-27")
        return new Promise((resolve) => {
          finishYesterday = resolve
        })
      return Promise.resolve({ date, masechta: "Bechorot", daf: 40 })
    },
  })
  controller.refresh()
  instant = new Date("2026-10-28T04:01:00Z")
  controller.refresh()
  await new Promise(setImmediate)
  assert.deepEqual(requested, ["2026-10-27", "2026-10-28"])
  assert.equal(states.at(-1).entry.daf, 40)
  finishYesterday({ date: "2026-10-27", masechta: "Bechorot", daf: 39 })
  await new Promise(setImmediate)
  assert.equal(states.at(-1).date, "2026-10-28")
  assert.equal(states.at(-1).entry.daf, 40)
  controller.stop()
})

test("a returning connection retries a failed request and cleanup stops updates", async () => {
  const { createDafYomiRefreshController } = await import(
    "../src/dafYomiRefresh.ts"
  )
  const states = []
  let calls = 0
  const oldWarn = console.warn
  console.warn = () => {}
  const controller = createDafYomiRefreshController({
    now: () => new Date("2026-10-28T12:00:00Z"),
    cached: () => undefined,
    onChange: (state) => states.push(state),
    load: async (date) => {
      calls++
      if (calls === 1) throw new Error("offline")
      return { date, masechta: "Bechorot", daf: 40 }
    },
  })
  try {
    controller.refresh()
    await new Promise(setImmediate)
    assert.equal(states.at(-1).error, true)
    controller.refresh(true, true)
    await new Promise(setImmediate)
    assert.equal(states.at(-1).entry.daf, 40)
    controller.stop()
    controller.refresh(true, true)
    assert.equal(calls, 2)
  } finally {
    console.warn = oldWarn
  }
})
