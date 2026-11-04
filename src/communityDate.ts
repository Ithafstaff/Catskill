import { GeoLocation, HDate, Zmanim } from '@hebcal/core'

export const COMMUNITY_TIMEZONE = 'America/New_York'
// A fixed central Catskills reference keeps the header consistent for visitors
// in other time zones. This display does not follow a map search or device GPS.
export const COMMUNITY_LOCATION = new GeoLocation('Catskills, NY', 41.65, -74.65, 0, COMMUNITY_TIMEZONE)
const civilFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: COMMUNITY_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
})
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMMUNITY_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

let cached: { iso: string; civil: string; hebrew: string; eveningHebrew: string; sunset: number } | undefined

export function getCommunityDate(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid calendar date')
  const parts = dayFormatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value
  const civilISO = `${part('year')}-${part('month')}-${part('day')}`
  if (cached?.iso !== civilISO) {
    // HDate/Zmanim interpret Date's civil fields in the browser's own timezone.
    // Explicitly reconstruct the New York day before calling either library.
    const civilDay = new Date(Number(part('year')), Number(part('month')) - 1, Number(part('day')), 12)
    const hebrew = new HDate(civilDay)
    const sunset = new Zmanim(COMMUNITY_LOCATION, civilDay, false).sunset().getTime()
    if (!Number.isFinite(sunset)) throw new Error('Sunset is unavailable for this date')
    cached = { iso: civilISO, civil: civilFormatter.format(now), hebrew: hebrew.toString(), eveningHebrew: hebrew.next().toString(), sunset }
  }
  return {
    civil: cached.civil,
    civilISO,
    hebrew: now.getTime() >= cached.sunset ? cached.eveningHebrew : cached.hebrew,
  }
}
