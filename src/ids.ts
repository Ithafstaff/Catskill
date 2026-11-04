export function createLocalId(prefix: string): string {
  const secureId = globalThis.crypto?.randomUUID?.()
  if (secureId) return `${prefix}-${secureId}`

  const randomValues = globalThis.crypto?.getRandomValues?.(new Uint32Array(2))
  const suffix = randomValues
    ? Array.from(randomValues, (value) => value.toString(36)).join("")
    : Math.random().toString(36).slice(2)

  return `${prefix}-${Date.now().toString(36)}-${suffix}`
}
