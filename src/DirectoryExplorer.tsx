import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import AddressAutocomplete from './AddressAutocomplete'
import { geocodePublicAddress, type GeocodedPoint } from './lib/geoapify'
import { distanceMiles, type MapPlace } from './lib/mapPlaces'
import { formatMinyanSchedule, type MinyanSchedule } from './MinyanSchedule'
import type { LocatedPlace } from './DirectoryMapCanvas'
import './maps.css'
const MapCanvas = lazy(() => import('./DirectoryMapCanvas'))
export default function DirectoryExplorer({ places, onOpen, initialQuery = '', prayer = '', compact = false, initialOrigin = null, findMode = false, prayerControls }: {
  initialOrigin?: [number, number] | null; places: MapPlace[]; onOpen: (place: MapPlace) => void; initialQuery?: string; prayer?: string; compact?: boolean; findMode?: boolean; prayerControls?: ReactNode
}) {
  const [points, setPoints] = useState<Record<string, GeocodedPoint | null>>({})
  const [query, setQuery] = useState(initialQuery)
  const [area, setArea] = useState('')
  const [origin, setOrigin] = useState<[number, number] | null>(initialOrigin)
  const [radius, setRadius] = useState(initialOrigin ? '50' : 'all')
  const [dateFilter, setDateFilter] = useState('today')
  const [timeFilter, setTimeFilter] = useState('any')
  const [selected, setSelected] = useState('')
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [reset, setReset] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const signature = places.map(place => `${place.id}:${place.address}:${place.coordinates}`).join('|')
  useEffect(() => {
    let active = true
    setLoading(true)
    setPoints({})
    void (async () => {
      const queue = [...places]
      const worker = async () => {
        while (queue.length && active) {
          const place = queue.shift()!
          let point: GeocodedPoint | null = place.coordinates ? { coordinates: place.coordinates, approximate: false } : null
          try { if (!point) point = await geocodePublicAddress(place.address) } catch { /* Show as unmapped with retry. */ }
          if (active) setPoints(current => ({ ...current, [place.id]: point }))
        }
      }
      await Promise.all([worker(), worker()])
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [signature, retry])
  const matchesSchedule = (schedule: MinyanSchedule) => {
    if (prayer && !(prayer === 'Shabbos' ? schedule.scheduleType === 'shabbos' : prayer === 'Daf Yomi' ? /daf yomi/i.test(schedule.customPrayerName) : schedule.prayerType === prayer)) return false
    if (findMode && dateFilter !== 'any') {
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date())
      const day = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday) + (dateFilter === 'tomorrow' ? 1 : 0)) % 7
      if (schedule.scheduleType === 'weekly' && !schedule.daysOfWeek?.includes(day)) return false
      if (schedule.scheduleType === 'shabbos' && !((day === 5 && schedule.shabbosPeriod === 'Friday evening') || (day === 6 && schedule.shabbosPeriod !== 'Friday evening'))) return false
    }
    if (findMode && timeFilter !== 'any') {
      if (schedule.timeType !== 'fixed' || !/^\d{2}:\d{2}$/.test(schedule.startTime)) return false
      const hour = Number(schedule.startTime.slice(0, 2))
      if (timeFilter === 'morning' && hour >= 12 || timeFilter === 'afternoon' && (hour < 12 || hour >= 17) || timeFilter === 'evening' && hour < 17) return false
    }
    return true
  }
  const filtered = useMemo(() => places.filter(place => {
    if (query && !`${place.name} ${place.address}`.toLowerCase().includes(query.toLowerCase())) return false
    if (!place.schedules.length) return !prayer && timeFilter === 'any'
    return place.schedules.some(matchesSchedule)
  }).map(place => {
    const point = points[place.id]
    return { ...place, point: point?.coordinates, approximate: point?.approximate, distance: origin && point ? distanceMiles(origin, point.coordinates) : null }
  }).filter(place => !origin || radius === 'all' || (place.distance !== null && place.distance <= Number(radius)))
    .sort((a, b) => origin ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : a.name.localeCompare(b.name)), [signature, points, query, prayer, origin, radius, dateFilter, timeFilter, findMode])
  const located: LocatedPlace[] = filtered.filter(place => place.point).map(place => ({ ...place, point: place.point!, approximate: Boolean(place.approximate) }))
  const selectedPlace = filtered.find(place => place.id === selected)
  const locate = () => {
    if (!navigator.geolocation) { setNotice('Location is unavailable in this browser. Search for an address instead.'); return }
    setLocating(true); setNotice('')
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return
      setOrigin([position.coords.longitude, position.coords.latitude]); setArea('Current location'); setLocating(false); setReset(value => value + 1)
    }, error => {
      if (!mounted.current) return
      setLocating(false)
      setNotice(error.code === 1 ? 'Location access was denied. You can search for an address instead.' : 'Your location could not be found. Search for an address instead.')
    }, { timeout: 10000, maximumAge: 60000 })
  }
  const directions = (place: MapPlace) => {
    const point = points[place.id]?.coordinates
    const destination = point ? `${point[1]},${point[0]}` : place.address
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`, '_blank', 'noopener,noreferrer')
  }
  const findAddress = async () => {
    if (!area.trim()) { setNotice('Enter an address to search nearby.'); return }
    setLocating(true); setNotice('')
    try {
      const point = await geocodePublicAddress(area)
      if (!mounted.current) return
      if (!point) { setNotice('Address not found. Choose a suggestion or try a more specific address.'); return }
      setOrigin(point.coordinates); setReset(value => value + 1)
    } catch { if (mounted.current) setNotice('Address lookup is unavailable. You can use your current location instead.') }
    finally { if (mounted.current) setLocating(false) }
  }
  return <section className={`directory-explorer${compact ? ' directory-explorer--compact' : ''}`} aria-label="Map and directory listings">
    {!compact && <div className="directory-explorer__search">
      <label className="directory-text-search">Filter listings<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, town, or ZIP" /></label>
      <AddressAutocomplete label="Search near an address" required={false} value={area} onChange={value => { setArea(value); setOrigin(null) }} onSelect={item => { setArea(item.formatted); setOrigin([item.lon, item.lat]); setNotice(''); setReset(value => value + 1) }} />
      {findMode && <button className="button directory-find-address" onClick={findAddress} disabled={locating}>Find nearby</button>}
      {findMode && prayerControls}
      {findMode && <label className="directory-filter">Date<select value={dateFilter} onChange={event => setDateFilter(event.target.value)}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="any">Any day</option></select></label>}
      {findMode && <label className="directory-filter">Time<select value={timeFilter} onChange={event => setTimeFilter(event.target.value)}><option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>}
      <button className="button button--secondary" onClick={locate} disabled={locating}>{locating ? 'Finding location…' : 'Use my location'}</button>
      <label className="directory-filter">Distance<select aria-label="Distance" value={radius} onChange={event => { setRadius(event.target.value); setNotice(event.target.value !== 'all' && !origin ? 'Choose an address suggestion or use your location to filter by distance.' : '') }}><option value="all">All distances</option>{[2,5,10,25,50,100].map(miles => <option key={miles} value={miles}>Within {miles} miles</option>)}</select></label>
      {(query || area || origin) && <button className="button button--secondary" onClick={() => { setQuery(''); setArea(''); setOrigin(null); setRadius('all'); setSelected(''); setReset(value => value + 1); setNotice('') }}>Clear search</button>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    {findMode && <p className="directory-map-note directory-filter-note">Holiday and seasonal schedules may vary; confirm dates with the shul. Time filters show fixed times only.</p>}
    <div className="directory-explorer__summary" aria-live="polite"><span>{filtered.length} {filtered.length === 1 ? 'location' : 'locations'} · {located.length} on map{loading ? ' · Locating addresses…' : ''}</span><button onClick={() => setReset(value => value + 1)}>Show all pins</button></div>
    <div className="directory-explorer__layout">
      <div className="directory-explorer__map"><Suspense fallback={<p role="status">Loading map…</p>}><MapCanvas places={located} selected={selected} onSelect={setSelected} origin={origin} reset={reset} /></Suspense>
        {selectedPlace && <div className="directory-map-selection"><strong>{selectedPlace.name}</strong><span>{selectedPlace.address}</span><div>{!compact && <button onClick={() => onOpen(selectedPlace)}>View details</button>}<button onClick={() => directions(selectedPlace)}>Directions</button><button aria-label="Close selected location" onClick={() => setSelected('')}>Close</button></div></div>}
      </div>
      <div className="directory-explorer__list" aria-label="Map results">
        {filtered.length === 0 && <div className="directory-map-empty"><h3>No matching locations</h3><p>{prayer ? 'No published schedules match this prayer. Choose All shuls to browse locations.' : 'Try a wider distance or clear your search.'}</p></div>}
        {filtered.map(place => <article key={place.id} className={`${selected === place.id ? 'is-selected ' : ''}${findMode ? 'directory-place--find' : ''}`}>
          {findMode && <div className="directory-place__schedule"><span>Schedule</span><strong>{place.schedules.filter(matchesSchedule).slice(0, 1).map(schedule => formatMinyanSchedule(schedule))[0] || 'Confirm with shul'}</strong></div>}
          <div className="directory-place__content">
          <button className="directory-place-title" aria-pressed={selected === place.id} onClick={() => setSelected(place.id)}>{place.name}</button>
          <p>{place.address}</p>
          <small>{place.distance !== null ? `${place.distance.toFixed(1)} miles in a straight line · ` : ''}{place.point ? place.approximate ? 'Approximate address location' : 'Location supplied by contributor' : loading && !(place.id in points) ? 'Locating address…' : 'Map location unavailable'}</small>
          {place.schedules.length > 0 ? <ul>{place.schedules.filter(matchesSchedule).slice(findMode ? 1 : 0).map(schedule => <li key={schedule.id}>{formatMinyanSchedule(schedule)}</li>)}</ul> : place.kind === 'Shul' && !findMode && <small>Contact the shul to confirm service times.</small>}
          <div className="directory-place-actions">{!compact && <button onClick={() => onOpen(place)}>View details</button>}<button onClick={() => directions(place)}>Directions</button></div>
          </div>
        </article>)}
      </div>
    </div>
    {places.some(place => !place.coordinates) && <p className="directory-map-note">Address-based pins are approximate; confirm the entrance before visiting. { !loading && places.some(place => !points[place.id]) && <button onClick={() => setRetry(value => value + 1)}>Retry missing locations</button> } Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>.</p>}
    {origin && <p className="directory-map-note">Distances are straight-line estimates, not walking or driving routes. Your current location is used in this browser and is not saved.</p>}
  </section>
}
