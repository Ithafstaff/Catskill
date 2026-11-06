import test from "node:test"
import assert from "node:assert/strict"
import { handleNotifications } from "../supabase/functions/process-notifications/worker.ts"

const config = {
  workerSecret: "test-worker-secret-32-characters-long",
  providerKey: "test-provider-key",
  sender: "sender@example.test",
  dashboardUrl: "https://community.example.test",
  url: "https://project.supabase.co",
  serverKey: "test-server-key",
}
const request = (secret = config.workerSecret, method = "POST") =>
  new Request("https://functions.example.test/process-notifications", {
    method,
    headers: { "x-worker-secret": secret },
  })
test("worker rejects methods, missing settings and invalid secrets before database/email access", async () => {
  const unreachable = () => {
    throw new Error("Database must not be reached")
  }
  for (const [input, settings, status] of [
    [request("", "GET"), config, 405],
    [request(""), config, 401],
    [request("wrong"), config, 401],
    [request(), { ...config, workerSecret: "" }, 503],
    [request(), { ...config, workerSecret: "short" }, 503],
    [request(), { ...config, providerKey: "" }, 503],
    [request(), { ...config, dashboardUrl: "javascript:bad" }, 503],
  ]) {
    const response = await handleNotifications(
      input,
      settings,
      unreachable,
      unreachable,
    )
    assert.equal(response.status, status)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    if (status === 405) assert.equal(response.headers.get("allow"), "POST")
  }
})
test("worker sends only fixed provider requests and completes notification leases", async () => {
  const calls = []
  const item = {
    id: "test-id",
    attempt: 1,
    kind: "approval",
    email: "recipient@example.test",
    listingName: "Example",
    feedback: "Public feedback",
  }
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return {
        data: name === "claim_notifications" ? [item] : null,
        error: null,
      }
    },
  }
  const sent = []
  const response = await handleNotifications(
    request(),
    config,
    () => db,
    async (url, init) => {
      sent.push({ url, init })
      return Response.json({ id: "provider-id" })
    },
  )
  assert.deepEqual(await response.json(), { accepted: 1, failed: 0 })
  assert.equal(sent[0].url, "https://api.resend.com/emails")
  assert.equal(sent[0].init.headers["Idempotency-Key"], "moderation/test-id")
  assert.equal(calls[1].args.p_attempt, 1)
  assert.equal(calls[1].args.p_sent, true)
})
test("worker failures are private, safe and retryable without returning diagnostics", async () => {
  const response = await handleNotifications(request(), config, () => {
    throw new Error("sensitive diagnostic")
  })
  assert.equal(response.status, 503)
  assert.equal(await response.text(), "Queue unavailable")
  const item = {
    id: "test-id",
    attempt: 2,
    kind: "rejection",
    email: "recipient@example.test",
    listingName: "Example",
    feedback: "",
  }
  const completed = []
  const db = {
    rpc: async (name, args) => {
      if (args) completed.push(args)
      return {
        data: name === "claim_notifications" ? [item] : null,
        error: null,
      }
    },
  }
  const result = await handleNotifications(
    request(),
    config,
    () => db,
    async () => {
      throw new Error("sensitive provider diagnostic")
    },
  )
  assert.deepEqual(await result.json(), { accepted: 0, failed: 1 })
  assert.equal(completed[0].p_sent, false)
})
