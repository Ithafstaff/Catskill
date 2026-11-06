import { useEffect, useState } from "react"
import { getCommunityDate } from "./communityDate"
import { getShabbosCalendar } from "./shabbos"

function readCalendar() {
  try {
    return getShabbosCalendar()
  } catch {
    return null
  }
}

export default function useShabbos() {
  const [calendar, setCalendar] = useState(readCalendar)
  useEffect(() => {
    let day = ""
    const refresh = () => {
      try {
        const nextDay = getCommunityDate().civilISO
        if (nextDay === day) return
        const next = readCalendar()
        setCalendar(next)
        if (next) day = nextDay
      } catch {
        day = ""
        setCalendar(null)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", refresh)
    window.addEventListener("pageshow", refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("pageshow", refresh)
    }
  }, [])
  return calendar
}
