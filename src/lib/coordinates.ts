export function parseCoordinates(value: string): [number, number] | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1]), lon = Number(match[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null
}

