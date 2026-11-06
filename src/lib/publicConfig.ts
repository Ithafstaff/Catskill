/** Vite embeds these values in public JavaScript. Reject privileged keys at build and runtime. */
export function validatePublicSupabaseConfig(url: string, key: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid Supabase origin.")
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "VITE_SUPABASE_URL must be an HTTPS origin (HTTP is allowed only for localhost).",
    )
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be a browser-safe sb_publishable_ key. Never use a secret or service-role key.",
    )
  }
}
