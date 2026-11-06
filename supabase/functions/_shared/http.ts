/** Read at most limit bytes, even when Content-Length is absent or dishonest. */
export async function readLimitedBody(
  request: Request,
  limit: number,
): Promise<string> {
  const length = request.headers.get("content-length")
  if (length && Number(length) > limit)
    throw new RangeError("Payload too large")
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new RangeError("Payload too large")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}
