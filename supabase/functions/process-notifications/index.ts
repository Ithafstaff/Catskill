import { createClient } from "npm:@supabase/supabase-js@2.118.0"
import { handleNotifications } from "./worker.ts"

Deno.serve((request: Request) => {
  const config = {
    workerSecret: Deno.env.get("WORKER_SECRET"),
    providerKey: Deno.env.get("RESEND_API_KEY"),
    sender: Deno.env.get("NOTIFICATION_FROM"),
    dashboardUrl: Deno.env.get("APP_DASHBOARD_URL"),
    url: Deno.env.get("SUPABASE_URL"),
    serverKey:
      Deno.env.get("SUPABASE_SECRET_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  }
  return handleNotifications(request, config, () =>
    createClient(config.url!, config.serverKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  )
})
