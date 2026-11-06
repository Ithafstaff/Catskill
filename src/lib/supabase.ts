import { createClient } from "@supabase/supabase-js"
import { initialAuthCallback } from "./authCallback"
import { validatePublicSupabaseConfig } from "./publicConfig"
import { createSupabaseFetch } from "./supabaseFetch"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your hosting environment and rebuild, or in .env.local and restart Vite.",
  )
}
validatePublicSupabaseConfig(supabaseUrl, supabasePublishableKey)

// This client uses the signed-in user's permissions. Admin authorization must
// be enforced by database policies and authenticated server-side operations.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  global: { fetch: createSupabaseFetch(supabaseUrl) },
  auth: { detectSessionInUrl: !initialAuthCallback?.isCallback },
})
