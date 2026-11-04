// Share a modest request pace between autocomplete and public address lookup.
let nextRequest = 0
export async function geoapifyRequest(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY
  if (!key) throw new Error('Address search is not configured.')
  const now = Date.now()
  const delay = Math.max(0, nextRequest - now)
  nextRequest = Math.max(now, nextRequest) + 400
  if (delay) await new Promise(resolve => setTimeout(resolve, delay))
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 15000)
  try {
    const query = new URLSearchParams({ ...params, format: 'json', apiKey: key })
    const response = await fetch(`https://api.geoapify.com/v1/geocode/${path}?${query}`, { signal: controller.signal })
    if (!response.ok) throw new Error('Address lookup is unavailable. Please try again.')
    return await response.json()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
export type GeocodedPoint = { coordinates: [number, number]; approximate: boolean }
const pending = new Map<string, Promise<GeocodedPoint | null>>()
const cache = new Map<string, GeocodedPoint>()
export async function geocodePublicAddress(address: string): Promise<GeocodedPoint | null> {
  const normalized = address.trim().toLowerCase()
  if (!normalized || /^https?:/i.test(normalized)) return null
  const storageKey = `mikvah:geocode:v1:${normalized}`
  if (cache.has(normalized)) return cache.get(normalized)!
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && Date.now() - saved.time < 30 * 86400000 && Array.isArray(saved.point?.coordinates) && saved.point.coordinates.length === 2 && saved.point.coordinates.every(Number.isFinite) && Math.abs(saved.point.coordinates[0]) <= 180 && Math.abs(saved.point.coordinates[1]) <= 90) {
      cache.set(normalized, saved.point)
      return saved.point
    }
  } catch { /* Storage may be disabled. */ }
  if (pending.has(normalized)) return pending.get(normalized)!
  const request = (async () => {
    const body = await geoapifyRequest('search', { text: address, limit: '1' })
    const item = body.results?.[0]
    if (!item || !Number.isFinite(item.lon) || !Number.isFinite(item.lat) || Math.abs(item.lon) > 180 || Math.abs(item.lat) > 90) return null
    // Never present a city/postcode centroid as the building's location.
    if (!['building', 'amenity', 'street'].includes(item.result_type) || (item.rank?.confidence ?? 0) < 0.7) return null
    const point: GeocodedPoint = { coordinates: [item.lon, item.lat], approximate: true }
    cache.set(normalized, point)
    try { localStorage.setItem(storageKey, JSON.stringify({ time: Date.now(), point })) } catch { /* Optional cache. */ }
    return point
  })()
  pending.set(normalized, request)
  try { return await request } finally { pending.delete(normalized) }
}
