import type { Listing } from '../Community'
import { catskillsShuls } from '../ShulListings.ts'
import { parseCoordinates } from './coordinates.ts'

export type MapPlace = {
  id: string
  name: string
  address: string
  kind: 'Shul' | 'Mikvah'
  coordinates: [number, number] | null
  route: 'shul' | 'mikvah-detail'
  listingId: string
  schedules: NonNullable<Listing['primarySchedules']>
}
export function listingPlaces(listings: Listing[]): MapPlace[] {
  return listings.filter(item => item.status === 'Published').flatMap(item => {
    const address = [item.address, item.city, item.state, item.zip].filter(Boolean).join(', ')
    const place: MapPlace = {
      id: item.id, name: item.name, address, kind: item.type,
      coordinates: parseCoordinates(item.mapLocation), route: item.type === 'Shul' ? 'shul' : 'mikvah-detail',
      listingId: item.id, schedules: item.primarySchedules || [],
    }
    return [place, ...(item.type === 'Shul' ? item.locations || [] : []).map(location => ({
      ...place, id: `${item.id}:${location.id}`, name: `${item.name} — ${location.name}`,
      address: location.address, coordinates: parseCoordinates(location.address), schedules: location.schedules || [],
    }))]
  })
}
export function shulPlaces(listings: Listing[]): MapPlace[] {
  const published = listingPlaces(listings).filter(place => place.kind === 'Shul')
  const sourced: MapPlace[] = catskillsShuls.map(item => ({
    id: `real:${item.id}`, listingId: `real:${item.id}`, name: item.name, address: item.address,
    kind: 'Shul', route: 'shul', coordinates: null, schedules: [],
  }))
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return [...published, ...sourced.filter(item => !published.some(other => normalize(other.address) === normalize(item.address)))]
}
export function distanceMiles(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
}
