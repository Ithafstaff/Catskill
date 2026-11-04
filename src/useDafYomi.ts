import { useEffect, useState } from "react"
import { getCachedDafYomi, getNewYorkCalendarDate } from "./dafYomi"
import { createDafYomiRefreshController, type DafState } from "./dafYomiRefresh"

export default function useDafYomi() {
  const [state, setState] = useState<DafState>(() => {
    const date = getNewYorkCalendarDate()
    const entry = getCachedDafYomi(date)
    return { date, entry, loading: !entry, error: false }
  })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = createDafYomiRefreshController({
      onChange: (next) =>
        setState((previous) =>
          previous.date === next.date &&
          previous.entry === next.entry &&
          previous.loading === next.loading &&
          previous.error === next.error
            ? previous
            : next,
        ),
    })
    const onVisible = () => {
      if (document.visibilityState === "visible") controller.refresh(true)
    }
    const onReturn = () => controller.refresh(true)
    const onOnline = () => controller.refresh(true, true)
    controller.refresh()
    const timer = window.setInterval(() => controller.refresh(), 30000)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onReturn)
    window.addEventListener("online", onOnline)
    window.addEventListener("pageshow", onReturn)
    return () => {
      controller.stop()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onReturn)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("pageshow", onReturn)
    }
  }, [retry])

  // Never render an earlier day's cached assignment while a refresh is pending.
  const today = getNewYorkCalendarDate()
  const current: DafState =
    state.date === today ? state : { date: today, loading: true, error: false }
  return { ...current, retry: () => setRetry((value) => value + 1) }
}
