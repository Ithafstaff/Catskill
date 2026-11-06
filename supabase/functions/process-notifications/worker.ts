type Message = {
  id: string
  attempt: number
  kind: string
  email: string
  listingName: string
  feedback: string
}

export type WorkerConfig = {
  workerSecret?: string
  providerKey?: string
  sender?: string
  dashboardUrl?: string
  url?: string
  serverKey?: string
}
type Database = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown
    error: { code?: string } | null
  }>
}

export async function handleNotifications(
  request: Request,
  config: WorkerConfig,
  createDatabase: () => Database,
  send: typeof fetch = fetch,
): Promise<Response> {
  const reply = (body: string | Record<string, number>, status = 200) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type":
          typeof body === "string"
            ? "text/plain; charset=utf-8"
            : "application/json",
        ...(status === 405 ? { Allow: "POST" } : {}),
      },
    })
  if (request.method !== "POST") return reply("Method not allowed", 405)
  const workerSecret = config.workerSecret
  if (!workerSecret || workerSecret.length < 32)
    return reply("Worker is not configured", 503)
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
  if (difference !== 0) return reply("Unauthorized", 401)

  const { providerKey, sender, dashboardUrl, url, serverKey } = config
  if (!providerKey || !sender || !dashboardUrl || !url || !serverKey)
    return reply("Worker email settings are incomplete", 503)
  try {
    const target = new URL(dashboardUrl)
    if (target.protocol !== "https:" || target.username || target.password)
      return reply("Worker email settings are invalid", 503)
  } catch {
    return reply("Worker email settings are invalid", 503)
  }

  try {
    const db = createDatabase()
    const { data, error } = await db.rpc("claim_notifications")
    if (error || !Array.isArray(data)) {
      console.error("Could not claim notification batch")
      return reply("Queue unavailable", 503)
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
        const result = await send("https://api.resend.com/emails", {
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
          sent = typeof response.id === "string" && response.id.length > 0
          providerId = sent ? response.id : null
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
        console.error("Could not finish notification lease")
        failed++
      } else if (sent) accepted++
      else failed++
    }
    return reply({ accepted, failed })
  } catch {
    console.error("Notification worker request failed")
    return reply("Queue unavailable", 503)
  }
}
