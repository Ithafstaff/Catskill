import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import {
  buildCallbackUrl,
  buildResendRequests,
  deliverEmail,
  escapeHtml,
  handleAuthEmail,
  renderEmail,
  verifyHookSignature,
} from "../supabase/functions/send-auth-email/emailBuilder.ts"
import {
  confirmationRedirect,
  normalizeIntent,
  parseAuthCallback,
  verifyAuthCallback,
} from "../src/lib/authCallback.ts"

const key = Buffer.from("a-long-test-signing-secret-of-at-least-32-bytes")
const secret = `v1,whsec_${key.toString("base64")}`
const config = {
  apiKey: "server-only-api-key",
  from: "Catskills Eruv <no-reply@example.test>",
  hookSecret: secret,
  publicSiteUrl: "https://community.example.test",
}
const payload = (action = "signup") => ({
  user: {
    id: "account-id",
    email: "neighbor@example.test",
    new_email: "new@example.test",
    user_metadata: { name: '<script>alert("x")</script> & neighbor' },
  },
  email_data: {
    email_action_type: action,
    token_hash: 'private/hash+&?="<>',
    token: "123456",
    site_url: "https://community.example.test",
    redirect_to: "https://community.example.test/auth/confirm?intent=mikvah",
  },
})
function signed(
  body,
  {
    timestamp = Math.floor(Date.now() / 1000),
    signingKey = key,
    id = "event-id",
  } = {},
) {
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${createHmac("sha256", signingKey).update(`${id}.${timestamp}.${body}`).digest("base64")}`,
  })
}
const hook = (data = payload(), options) => {
  const body = typeof data === "string" ? data : JSON.stringify(data)
  return new Request("https://functions.example.test/send-auth-email", {
    method: "POST",
    body,
    headers: signed(body, options),
  })
}
const ok = async () => Response.json({ id: "provider-id" })

test("Standard Webhooks verifies exact raw body, all supported secret prefixes, and multiple signatures", async () => {
  const body = JSON.stringify(payload())
  for (const candidate of [
    secret,
    `whsec_${key.toString("base64")}`,
    key.toString("base64"),
  ]) {
    assert.equal(await verifyHookSignature(body, signed(body), candidate), true)
  }
  const headers = signed(body)
  headers.set(
    "webhook-signature",
    `v1,invalid v2,unsupported ${headers.get("webhook-signature")}`,
  )
  assert.equal(await verifyHookSignature(body, headers, secret), true)
  assert.equal(await verifyHookSignature(`${body} `, headers, secret), false)
})

test("method and missing or invalid server settings fail closed without delivery", async () => {
  let calls = 0
  const send = async () => {
    calls++
    return ok()
  }
  assert.equal(
    (await handleAuthEmail(new Request("https://example.test"), config, send))
      .status,
    405,
  )
  for (const missing of ["apiKey", "from", "hookSecret"]) {
    assert.equal(
      (await handleAuthEmail(hook(), { ...config, [missing]: "" }, send))
        .status,
      503,
    )
  }
  for (const bad of [
    { hookSecret: "!!!" },
    { publicSiteUrl: "javascript:alert(1)" },
    { publicSiteUrl: "http://production.test" },
  ]) {
    assert.equal(
      (await handleAuthEmail(hook(), { ...config, ...bad }, send)).status,
      503,
    )
  }
  assert.equal(calls, 0)
})

test("missing, wrong, stale, future, and malformed signatures return 401 before parsing", async () => {
  let calls = 0
  const send = async () => {
    calls++
    return ok()
  }
  const invalid = [
    new Request("https://example.test", {
      method: "POST",
      body: "not even JSON",
    }),
    hook(payload(), { signingKey: Buffer.from("wrong secret") }),
    hook(payload(), { timestamp: Math.floor(Date.now() / 1000) - 301 }),
    hook(payload(), { timestamp: Math.floor(Date.now() / 1000) + 302 }),
  ]
  for (const request of invalid)
    assert.equal((await handleAuthEmail(request, config, send)).status, 401)
  const body = JSON.stringify(payload())
  const headers = signed(body)
  headers.set("webhook-timestamp", "NaN")
  assert.equal(await verifyHookSignature(body, headers, secret), false)
  assert.equal(calls, 0)
})

test("signed malformed, unsupported, incomplete, and oversized payloads fail without delivery", async () => {
  let calls = 0
  const send = async () => {
    calls++
    return ok()
  }
  for (const data of [
    "{",
    {},
    null,
    { user: {} },
    payload("invite"),
    { ...payload(), user: { id: "id", email: "bad" } },
    { ...payload(), email_data: { ...payload().email_data, token_hash: 8 } },
  ]) {
    assert.equal((await handleAuthEmail(hook(data), config, send)).status, 400)
  }
  assert.equal(
    (await handleAuthEmail(hook("a".repeat(128 * 1024 + 1)), config, send))
      .status,
    413,
  )
  assert.equal(calls, 0)
})

test("callbacks use trusted paths, encoded hashes, correct types, and safe intent", () => {
  for (const action of ["signup", "email", "email_change", "recovery"]) {
    const url = new URL(
      buildCallbackUrl(payload(action).email_data, config.publicSiteUrl),
    )
    assert.equal(url.origin, config.publicSiteUrl)
    assert.equal(
      url.pathname,
      action === "recovery" ? "/auth/reset-password" : "/auth/confirm",
    )
    assert.equal(
      url.searchParams.get("token_hash"),
      payload().email_data.token_hash,
    )
    assert.equal(url.searchParams.get("type"), action)
    assert.equal(
      url.searchParams.get("intent"),
      action === "recovery" ? null : "mikvah",
    )
    assert.equal(url.hash, "")
  }
})

test("malicious redirects and site URL overrides cannot choose an external origin or intent", () => {
  for (const redirect of [
    "https://evil.test/?intent=shul",
    "//evil.test",
    "javascript:alert(1)",
    "https://community.example.test.evil.test/?intent=mikvah",
    "https://user:password@community.example.test/?intent=mikvah",
    "not a url",
  ]) {
    const url = new URL(
      buildCallbackUrl(
        { ...payload().email_data, redirect_to: redirect },
        config.publicSiteUrl,
      ),
    )
    assert.equal(url.origin, config.publicSiteUrl)
    assert.equal(url.searchParams.get("intent"), null)
  }
  const url = buildCallbackUrl(
    {
      ...payload().email_data,
      site_url: "https://evil.test",
      redirect_to: "https://evil.test/?intent=shul",
    },
    config.publicSiteUrl,
  )
  assert.equal(new URL(url).origin, config.publicSiteUrl)
  assert.equal(new URL(url).searchParams.get("intent"), null)
  assert.equal(
    new URL(
      buildCallbackUrl({
        ...payload().email_data,
        redirect_to: `${config.publicSiteUrl}/?intent=https://evil.test`,
      }),
    ).searchParams.get("intent"),
    null,
  )
  assert.equal(
    new URL(
      buildCallbackUrl({
        ...payload().email_data,
        site_url: "http://localhost:8443",
        redirect_to: "http://localhost:8443/?intent=shul-form",
      }),
    ).origin,
    "http://localhost:8443",
  )
  assert.throws(() =>
    buildCallbackUrl({ ...payload().email_data, site_url: "http://evil.test" }),
  )
})

test("HTML and text templates include brand, fallback link, security/expiry guidance and escape dynamic values", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;")
  for (const action of ["signup", "email_change", "recovery"]) {
    const callback = buildCallbackUrl(payload(action).email_data)
    const message = renderEmail(
      action,
      callback,
      payload().user.user_metadata.name,
    )
    assert.ok(message.subject.includes("Catskills Eruv"))
    assert.ok(message.html.includes("CE"))
    assert.ok(message.html.includes("&lt;script&gt;"))
    assert.ok(!message.html.includes("<script>"))
    assert.ok(message.html.includes(escapeHtml(callback)))
    assert.ok(message.text.includes(callback))
    for (const body of [message.html, message.text]) {
      assert.match(body, /expires/)
      assert.match(
        body,
        /If you did not request this email, you can safely ignore it/,
      )
    }
  }
})

test("Resend requests have server authorization, both bodies, timeout signal, and stable opaque idempotency keys", async () => {
  const [first] = await buildResendRequests(payload(), config)
  const [retry] = await buildResendRequests(payload(), config)
  const different = payload()
  different.email_data.token_hash = "another private hash"
  const [next] = await buildResendRequests(different, config)
  assert.equal(first.url, "https://api.resend.com/emails")
  assert.equal(first.method, "POST")
  assert.equal(first.headers.get("Authorization"), `Bearer ${config.apiKey}`)
  assert.equal(first.headers.get("Content-Type"), "application/json")
  assert.match(first.headers.get("Idempotency-Key"), /^auth\/[0-9a-f]{64}$/)
  assert.equal(
    first.headers.get("Idempotency-Key"),
    retry.headers.get("Idempotency-Key"),
  )
  assert.notEqual(
    first.headers.get("Idempotency-Key"),
    next.headers.get("Idempotency-Key"),
  )
  assert.equal(first.signal.aborted, false)
  const body = await first.json()
  assert.equal(body.from, config.from)
  assert.deepEqual(body.to, ["neighbor@example.test"])
  assert.ok(body.html && body.text)
})

test("secure email change maps new/current recipients to the correct hashes with distinct retry keys", async () => {
  const data = payload("email_change")
  data.email_data.token_hash_new = "current-private-hash"
  const requests = await buildResendRequests(data, config)
  assert.equal(requests.length, 2)
  const messages = await Promise.all(
    requests.map((request) => request.clone().json()),
  )
  assert.deepEqual(
    messages.map((message) => message.to[0]),
    ["neighbor@example.test", "new@example.test"],
  )
  assert.match(messages[0].text, /token_hash=current-private-hash/)
  assert.ok(
    messages[1].text.includes(
      new URLSearchParams({
        token_hash: data.email_data.token_hash,
      }).toString(),
    ),
  )
  assert.notEqual(
    requests[0].headers.get("Idempotency-Key"),
    requests[1].headers.get("Idempotency-Key"),
  )
  const [single] = await buildResendRequests(payload("email_change"), config)
  assert.deepEqual((await single.json()).to, ["new@example.test"])
})

test("delivery requires an accepted provider ID; all failures return private, retryable errors without logging", async () => {
  let logged = ""
  const originalError = console.error,
    originalLog = console.log
  console.error = console.log = (...args) => {
    logged += args.join(" ")
  }
  try {
    for (const send of [
      async () =>
        Response.json({ error: "neighbor@example.test private/hash" }, {
          status: 400,
        }),
      async () => Response.json({ error: "provider detail" }, { status: 429 }),
      async () => Response.json({ error: "provider detail" }, { status: 500 }),
      async () => Response.json({}),
      async () => new Response("invalid json"),
      async () => {
        throw new DOMException(
          "private recipient token details",
          "TimeoutError",
        )
      },
      async () => {
        throw new Error("Network error with secret")
      },
    ]) {
      const response = await handleAuthEmail(hook(), config, send)
      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), {
        error: {
          http_code: 502,
          message: "Auth email delivery failed. Please retry.",
        },
      })
    }
    const success = await handleAuthEmail(hook(), config, ok)
    assert.equal(success.status, 200)
    assert.equal(success.headers.get("Cache-Control"), "no-store")
    assert.deepEqual(await success.json(), {})
    assert.equal(
      await deliverEmail(new Request("https://example.test"), ok),
      true,
    )
    assert.equal(logged, "")
  } finally {
    console.error = originalError
    console.log = originalLog
  }
})

test("a partial secure email-change delivery failure is reported for a safe idempotent retry", async () => {
  const data = payload("email_change")
  data.email_data.token_hash_new = "current-hash"
  const keys = []
  const send = async (request) => {
    keys.push(request.headers.get("Idempotency-Key"))
    return keys.length === 2 ? new Response("", { status: 500 }) : ok()
  }
  assert.equal((await handleAuthEmail(hook(data), config, send)).status, 502)
  const retryKeys = []
  assert.equal(
    (
      await handleAuthEmail(hook(data), config, async (request) => {
        retryKeys.push(request.headers.get("Idempotency-Key"))
        return ok()
      })
    ).status,
    200,
  )
  assert.deepEqual(keys, retryKeys)
})

test("frontend parsing captures query/hash callbacks and scrubs credentials/errors while preserving safe navigation", () => {
  const callback = parseAuthCallback(
    "https://example.test/auth/confirm?token_hash=a%2B%26&type=signup&intent=mikvah&keep=1#access_token=secret&refresh_token=refresh&error_description=Expired+link",
  )
  assert.equal(callback.tokenHash, "a+&")
  assert.equal(callback.accessToken, "secret")
  assert.equal(callback.refreshToken, "refresh")
  assert.equal(callback.type, "signup")
  assert.equal(callback.intent, "mikvah")
  assert.equal(callback.error, "Expired link")
  assert.equal(
    callback.cleanUrl,
    "/auth/confirm?type=signup&intent=mikvah&keep=1",
  )
  const pkce = parseAuthCallback(
    "https://example.test/auth/reset-password?code=private-code&error=denied&error_description=Expired",
  )
  assert.equal(pkce.code, "private-code")
  assert.equal(pkce.recovery, true)
  assert.equal(pkce.cleanUrl, "/auth/reset-password")
  const hash = parseAuthCallback(
    "https://example.test/auth/confirm#type=recovery&access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer",
  )
  assert.equal(hash.recovery, true)
  assert.equal(hash.cleanUrl, "/auth/confirm#type=recovery")
  assert.equal(parseAuthCallback("https://example.test/").isCallback, false)
  assert.equal(
    parseAuthCallback("https://example.test/auth/confirm?type=admin")
      .invalidType,
    true,
  )
  assert.equal(normalizeIntent("https://evil.test"), undefined)
  assert.equal(
    confirmationRedirect("https://example.test", "shul-form"),
    "https://example.test/auth/confirm?intent=shul",
  )
})

function authFixture({
  error = null,
  session = { user: { id: "id" } },
  throws = false,
} = {}) {
  const calls = []
  const method = (name) => async (value) => {
    calls.push([name, value])
    if (throws) throw new Error("private details")
    return { data: { session }, error }
  }
  return {
    calls,
    auth: {
      verifyOtp: method("otp"),
      exchangeCodeForSession: method("code"),
      setSession: method("session"),
    },
  }
}
test("frontend callback verification uses the matching Supabase method and only verified sessions permit recovery", async () => {
  for (const [path, method, argument] of [
    [
      "/auth/confirm?token_hash=hash&type=signup",
      "otp",
      { token_hash: "hash", type: "signup" },
    ],
    [
      "/auth/reset-password?token_hash=hash&type=recovery",
      "otp",
      { token_hash: "hash", type: "recovery" },
    ],
    ["/auth/reset-password?code=pkce", "code", "pkce"],
    [
      "/auth/confirm#type=recovery&access_token=access&refresh_token=refresh",
      "session",
      { access_token: "access", refresh_token: "refresh" },
    ],
  ]) {
    const f = authFixture()
    assert.deepEqual(
      await verifyAuthCallback(
        parseAuthCallback(`https://example.test${path}`),
        f.auth,
      ),
      { status: "verified" },
    )
    assert.deepEqual(f.calls, [[method, argument]])
  }
  const missingSession = authFixture({ session: null })
  assert.equal(
    (
      await verifyAuthCallback(
        parseAuthCallback("https://example.test/auth/reset-password?code=code"),
        missingSession.auth,
      )
    ).status,
    "error",
  )
  // First half of secure email change succeeds without establishing a session.
  assert.equal(
    (
      await verifyAuthCallback(
        parseAuthCallback(
          "https://example.test/auth/confirm?token_hash=hash&type=email_change",
        ),
        missingSession.auth,
      )
    ).status,
    "verified",
  )
})

test("frontend rejects errors, missing/invalid type, malformed callbacks, and non-recovery tokens on reset", async () => {
  for (const path of [
    "/auth/confirm?error_description=Expired",
    "/auth/confirm?token_hash=hash",
    "/auth/confirm?token_hash=hash&type=admin",
    "/auth/reset-password?token_hash=hash&type=signup",
    "/auth/reset-password",
    "/auth/confirm#access_token=only-access",
  ]) {
    const f = authFixture()
    const state = await verifyAuthCallback(
      parseAuthCallback(`https://example.test${path}`),
      f.auth,
    )
    assert.equal(state.status, "error")
    assert.match(state.error, /request a new email/)
    assert.equal(f.calls.length, 0)
  }
  for (const options of [
    { error: { message: "sensitive provider error" } },
    { throws: true },
  ]) {
    const f = authFixture(options)
    const state = await verifyAuthCallback(
      parseAuthCallback(
        "https://example.test/auth/confirm?token_hash=hash&type=email",
      ),
      f.auth,
    )
    assert.equal(state.status, "error")
    assert.ok(!state.error.includes("sensitive"))
  }
  assert.deepEqual(
    await verifyAuthCallback(
      parseAuthCallback("https://example.test/"),
      authFixture().auth,
    ),
    { status: "idle" },
  )
})

test("Resend timeout is 15000ms and its signal aborts delivery", async () => {
  const timeout = AbortSignal.timeout
  const controller = new AbortController()
  const durations = []
  AbortSignal.timeout = (duration) => {
    durations.push(duration)
    return controller.signal
  }
  try {
    const [request] = await buildResendRequests(payload(), config)
    assert.deepEqual(durations, [15000])
    const pending = deliverEmail(
      request,
      async (outgoing) =>
        new Promise((resolve, reject) => {
          outgoing.signal.addEventListener(
            "abort",
            () => reject(outgoing.signal.reason),
            { once: true },
          )
        }),
    )
    controller.abort(new DOMException("Private timeout detail", "TimeoutError"))
    assert.equal(await pending, false)
  } finally {
    AbortSignal.timeout = timeout
  }
})

test("callback module scrubs the address synchronously and retains captured credentials only for verification", async () => {
  const replacements = []
  const previous = globalThis.window
  globalThis.window = {
    location: {
      href: "https://example.test/auth/confirm?token_hash=private&type=signup&intent=mikvah#refresh_token=secret",
    },
    history: {
      state: { existing: true },
      replaceState: (...args) => replacements.push(args),
    },
  }
  try {
    const { initialAuthCallback } = await import(
      "../src/lib/authCallback.ts?synchronous-scrub-test"
    )
    assert.equal(initialAuthCallback.tokenHash, "private")
    assert.deepEqual(replacements, [
      [{ existing: true }, "", "/auth/confirm?type=signup&intent=mikvah"],
    ])
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
})
