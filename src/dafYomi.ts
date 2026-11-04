/** Hebcal's calendar dates are civil dates, interpreted here in New York. */
export const DAF_TIMEZONE = "America/New_York"

export interface DafYomiEntry {
  date: string
  masechta: string
  daf: number
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DAF_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

// Plausible folio ranges, based on Hebcal's published Bavli tractate table.
// The last three tractates continue the preceding volume's page numbering.
const tractates = new Map<string, [number, number]>([
  ["Berachot", [2, 64]],
  ["Berakhot", [2, 64]],
  ["Shabbat", [2, 157]],
  ["Eruvin", [2, 105]],
  ["Pesachim", [2, 121]],
  ["Shekalim", [2, 22]],
  ["Yoma", [2, 88]],
  ["Sukkah", [2, 56]],
  ["Beitzah", [2, 40]],
  ["Rosh Hashana", [2, 35]],
  ["Rosh Hashanah", [2, 35]],
  ["Taanit", [2, 31]],
  ["Ta'anit", [2, 31]],
  ["Megillah", [2, 32]],
  ["Moed Katan", [2, 29]],
  ["Chagigah", [2, 27]],
  ["Yevamot", [2, 122]],
  ["Ketubot", [2, 112]],
  ["Nedarim", [2, 91]],
  ["Nazir", [2, 66]],
  ["Sotah", [2, 49]],
  ["Gitin", [2, 90]],
  ["Gittin", [2, 90]],
  ["Kiddushin", [2, 82]],
  ["Baba Kamma", [2, 119]],
  ["Bava Kamma", [2, 119]],
  ["Baba Metzia", [2, 119]],
  ["Bava Metzia", [2, 119]],
  ["Baba Batra", [2, 176]],
  ["Bava Batra", [2, 176]],
  ["Sanhedrin", [2, 113]],
  ["Makkot", [2, 24]],
  ["Shevuot", [2, 49]],
  ["Avodah Zarah", [2, 76]],
  ["Horayot", [2, 14]],
  ["Zevachim", [2, 120]],
  ["Menachot", [2, 110]],
  ["Chullin", [2, 142]],
  ["Bechorot", [2, 61]],
  ["Arachin", [2, 34]],
  ["Temurah", [2, 34]],
  ["Keritot", [2, 28]],
  ["Meilah", [2, 22]],
  ["Kinnim", [23, 25]],
  ["Tamid", [26, 33]],
  ["Midot", [34, 37]],
  ["Middot", [34, 37]],
  ["Niddah", [2, 73]],
])

export function getNewYorkCalendarDate(now = new Date()): string {
  const parts = dateFormatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** Reject anything other than one dated Daf Yomi event from Hebcal. */
export function parseDafYomiResponse(
  payload: unknown,
  date: string,
): DafYomiEntry {
  if (!payload || typeof payload !== "object" || !("items" in payload)) {
    throw new Error("Hebcal returned an invalid calendar response")
  }
  const items = (payload as { items: unknown }).items
  if (!Array.isArray(items))
    throw new Error("Hebcal calendar items are missing")
  const matches = items.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      item.category === "dafyomi" &&
      item.date === date,
  )
  if (matches.length !== 1 || typeof matches[0].title !== "string") {
    throw new Error(
      "Hebcal returned no unique Daf Yomi event for the requested date",
    )
  }
  const match = /^([\p{L}][\p{L}\p{M}'’ .-]{0,79}) ([1-9]\d{0,2})$/u.exec(
    matches[0].title.trim(),
  )
  const daf = Number(match?.[2])
  const range = match && tractates.get(match[1])
  if (!match || !range || daf < range[0] || daf > range[1]) {
    throw new Error("Hebcal returned an invalid Daf Yomi title")
  }
  return { date, masechta: match[1], daf }
}

const cache = new Map<string, DafYomiEntry>()
const pending = new Map<string, Promise<DafYomiEntry>>()
const CACHE_PREFIX = "daf-yomi:America/New_York:"

export function getCachedDafYomi(date: string): DafYomiEntry | undefined {
  const cached = cache.get(date)
  if (cached) return cached
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + date)
    if (!raw) return undefined
    const entry = parseDafYomiResponse(JSON.parse(raw), date)
    cache.set(date, entry)
    return entry
  } catch {
    return undefined
  }
}

export function fetchDafYomiForDate(date: string): Promise<DafYomiEntry> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Promise.reject(new Error("Invalid calendar date"))
  const cached = getCachedDafYomi(date)
  if (cached) return Promise.resolve(cached)
  const existing = pending.get(date)
  if (existing) return existing

  const request = (async () => {
    const url = new URL("https://www.hebcal.com/hebcal")
    url.search = new URLSearchParams({
      v: "1",
      cfg: "json",
      F: "on",
      start: date,
      end: date,
    }).toString()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok)
        throw new Error(`Hebcal request failed (${response.status})`)
      const payload: unknown = await response.json()
      const entry = parseDafYomiResponse(payload, date)
      cache.set(date, entry)
      if (cache.size > 7) cache.delete(cache.keys().next().value as string)
      try {
        // Store only the validated event; storage is optional in private browsing.
        sessionStorage.setItem(
          CACHE_PREFIX + date,
          JSON.stringify({
            items: [
              {
                category: "dafyomi",
                date,
                title: `${entry.masechta} ${entry.daf}`,
              },
            ],
          }),
        )
        const keys = Array.from({ length: sessionStorage.length }, (_, i) =>
          sessionStorage.key(i),
        )
          .filter((key): key is string =>
            Boolean(key?.startsWith(CACHE_PREFIX)),
          )
          .sort()
        for (const key of keys.slice(0, -7)) sessionStorage.removeItem(key)
      } catch {
        // The in-memory cache still works when browser storage is unavailable.
      }
      return entry
    } finally {
      clearTimeout(timeout)
    }
  })().finally(() => pending.delete(date))
  pending.set(date, request)
  return request
}
