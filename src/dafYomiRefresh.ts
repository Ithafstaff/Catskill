import {
  fetchDafYomiForDate,
  getCachedDafYomi,
  getNewYorkCalendarDate,
  type DafYomiEntry,
} from "./dafYomi.ts"

export type DafState = {
  date: string
  entry?: DafYomiEntry
  loading: boolean
  error: boolean
}

type Options = {
  onChange: (state: DafState) => void
  now?: () => Date
  cached?: (date: string) => DafYomiEntry | undefined
  load?: (date: string) => Promise<DafYomiEntry>
}

/** Coordinates date changes and ignores responses that arrive after midnight. */
export function createDafYomiRefreshController({
  onChange,
  now = () => new Date(),
  cached = getCachedDafYomi,
  load = fetchDafYomiForDate,
}: Options) {
  let active = true
  let currentDate = ""
  let lastAttempt = 0

  function refresh(force = false, bypassCooldown = false) {
    if (!active) return
    const instant = now()
    const date = getNewYorkCalendarDate(instant)
    const changed = date !== currentDate
    const entry = cached(date)
    if (entry) {
      currentDate = date
      onChange({ date, entry, loading: false, error: false })
      return
    }
    if (
      !changed &&
      (!force || (!bypassCooldown && instant.getTime() - lastAttempt < 60000))
    )
      return
    currentDate = date
    lastAttempt = instant.getTime()
    onChange({ date, loading: true, error: false })
    load(date)
      .then((result) => {
        if (!active) return
        if (getNewYorkCalendarDate(now()) !== date) {
          refresh()
          return
        }
        if (result.date !== date)
          throw new Error("Daf Yomi response date does not match")
        onChange({ date, entry: result, loading: false, error: false })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (getNewYorkCalendarDate(now()) !== date) {
          refresh()
          return
        }
        console.warn("Daf Yomi request unavailable:", error)
        onChange({ date, loading: false, error: true })
      })
  }

  return {
    refresh,
    stop: () => {
      active = false
    },
  }
}
