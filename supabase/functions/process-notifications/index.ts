import { createClient } from "npm:@supabase/supabase-js@2.118.0"

type Message = {
  id: string
  attempt: number
  kind: string
  email: string
  listingName: string
  feedback: string
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 })
  const workerSecret = Deno.env.get("WORKER_SECRET")
  if (!workerSecret)
    return new Response("Worker is not configured", { status: 503 })
  const provided = request.headers.get("x-worker-secret") || ""
  // Compare fixed-size hashes rather than secret strings.
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    )
  const [expected, actual] = await Promise.all([
    digest(workerSecret),
    digest(provided),
  ])
  let difference = 0
  for (let i = 0; i < expected.length; i++)
    difference |= expected[i] ^ actual[i]
  if (difference !== 0) return new Response("Unauthorized", { status: 401 })

  const providerKey = Deno.env.get("RESEND_API_KEY")
  const sender = Deno.env.get("NOTIFICATION_FROM")
  const dashboardUrl = Deno.env.get("APP_DASHBOARD_URL")
  const url = Deno.env.get("SUPABASE_URL")
  const serverKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!providerKey || !sender || !dashboardUrl || !url || !serverKey)
    return new Response("Worker email settings are incomplete", { status: 503 })

  const db = createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc("claim_notifications")
  if (error) {
    console.error("Could not claim notification batch", error.code)
    return new Response("Queue unavailable", { status: 503 })
  }
  let accepted = 0,
    failed = 0
  for (const item of data as Message[]) {
    const decision =
      item.kind === "approval"
        ? "approved"
        : item.kind === "rejection"
          ? "rejected"
          : "returned for changes"
    let sent = false,
      providerId: string | null = null
    try {
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `moderation/${item.id}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [item.email],
          subject: `Listing ${decision}: ${item.listingName}`,
          text: `Your listing, ${item.listingName}, was ${decision}.\n\n${
            item.feedback ? `${item.feedback}\n\n` : ""
          }View your dashboard: ${dashboardUrl}`,
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (result.ok) {
        const response = await result.json()
        sent = typeof response.id === "string"
        providerId = response.id || null
      }
      // Never log recipient addresses, feedback, provider responses, or keys.
    } catch {
      /* Record a retryable failure below. */
    }
    const complete = await db.rpc("finish_notification", {
      p_id: item.id,
      p_attempt: item.attempt,
      p_sent: sent,
      p_provider_id: providerId,
    })
    if (complete.error) {
      console.error("Could not finish notification lease", complete.error.code)
      failed++
    } else if (sent) accepted++
    else failed++
  }
  return Response.json({ accepted, failed })
})
