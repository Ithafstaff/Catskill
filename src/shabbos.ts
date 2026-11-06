import {
  CandleLightingEvent,
  HDate,
  HebrewCalendar,
  Location,
  flags,
} from "@hebcal/core"
import {
  COMMUNITY_LOCATION,
  COMMUNITY_TIMEZONE,
  getCommunityDate,
} from "./communityDate.ts"
import type { Listing } from "./Community"

export const CANDLE_LIGHTING_MINUTES = 18
export const SHABBOS_PERIODS = [
  "Friday evening",
  "Shabbos day",
  "Motzaei Shabbos",
] as const

const location = new Location(
  COMMUNITY_LOCATION.getLatitude(),
  COMMUNITY_LOCATION.getLongitude(),
  false,
  COMMUNITY_TIMEZONE,
  "Central Catskills, NY",
  "US",
)

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COMMUNITY_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
})

const civilISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

export function getShabbosCalendar(now = new Date()) {
  const [year, month, day] = getCommunityDate(now)
    .civilISO.split("-")
    .map(Number)
  // Reconstruct the New York civil date in the visitor's timezone for Hebcal.
  // Keep this week's Shabbos through Saturday; advance on Sunday in New York.
  const saturday = new Date(year, month - 1, day, 12)
  saturday.setDate(saturday.getDate() + (6 - saturday.getDay()))
  const friday = new Date(saturday)
  friday.setDate(friday.getDate() - 1)
  const events = HebrewCalendar.calendar({
    start: friday,
    end: saturday,
    location,
    il: false,
    candlelighting: true,
    candleLightingMins: CANDLE_LIGHTING_MINUTES,
    sedrot: true,
    locale: "ashkenazi",
  })
  const parsha = events.find(
    (event) => event.getFlags() & flags.PARSHA_HASHAVUA,
  )
  const holiday = events.find(
    (event) =>
      event.getDate().abs() === new HDate(saturday).abs() &&
      event.getFlags() & (flags.CHAG | flags.CHOL_HAMOED),
  )
  const candle = events.find(
    (event): event is CandleLightingEvent =>
      event instanceof CandleLightingEvent &&
      event.getDate().abs() === new HDate(friday).abs(),
  )
  if (!candle || !Number.isFinite(candle.eventTime.getTime())) {
    throw new Error("Candle-lighting calculation is unavailable")
  }
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }
  return {
    reading:
      parsha?.render("ashkenazi") ||
      holiday?.render("ashkenazi") ||
      "Torah reading unavailable",
    saturdayISO: civilISO(saturday),
    saturdayLabel: saturday.toLocaleDateString("en-US", dateOptions),
    hebrewDate: new HDate(saturday).toString(),
    fridayISO: civilISO(friday),
    fridayLabel: friday.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    candleISO: candle.eventTime.toISOString(),
    candleTime: timeFormatter.format(candle.eventTime),
  }
}

export interface ShabbosService {
  id: string
  period: string
  prayer: string
  time: string
  notes: string
}

export interface ShabbosScheduleRow {
  id: string
  listingId: string
  name: string
  address: string
  services: ShabbosService[]
}

export function getPublishedShabbosRows(
  listings: Listing[],
): ShabbosScheduleRow[] {
  return listings
    .filter(
      (listing) =>
        listing.type === "Shul" &&
        listing.status === "Published" &&
        listing.visibility !== "archived",
    )
    .flatMap((listing) =>
      [
        {
          id: "primary",
          name: listing.name,
          address: [listing.address, listing.city, listing.state]
            .filter(Boolean)
            .join(", "),
          schedules: listing.primarySchedules || [],
        },
        ...(listing.locations || []).map((place) => ({
          ...place,
          name: `${listing.name} · ${place.name}`,
          schedules: place.schedules || [],
        })),
      ]
        .map((place) => ({
          id: `${listing.id}:${place.id}`,
          listingId: listing.id,
          name: place.name,
          address: place.address,
          services: place.schedules.flatMap((schedule) => {
            if (
              schedule.scheduleType !== "shabbos" ||
              !SHABBOS_PERIODS.some(
                (period) => period === schedule.shabbosPeriod,
              )
            )
              return []
            const prayer =
              schedule.prayerType === "Other"
                ? schedule.customPrayerName?.trim()
                : schedule.prayerType
            if (!prayer) return []
            let time: string
            if (schedule.timeType === "variable") {
              time = schedule.timeDescription?.trim()
              if (!time) return []
            } else {
              if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime || ""))
                return []
              const [hours, minutes] = schedule.startTime.split(":").map(Number)
              time = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${
                hours < 12 ? "AM" : "PM"
              }`
            }
            return [
              {
                id: schedule.id,
                period: schedule.shabbosPeriod,
                prayer,
                time,
                notes: schedule.notes || "",
              },
            ]
          }),
        }))
        .filter((row) => row.services.length > 0),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}
