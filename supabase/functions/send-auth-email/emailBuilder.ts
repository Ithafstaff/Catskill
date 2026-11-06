import { readLimitedBody } from "../_shared/http.ts"

export type EmailAction = "signup" | "email" | "email_change" | "recovery"
export type EmailHookPayload = {
  user: {
    id: string
    email: string
    new_email?: string
    user_metadata?: { name?: string }
  }
  email_data: {
    email_action_type: EmailAction
    token_hash: string
    token_hash_new?: string
    token?: string
    token_new?: string
    site_url: string
    redirect_to?: string
  }
}
export type EmailConfig = {
  apiKey?: string
  from?: string
  hookSecret?: string
  publicSiteUrl?: string
}

const encode = new TextEncoder()
const actions = new Set(["signup", "email", "email_change", "recovery"])
const safeIntents = new Set(["mikvah", "shul", "mikvah-form", "shul-form"])

export function siteOrigin(value: string): string {
  const url = new URL(value)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error("Invalid site configuration")
  }
  return url.origin
}

export function buildCallbackUrl(
  data: EmailHookPayload["email_data"],
  publicSiteUrl?: string,
): string {
  if (!actions.has(data.email_action_type) || !data.token_hash)
    throw new Error("Invalid email action")
  // A configured production origin takes precedence over the signed hook's Site URL.
  const base = siteOrigin(publicSiteUrl || data.site_url)
  let intent: string | null = null
  try {
    const redirect = new URL(data.redirect_to || "")
    if (siteOrigin(redirect.href) === base)
      intent = redirect.searchParams.get("intent")
  } catch {
    /* Untrusted/malformed redirects fall back to the trusted origin. */
  }
  const url = new URL(
    data.email_action_type === "recovery"
      ? "/auth/reset-password"
      : "/auth/confirm",
    base,
  )
  url.searchParams.set("token_hash", data.token_hash)
  url.searchParams.set("type", data.email_action_type)
  if (
    data.email_action_type !== "recovery" &&
    intent &&
    safeIntents.has(intent)
  )
    url.searchParams.set("intent", intent)
  return url.href
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  )
}

export function renderEmail(
  action: EmailAction,
  callbackUrl: string,
  name = "",
) {
  const recovery = action === "recovery"
  const title = recovery
    ? "Reset your password"
    : action === "email_change"
      ? "Confirm your email change"
      : "Verify your email address"
  const introduction = recovery
    ? "Use the link below to choose a new password for your Catskills Eruv account."
    : action === "email_change"
      ? "Confirm this step of your email change. If confirmation is required at both addresses, open both emails to complete the change."
      : "Confirm your email to start managing your community listings."
  const greeting = name ? `Hello ${name},` : "Hello,"
  const notice =
    "This link expires according to the site's security settings and can only be used once. If it has expired, request a new email from the site."
  const security =
    "If you did not request this email, you can safely ignore it. Never share this link or your password."
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f6f3ed;color:#172b3a;font-family:Arial,sans-serif;line-height:1.6">
<table role="presentation" style="width:100%;padding:32px 16px">
<tr>
<td align="center">
<table role="presentation" style="width:100%;max-width:560px;background:#ffffff;padding:32px">
<tr>
<td>
<span style="display:inline-block;padding:12px;border:1px solid #172b3a;border-radius:50%;font-family:Georgia,serif;font-size:24px">CE</span>
<p style="font-family:Georgia,serif;font-size:20px">Catskills Eruv</p>
<h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.2">${escapeHtml(title)}</h1>
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(introduction)}</p>
<p style="margin:28px 0">
<a href="${escapeHtml(callbackUrl)}" style="display:inline-block;background:#172b3a;color:#ffffff;padding:14px 22px;text-decoration:none;font-weight:bold">${escapeHtml(title)}</a>
</p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p style="overflow-wrap:anywhere;word-break:break-all">
<a style="color:#172b3a" href="${escapeHtml(callbackUrl)}">${escapeHtml(callbackUrl)}</a>
</p>
<p>${escapeHtml(notice)}</p>
<hr style="border:0;border-top:1px solid #ddd8ce">
<p>${escapeHtml(security)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
  return {
    subject: `${title} · Catskills Eruv`,
    html,
    text: `${greeting}\n\n${title}\n\n${introduction}\n\n${callbackUrl}\n\n${notice}\n\n${security}`,
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encode.encode(value)),
  )
}
function equalBytes(expected: Uint8Array, actual: Uint8Array): boolean {
  let difference = expected.length ^ actual.length
  for (let i = 0; i < expected.length; i++)
    difference |= expected[i] ^ (actual[i] || 0)
  return difference === 0
}
function signingKey(secret: string) {
  const decoded = atob(secret.replace(/^v1,/, "").replace(/^whsec_/, ""))
  if (decoded.length < 32) throw new Error("Invalid signing secret")
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

/** Standard Webhooks signs the exact raw body, before JSON parsing. */
export async function verifyHookSignature(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const id = headers.get("webhook-id")
  const timestamp = headers.get("webhook-timestamp") || ""
  const signatures = headers.get("webhook-signature") || ""
  if (
    !id ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      signingKey(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const expected = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encode.encode(`${id}.${timestamp}.${body}`),
      ),
    )
    return signatures.split(/\s+/).some((signature) => {
      if (!signature.startsWith("v1,")) return false
      try {
        return equalBytes(
          expected,
          Uint8Array.from(atob(signature.slice(3)), (character) =>
            character.charCodeAt(0),
          ),
        )
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

function isPayload(value: unknown): value is EmailHookPayload {
  if (!value || typeof value !== "object") return false
  const { user, email_data: data } = value as EmailHookPayload
  const string = (item: unknown) => typeof item === "string" && item.length > 0
  const email = (item: unknown) =>
    string(item) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item as string)
  return (
    !!user &&
    !!data &&
    string(user.id) &&
    email(user.email) &&
    actions.has(data.email_action_type) &&
    string(data.token_hash) &&
    typeof data.site_url === "string" &&
    (data.redirect_to === undefined || typeof data.redirect_to === "string") &&
    (data.token_hash_new === undefined ||
      typeof data.token_hash_new === "string") &&
    (data.email_action_type !== "email_change" || email(user.new_email))
  )
}

export async function buildResendRequests(
  payload: EmailHookPayload,
  config: EmailConfig,
): Promise<Request[]> {
  const { user, email_data: data } = payload
  // Supabase's backwards-compatible mapping: _new is the CURRENT address's hash.
  const deliveries =
    data.email_action_type === "email_change"
      ? [
          ...(data.token_hash_new
            ? [{ email: user.email, hash: data.token_hash_new }]
            : []),
          { email: user.new_email!, hash: data.token_hash },
        ]
      : [{ email: user.email, hash: data.token_hash }]
  return Promise.all(
    deliveries.map(async ({ email, hash }) => {
      const callback = buildCallbackUrl(
        { ...data, token_hash: hash },
        config.publicSiteUrl,
      )
      const name =
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : ""
      const message = renderEmail(data.email_action_type, callback, name)
      const digest = await sha256(
        JSON.stringify([data.email_action_type, user.id, email, hash]),
      )
      const idempotencyKey = `auth/${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
      return new Request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ from: config.from, to: [email], ...message }),
        signal: AbortSignal.timeout(15000),
      })
    }),
  )
}

export async function deliverEmail(
  request: Request,
  send: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const result = await send(request)
    if (!result.ok) return false
    const body = await result.json()
    return typeof body?.id === "string" && body.id.length > 0
  } catch {
    return false
  }
}

export async function handleAuthEmail(
  request: Request,
  config: EmailConfig,
  send: typeof fetch = fetch,
): Promise<Response> {
  const failure = (status: number, message: string) =>
    Response.json({ error: { http_code: status, message } }, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 405 ? { Allow: "POST" } : {}),
      },
    })
  if (request.method !== "POST") return failure(405, "Method not allowed")
  if (
    !config.apiKey?.trim() ||
    !config.from?.trim() ||
    !config.hookSecret?.trim()
  )
    return failure(503, "Auth email settings are incomplete")
  try {
    signingKey(config.hookSecret)
    if (config.publicSiteUrl) siteOrigin(config.publicSiteUrl)
  } catch {
    return failure(503, "Auth email settings are invalid")
  }
  let body: string
  try {
    body = await readLimitedBody(request, 128 * 1024)
  } catch (error) {
    if (error instanceof RangeError)
      return failure(413, "Email payload is too large")
    return failure(400, "Could not read email payload")
  }
  if (!(await verifyHookSignature(body, request.headers, config.hookSecret)))
    return failure(401, "Unauthorized")
  let requests: Request[]
  try {
    const payload: unknown = JSON.parse(body)
    if (!isPayload(payload))
      return failure(400, "Unsupported or incomplete email payload")
    requests = await buildResendRequests(payload, config)
  } catch {
    return failure(400, "Invalid email payload or site URL")
  }
  for (const email of requests) {
    if (!(await deliverEmail(email, send)))
      return failure(502, "Auth email delivery failed. Please retry.")
  }
  // Never return or log provider bodies, addresses, token hashes, or secrets.
  return Response.json({}, { headers: { "Cache-Control": "no-store" } })
}
