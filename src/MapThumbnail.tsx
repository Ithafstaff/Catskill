import { useEffect, useState } from "react"
import { Map as LibreMap, setWorkerUrl } from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
setWorkerUrl(workerUrl)

// Render one thumbnail at a time and release its WebGL context immediately.
// Cards keep ordinary images, rather than running an interactive map per card.
let queue = Promise.resolve()
const images = new Map<string, string>()
function thumbnail(point: [number, number], signal: AbortSignal): Promise<string> {
  const key = point.join(",")
  if (images.has(key)) return Promise.resolve(images.get(key)!)
  const result = queue.then(async () => {
    if (signal.aborted) throw new Error("Cancelled")
    if (images.has(key)) return images.get(key)!
    const container = document.createElement("div")
    Object.assign(container.style, { position: "fixed", left: "-10000px", top: "0", width: "640px", height: "360px", pointerEvents: "none" })
    container.setAttribute("aria-hidden", "true")
    document.body.append(container)
    let map: LibreMap | undefined
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error("Map preview unavailable")), 15000)
        const cancel = () => finish(new Error("Cancelled"))
        function finish(error?: Error) {
          clearTimeout(timeout)
          signal.removeEventListener("abort", cancel)
          if (error) reject(error)
          else {
            try { resolve(map!.getCanvas().toDataURL("image/png")) }
            catch { reject(new Error("Map preview unavailable")) }
          }
        }
        signal.addEventListener("abort", cancel, { once: true })
        try {
          map = new LibreMap({ container, style: "https://tiles.openfreemap.org/styles/liberty", center: point, zoom: 13.5, interactive: false, attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true } })
          map.once("idle", () => finish())
        } catch { finish(new Error("Map preview unavailable")) }
      })
      if (images.size >= 50) images.delete(images.keys().next().value!)
      images.set(key, image)
      return image
    } finally { map?.remove(); container.remove() }
  })
  queue = result.then(() => {}, () => {})
  return result
}

export default function MapThumbnail({ point, kind, name }: { point: [number, number]; kind: "Mikvah" | "Shul"; name: string }) {
  const [image, setImage] = useState("")
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setImage("")
    setFailed(false)
    thumbnail(point, controller.signal).then(image => {
      if (!controller.signal.aborted) setImage(image)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [point[0], point[1]])
  if (!image) return <div className="listing-media__placeholder"><span aria-hidden="true">⌖</span><small>{failed ? "Map preview unavailable" : "Loading map preview…"}</small></div>
  return <>
    <img src={image} alt={`Map showing the location of ${name}`} />
    <span className={`listing-media__pin directory-map-pin--${kind === "Mikvah" ? "mikvah" : "shul"}`} aria-hidden="true">
      <span className="directory-map-pin__body"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "Mikvah" ? <><path d="M12 3c-2.4 3.5-6 7.1-6 11a6 6 0 0 0 12 0c0-3.9-3.6-7.5-6-11Z" /><path d="M9 14a3 3 0 0 0 3 3" /></> : <><path d="M4 21V10l8-6 8 6v11H4Z" /><path d="M9 21v-7h6v7M2 10l10-8 10 8M7 10h.01M17 10h.01" /></>}
      </svg></span>
    </span>
    <span className="listing-media__attribution"><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></span>
  </>
}
