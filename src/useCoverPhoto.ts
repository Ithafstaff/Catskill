import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import { MAX_PHOTO_BYTES, validatePhoto } from "./lib/photoValidation"

export const COVER_PHOTO_BUCKET = "listing-covers"

export default function useCoverPhoto(
  ownerId: string,
  initialPath?: string | null,
) {
  const [file, setFile] = useState<Blob | null>(null)
  const [path, setPath] = useState(initialPath || "")
  const [preview, setPreview] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const revision = useRef(0)
  const uploaded = useRef<{
    file: Blob
    path: string
  } | null>(null)

  useEffect(
    () => () => {
      revision.current += 1
    },
    [],
  )
  useEffect(() => {
    let cancelled = false
    if (file) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreview("")
    if (path) {
      supabase.storage
        .from(COVER_PHOTO_BUCKET)
        .createSignedUrl(path, 3600)
        .then(({ data, error }) => {
          if (cancelled) return
          if (error)
            setError(
              "The saved photo could not load. You can retry by reopening the form or choose a replacement.",
            )
          else setPreview(data.signedUrl)
        })
    }
    return () => {
      cancelled = true
    }
  }, [file, path])

  async function choose(selected: File) {
    const current = ++revision.current
    setBusy(true)
    setError("")
    let bitmap: ImageBitmap | undefined
    try {
      validatePhoto(
        selected,
        new Uint8Array(await selected.slice(0, 12).arrayBuffer()),
      )
      bitmap = await createImageBitmap(selected)
      if (bitmap.width * bitmap.height > 40000000)
        throw new Error("Choose an image smaller than 40 megapixels.")
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext("2d")
      if (!context)
        throw new Error("Your browser could not prepare this image.")
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      // Re-encode pixels to remove EXIF/location metadata and bound upload size.
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("This image could not be prepared.")),
          "image/webp",
          0.85,
        ),
      )
      if (image.size > MAX_PHOTO_BYTES) throw new Error("This image could not be reduced to 5 MB. Choose a smaller photo.")
      if (current !== revision.current) return
      setFile(image)
      uploaded.current = null
    } catch (error) {
      if (current === revision.current)
        setError(
          error instanceof Error
            ? error.message
            : "This image could not be opened.",
        )
    } finally {
      bitmap?.close()
      if (current === revision.current) setBusy(false)
    }
  }

  function remove() {
    revision.current += 1
    setFile(null)
    setPath("")
    setPreview("")
    setError("")
    setBusy(false)
    uploaded.current = null
  }

  async function resolvePath(): Promise<string> {
    if (busy) throw new Error("Please wait while your photo is prepared.")
    if (!file) return path
    if (uploaded.current?.file === file) return uploaded.current.path
    const extension = file.type === "image/webp" ? "webp" : "png"
    const objectPath = `${ownerId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from(COVER_PHOTO_BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600",
      })
    if (error) {
      throw new Error(
        "The photo could not be uploaded. Please retry, or remove it to save without a photo. The listing-covers Storage setup must be enabled in Supabase.",
      )
    }
    uploaded.current = { file, path: objectPath }
    return objectPath
  }

  return {
    preview,
    busy,
    error,
    hasPhoto: Boolean(file || path),
    choose,
    remove,
    resolvePath,
  }
}

export type CoverPhotoState = ReturnType<typeof useCoverPhoto>
