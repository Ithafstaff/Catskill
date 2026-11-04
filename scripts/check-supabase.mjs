// Read-only connectivity check. Does not create users, sessions, or tables.
const projectUrl = process.env.VITE_SUPABASE_URL
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

try {
  if (!projectUrl || !publishableKey) {
    throw new Error("Set the Supabase URL and publishable key in .env.local.")
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("This check requires a browser-safe sb_publishable_ key.")
  }
  const url = new URL("/auth/v1/settings", projectUrl)
  if (url.protocol !== "https:") {
    throw new Error("Use the HTTPS URL for the hosted Supabase project.")
  }
  const response = await fetch(url, {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    throw new Error(`Supabase connection failed (HTTP ${response.status}). Check the project URL and publishable key.`)
  }
  const settings = await response.json()
  if (typeof settings.external?.email !== "boolean") {
    throw new Error("The project returned an unexpected Auth settings response.")
  }
  console.log(`Supabase Auth reached successfully (HTTP ${response.status}).`)
  console.log(`Email sign-in: ${settings.external.email ? "enabled" : "disabled"}.`)
  console.log(`Email confirmation: ${settings.mailer_autoconfirm === false ? "required" : settings.mailer_autoconfirm === true ? "not required" : "not reported"}.`)
  if (process.argv.includes("--schema")) {
    const call = (name) => fetch(new URL(`/rest/v1/rpc/${name}`, projectUrl), {
      method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(15000),
    })
    const directory = await call("directory_listings")
    if (!directory.ok) throw new Error(`Directory schema check failed (HTTP ${directory.status}). Apply the migrations first.`)
    const records = await directory.json()
    if (!Array.isArray(records) || records.some(item => item.status !== "Published" || item.ownerId || item.reviewNotes || item.data?.permission || item.data?.confirmed))
      throw new Error("The public directory projection returned unexpected private fields or statuses.")
    console.log(`Shared directory available: ${records.length} approved records. Private owner/feedback/confirmation fields excluded.`)
    for (const name of ["my_listings", "admin_listings", "claim_notifications"]) {
      const denied = await call(name)
      if (![401,403].includes(denied.status)) throw new Error(`Anonymous access to ${name} was not denied as expected (HTTP ${denied.status}).`)
      console.log(`Anonymous ${name}: denied (HTTP ${denied.status}).`)
    }
    const profile = await fetch(new URL("/rest/v1/profiles?select=role",projectUrl),{headers:{apikey:publishableKey},signal:AbortSignal.timeout(15000)})
    if (![401,403].includes(profile.status)) throw new Error("Anonymous profile access was not denied.")
    console.log("Anonymous profile access: denied.")
  }
  console.log("Email delivery and signed-in browser workflows require separate account testing.")
} catch (error) {
  console.error(error instanceof Error ? error.message : "Supabase connection failed.")
  process.exitCode = 1
}
