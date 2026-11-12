import { useState } from "react"
import useCoverPhotoUrl from "./useCoverPhotoUrl"
import "./photos.css"

export default function ReviewCoverPhoto({ path, name, onReady }: {
  path?: string | null
  name: string
  onReady?: (ready: boolean) => void
}) {
  const photo = useCoverPhotoUrl(path)
  const [failedUrl, setFailedUrl] = useState("")
  if (!path) return <p>No cover photo supplied for this version.</p>
  const failed = photo.error || Boolean(photo.url && failedUrl === photo.url)
  return <div className="review-cover-photo">
    {failed ? <p role="alert">The cover photo could not load. <button type="button" onClick={() => { setFailedUrl(""); onReady?.(false); photo.retry() }}>Retry photo</button></p>
      : photo.url ? <img src={photo.url} alt={`Submitted cover photo for ${name}`} className="cover-photo-upload__preview"
        onLoad={() => onReady?.(true)} onError={() => { setFailedUrl(photo.url); onReady?.(false) }} />
        : <p role="status">Loading cover photo…</p>}
  </div>
}
