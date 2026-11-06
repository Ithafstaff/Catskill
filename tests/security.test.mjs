import test from "node:test"
import assert from "node:assert/strict"
import { validatePublicSupabaseConfig } from "../src/lib/publicConfig.ts"
import { createSupabaseFetch } from "../src/lib/supabaseFetch.ts"
import { readLimitedBody } from "../supabase/functions/_shared/http.ts"
import { backendError } from "../src/lib/backendError.ts"

const key = `sb_publishable_${"test".repeat(8)}`
test("public configuration rejects private, legacy and malformed keys without echoing values", () => {
  validatePublicSupabaseConfig("https://project.supabase.co", key)
  validatePublicSupabaseConfig("http://127.0.0.1:54321", key)
  for (const candidate of [
    "private-value",
    `sb_secret_${"test".repeat(8)}`,
    "eyJlegacy.token.signature",
    "",
  ]) {
    assert.throws(
      () =>
        validatePublicSupabaseConfig("https://project.supabase.co", candidate),
      (error) =>
        !error.message.includes(candidate || "never-match") &&
        /browser-safe/.test(error.message),
    )
  }
  for (const url of [
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/path",
    "https://project.supabase.co?key=value",
    "invalid",
  ]) {
    assert.throws(
      () => validatePublicSupabaseConfig(url, key),
      /VITE_SUPABASE_URL/,
    )
  }
})
test("profile, Auth and private RPC requests use no-store; public directory retains normal caching", async () => {
  const requests = []
  const send = createSupabaseFetch(
    "https://project.supabase.co",
    async (input, init) => {
      requests.push({ input, init })
      return Response.json({})
    },
  )
  for (const path of [
    "/rest/v1/profiles",
    "/auth/v1/user",
    "/rest/v1/rpc/my_listings",
    "/rest/v1/rpc/admin_listings",
    "/rest/v1/rpc/listing_history",
  ]) {
    await send(`https://project.supabase.co${path}`, {
      headers: { Authorization: "test-only" },
      cache: "force-cache",
    })
    assert.equal(requests.at(-1).init.cache, "no-store")
    assert.equal(requests.at(-1).init.headers.Authorization, "test-only")
  }
  await send(new Request("https://project.supabase.co/rest/v1/profiles"))
  assert.equal(requests.at(-1).init.cache, "no-store")
  await send(
    new URL("https://project.supabase.co/rest/v1/rpc/directory_listings"),
  )
  assert.equal(requests.at(-1).init, undefined)
})
test("body limit rejects oversized streaming input without relying on Content-Length", async () => {
  assert.equal(
    await readLimitedBody(
      new Request("https://example.test", { method: "POST", body: "é" }),
      2,
    ),
    "é",
  )
  await assert.rejects(
    readLimitedBody(
      new Request("https://example.test", { method: "POST", body: "é" }),
      1,
    ),
    RangeError,
  )
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    readLimitedBody(
      new Request("https://example.test", {
        method: "POST",
        body: stream,
        duplex: "half",
      }),
      10,
    ),
    RangeError,
  )
  assert.equal(cancelled, true)
})
test("frontend errors expose known guidance and redact unexpected provider/database diagnostics", () => {
  for (const error of [
    { code: "XX000", message: "private database diagnostic" },
    new Error("private network credential"),
    { message: "private provider payload" },
  ]) {
    assert.equal(
      backendError(error),
      "We could not complete the request. Please retry; your edits have not been cleared.",
    )
  }
  assert.equal(
    backendError({
      code: "invalid_credentials",
      message: "provider diagnostic",
    }),
    "Email or password is incorrect.",
  )
  assert.equal(
    backendError({ code: "P0001", message: "You do not own this listing." }),
    "You do not own this listing.",
  )
  assert.equal(
    backendError(new Error(backendError({ code: "invalid_credentials" }))),
    "Email or password is incorrect.",
  )
  assert.match(backendError({ code: "PT429" }), /wait a minute/)
})
