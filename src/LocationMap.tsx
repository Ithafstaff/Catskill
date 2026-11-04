import { useEffect, useRef, useState } from 'react'
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maps.css'

setWorkerUrl(workerUrl)
import { parseCoordinates } from "./lib/coordinates"

export default function LocationMap({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const marker = useRef<Marker | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const [error, setError] = useState('')
  useEffect(() => {
    if (!container.current) return
    let instance: Map
    try {
      instance = new Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [-74.65, 41.65], zoom: 8 })
      map.current = instance
      instance.addControl(new NavigationControl(), 'top-right')
      instance.on('click', event => change.current(`${event.lngLat.lat.toFixed(6)}, ${event.lngLat.lng.toFixed(6)}`))
      instance.on('error', () => setError('The map could not fully load. You can still enter coordinates or a Google Maps link.'))
      const observer = new ResizeObserver(() => instance.resize())
      observer.observe(container.current)
      return () => { observer.disconnect(); marker.current?.remove(); marker.current = null; instance.remove(); map.current = null }
    } catch {
      setError('The map is unavailable in this browser. You can still enter coordinates or a Google Maps link.')
    }
  }, [])
  useEffect(() => {
    const coordinates = parseCoordinates(value)
    const instance = map.current
    if (!instance) return
    if (!coordinates) { marker.current?.remove(); marker.current = null; return }
    if (!marker.current) {
      const pin = new Marker({ color: '#af7a16', draggable: true }).setLngLat(coordinates).addTo(instance)
      pin.on('dragend', () => { const point = pin.getLngLat(); change.current(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`) })
      marker.current = pin
    } else marker.current.setLngLat(coordinates)
    instance.jumpTo({ center: coordinates, zoom: Math.max(instance.getZoom(), 15) })
  }, [value])
  return <div className="listing-location-map">
    <div ref={container} className="listing-location-map__canvas" role="region" aria-label="Listing location map. Click to place a pin." />
    <p>{error || 'Click the map to place a pin, or drag the pin to adjust it. Coordinates can also be entered above.'}</p>
  </div>
}
