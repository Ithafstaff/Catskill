import { lazy, Suspense, useEffect, useRef, useState } from "react"
import useCoverPhotoUrl from "./useCoverPhotoUrl"
import { parseCoordinates } from "./lib/coordinates"
import { geocodePublicAddress } from "./lib/geoapify"
import "./maps.css"
import "./photos.css"
const MapThumbnail = lazy(() => import("./MapThumbnail"))

export default function ListingMedia({ name, kind, address, mapLocation, photoPath, photoUrl, point }: {
  name: string
  kind: "Shul" | "Mikvah"
  address: string
  mapLocation?: string
  photoPath?: string | null
  photoUrl?: string
  point?: [number, number] | null
}) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [failedUrl, setFailedUrl] = useState("")
  const [geocoded, setGeocoded] = useState<{ address: string; point: [number, number] | null }>({ address: "", point: null })
  const photo = useCoverPhotoUrl(photoPath, visible)
  const url = photo.url || photoUrl || ""
  const hasImage = Boolean(url && url !== failedUrl)
  const waitingForPhoto = Boolean(photoPath && !photo.url && !photo.error)
  const coordinates = point || parseCoordinates(mapLocation || "") || (geocoded.address === address ? geocoded.point : null)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: "100px" })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let active = true
    if (visible && !hasImage && !waitingForPhoto && !coordinates && address) {
      geocodePublicAddress(address).then(result => {
        if (active) setGeocoded({ address, point: result?.coordinates || null })
      }).catch(() => { if (active) setGeocoded({ address, point: null }) })
    }
    return () => { active = false }
  }, [visible, hasImage, waitingForPhoto, address, coordinates?.[0], coordinates?.[1]])
  return <div className="listing-media" ref={container}>
    {hasImage ? <img src={url} alt={`Cover photo of ${name}`} loading="lazy" onError={() => setFailedUrl(url)} />
      : visible && !waitingForPhoto && coordinates ? <Suspense fallback={<div className="listing-media__placeholder">Loading map preview…</div>}><MapThumbnail point={coordinates} kind={kind} name={name} /></Suspense>
        : <div className="listing-media__placeholder"><span aria-hidden="true">⌖</span><small>{waitingForPhoto ? "Loading cover photo…" : `${kind} location`}</small></div>}
  </div>
}
