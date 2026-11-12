export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]

export function validatePhoto(
  file: {
    size: number
    type: string
  },
  bytes: Uint8Array,
): void {
  if (!PHOTO_TYPES.includes(file.type))
    throw new Error("Choose a JPG, PNG, or WebP image.")
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES)
    throw new Error("Choose an image up to 5 MB.")
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, index) => bytes[index] === byte,
  )
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  if (
    !(file.type === "image/jpeg"
      ? jpeg
      : file.type === "image/png"
        ? png
        : webp)
  ) {
    throw new Error("This file is not a valid JPG, PNG, or WebP image.")
  }
}
