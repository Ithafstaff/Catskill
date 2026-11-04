import { useEffect, useState } from 'react'
import { getCommunityDate } from './communityDate'

export default function CommunityDate() {
  const [date, setDate] = useState(() => getCommunityDate())
  useEffect(() => {
    const refresh = () => {
      const next = getCommunityDate()
      setDate(previous => previous.civilISO === next.civilISO && previous.hebrew === next.hebrew ? previous : next)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])
  return <div className="hero__date" aria-label="Current dates in the Catskills" title="New York time. The Hebrew date changes at calculated sunset for the central Catskills.">
    <time dateTime={date.civilISO}>{date.civil}</time>
    <strong>{date.hebrew}</strong>
    <small><span className="live-dot" /> Catskills · New York time</small>
  </div>
}
