import { handleAuthEmail } from "./emailBuilder.ts"

Deno.serve((request: Request) =>
  handleAuthEmail(request, {
    apiKey: Deno.env.get("RESEND_API_KEY"),
    from: Deno.env.get("AUTH_EMAIL_FROM") || Deno.env.get("NOTIFICATION_FROM"),
    hookSecret: Deno.env.get("SEND_EMAIL_HOOK_SECRET"),
    publicSiteUrl: Deno.env.get("PUBLIC_SITE_URL"),
  }),
)
