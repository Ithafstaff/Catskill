import { useEffect, useRef, useState } from 'react'
import { Map as LibreMap, Marker, LngLatBounds, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapPlace } from './lib/mapPlaces'
setWorkerUrl(workerUrl)
export type LocatedPlace = MapPlace & { point: [number, number]; approximate: boolean }
export default function DirectoryMapCanvas({ places, selected, onSelect, origin, reset }: {
  places: LocatedPlace[]; selected: string; onSelect: (id: string) => void; origin: [number, number] | null; reset: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMap | null>(null)
  const markers = useRef(new Map<string, Marker>())
  const callback = useRef(onSelect)
  callback.current = onSelect
  const [error, setError] = useState('')
  useEffect(() => {
    if (!container.current) return
    try {
      const instance = new LibreMap({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [-74.65, 41.65], zoom: 8 })
      map.current = instance
      instance.addControl(new NavigationControl(), 'top-right')
      instance.on('error', () => setError('Some map tiles could not load. Listing details and directions remain available.'))
      const observer = new ResizeObserver(() => instance.resize())
      observer.observe(container.current)
      return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current.clear() }
    } catch { setError('This browser could not display the map. Use the listing details and directions below.') }
  }, [])
  const extent = places.map(place => `${place.id}:${place.point.join(',')}`).join('|')
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    markers.current.forEach(marker => marker.remove())
    markers.current.clear()
    const bounds = new LngLatBounds()
    places.forEach(place => {
      const button = document.createElement('button')
      button.className = `directory-map-pin directory-map-pin--${place.kind === 'Mikvah' ? 'mikvah' : 'shul'}`
      button.type = 'button'
      // Only fixed SVG paths go into this markup; listing text uses DOM attributes.
      const icon = place.kind === 'Mikvah'
        ? '<path d="M12 3c-2.4 3.5-6 7.1-6 11a6 6 0 0 0 12 0c0-3.9-3.6-7.5-6-11Z"/><path d="M9 14a3 3 0 0 0 3 3"/>'
        : '<path d="M4 21V10l8-6 8 6v11H4Z"/><path d="M9 21v-7h6v7M2 10l10-8 10 8M7 10h.01M17 10h.01"/>'
      button.innerHTML = `<span class="directory-map-pin__body"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icon}</svg></span>`
      button.setAttribute('aria-label', `Select ${place.kind}: ${place.name}`)
      button.title = `${place.name} · ${place.kind}`
      button.addEventListener('click', () => callback.current(place.id))
      const pin = new Marker({ element: button, anchor: 'bottom' }).setLngLat(place.point).addTo(instance)
      markers.current.set(place.id, pin)
      bounds.extend(place.point)
    })
    let originPin: Marker | undefined
    if (origin) { originPin = new Marker({ color: '#2478ae' }).setLngLat(origin).addTo(instance); originPin.getElement().setAttribute('aria-label', 'Search center'); bounds.extend(origin) }
    if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 65, maxZoom: 15, duration: 0 })
    return () => { originPin?.remove() }
  }, [extent, origin?.[0], origin?.[1], reset])
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      marker.getElement().classList.toggle('is-selected', id === selected)
      marker.getElement().setAttribute('aria-pressed', String(id === selected))
    })
    const place = places.find(item => item.id === selected)
    if (place) map.current?.easeTo({ center: place.point, duration: 300 })
  }, [selected, extent, origin?.[0], origin?.[1], reset])
  return <><div ref={container} className="directory-map-canvas" role="region" aria-label="Interactive directory map" /><div className="directory-map-legend" aria-label="Map pin legend"><span><i className="directory-map-legend__mikvah" aria-hidden="true" />Mikvah</span><span><i className="directory-map-legend__shul" aria-hidden="true" />Shul</span></div>{error && <p role="status">{error}</p>}</>
}
