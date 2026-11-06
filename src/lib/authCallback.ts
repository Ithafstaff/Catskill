export type CallbackType = "signup" | "email" | "email_change" | "recovery"
export type CallbackState = {
  status: "idle" | "verifying" | "verified" | "error"
  error?: string
}
export type AuthCallback = ReturnType<typeof parseAuthCallback>
const callbackTypes = new Set(["signup", "email", "email_change", "recovery"])

export function normalizeIntent(
  value: string | null | undefined,
): "mikvah" | "shul" | undefined {
  if (value === "mikvah" || value === "mikvah-form") return "mikvah"
  if (value === "shul" || value === "shul-form") return "shul"
  return undefined
}

export function confirmationRedirect(origin: string, intent?: string): string {
  const url = new URL("/auth/confirm", origin)
  const safeIntent = normalizeIntent(intent)
  if (safeIntent) url.searchParams.set("intent", safeIntent)
  return url.href
}

export function parseAuthCallback(href: string) {
  const url = new URL(href)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.slice(1))
  const get = (key: string) => query.get(key) || hash.get(key) || ""
  const isCallback = /^\/auth\/(confirm|reset-password)\/?$/.test(url.pathname)
  const rawType = get("type")
  const type = callbackTypes.has(rawType) ? rawType as CallbackType : undefined
  const result = {
    isCallback,
    tokenHash: get("token_hash"),
    code: get("code"),
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    type,
    invalidType: !!rawType && !type,
    recovery: type === "recovery" || /\/reset-password\/?$/.test(url.pathname),
    error: get("error_description") || get("error") || get("error_code"),
    intent: normalizeIntent(get("intent")),
  }
  const sensitive = [
    "token_hash",
    "token",
    "code",
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "error",
    "error_description",
    "error_code",
    "expires_in",
    "expires_at",
    "token_type",
  ]
  for (const key of sensitive) {
    query.delete(key)
    hash.delete(key)
  }
  url.hash = hash.toString()
  return { ...result, cleanUrl: `${url.pathname}${url.search}${url.hash}` }
}

type SessionResult = {
  data: { session: unknown }
  error: unknown
}
type CallbackAuth = {
  verifyOtp: (params: {
    token_hash: string
    type: CallbackType
  }) => PromiseLike<SessionResult>
  exchangeCodeForSession: (code: string) => PromiseLike<SessionResult>
  setSession: (tokens: {
    access_token: string
    refresh_token: string
  }) => PromiseLike<SessionResult>
}
export const callbackError =
  "This link is invalid or has expired. Please request a new email and open the latest link."

/** Explicit processing avoids racing the SDK's automatic URL consumption. */
export async function verifyAuthCallback(
  callback: AuthCallback,
  auth: CallbackAuth,
): Promise<CallbackState> {
  if (!callback.isCallback) return { status: "idle" }
  if (callback.error || callback.invalidType)
    return { status: "error", error: callbackError }
  try {
    let result: SessionResult
    if (callback.tokenHash && callback.type) {
      if (callback.recovery && callback.type !== "recovery")
        return { status: "error", error: callbackError }
      result = await auth.verifyOtp({
        token_hash: callback.tokenHash,
        type: callback.type,
      })
    } else if (callback.code && !callback.tokenHash) {
      result = await auth.exchangeCodeForSession(callback.code)
    } else if (
      callback.accessToken &&
      callback.refreshToken &&
      !callback.tokenHash
    ) {
      result = await auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      })
    } else return { status: "error", error: callbackError }
    if (result.error || (!result.data.session && (callback.recovery || callback.type !== "email_change")))
      return { status: "error", error: callbackError }
    return { status: "verified" }
  } catch {
    return { status: "error", error: callbackError }
  }
}

// Capture and scrub before the Supabase client or any React effects initialize.
export const initialAuthCallback =
  typeof window === "undefined"
    ? undefined
    : parseAuthCallback(window.location.href)
if (initialAuthCallback?.isCallback) {
  window.history.replaceState(
    window.history.state,
    "",
    initialAuthCallback.cleanUrl,
  )
}
