import { useId } from "react"
import type { CoverPhotoState } from "./useCoverPhoto"
import "./photos.css"

export default function CoverPhotoUpload({
  photo,
}: {
  photo: CoverPhotoState
}) {
  const id = useId()
  return (
    <section
      className="cover-photo-upload"
      aria-labelledby={`${id}-title`}
      aria-busy={photo.busy}
    >
      <h3 id={`${id}-title`}>
        Cover photo <span>(optional)</span>
      </h3>
      <p id={`${id}-help`}>
        Add an exterior or entrance photo to help visitors recognize the
        location. JPG, PNG, or WebP, up to 5 MB.
      </p>
      {photo.preview && (
        <img
          src={photo.preview}
          alt="Cover photo preview"
          className="cover-photo-upload__preview"
        />
      )}
      {photo.hasPhoto && !photo.preview && (
        <p role="status">Photo attached. Preview unavailable.</p>
      )}
      <div className="cover-photo-upload__actions">
        <label className="cover-photo-upload__choose">
          {photo.hasPhoto ? "Replace photo" : "Upload photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={photo.busy}
            aria-label={
              photo.hasPhoto ? "Replace cover photo" : "Upload cover photo"
            }
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) void photo.choose(file)
            }}
          />
        </label>
        {photo.hasPhoto && (
          <button type="button" onClick={photo.remove} disabled={photo.busy}>
            Remove photo
          </button>
        )}
      </div>
      {photo.busy && <p role="status">Preparing your photo…</p>}
      {photo.error && (
        <p className="cover-photo-upload__error" role="alert">
          {photo.error}
        </p>
      )}
      <small>
        Your photo uploads when you save or submit. Only upload a photo you have
        permission to publish. Photos remain private until the listing version
        is approved.
      </small>
    </section>
  )
}
