import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

test("security migration rejects malformed content and preserves authorization", async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const owner = "20000000-0000-4000-8000-000000000001"
  const other = "20000000-0000-4000-8000-000000000002"
  const admin = "20000000-0000-4000-8000-000000000003"
  const unverified = "20000000-0000-4000-8000-000000000004"
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `)
  const migrate = async (name) =>
    db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    )
  await migrate("202610290001_moderation")
  await migrate("202610290003_notification_worker")
  for (const id of [owner, other, admin, unverified]) {
    await db.query("insert into auth.users values($1,$2,$3,'{}')", [
      id,
      `${id}@example.test`,
      id === unverified ? null : new Date().toISOString(),
    ])
  }
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
  async function as(id, sql, args = []) {
    await db.exec("begin")
    try {
      await db.exec(`set local role ${id ? "authenticated" : "anon"}`)
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id || "",
      ])
      const result = (await db.query(sql, args)).rows
      await db.exec("commit")
      return result
    } catch (error) {
      await db.exec("rollback")
      throw error
    }
  }
  const schedule = {
    id: "morning",
    prayerType: "Shacharis",
    scheduleType: "weekly",
    daysOfWeek: [0, 1, 2, 3, 4, 5],
    timeType: "fixed",
    startTime: "07:00",
    notes: "",
  }
  const payload = {
    type: "Shul",
    name: "Security test",
    address: "1 Example Road",
    city: "Liberty",
    state: "NY",
    zip: "12754",
    data: { confirmed: "yes" },
    primarySchedules: [schedule],
    locations: [],
  }
  const save = async (id, value = payload, previous = null, submit = false) =>
    (
      await as(id, "select public.save_listing($1::jsonb,$2,$3,$4,$5) item", [
        JSON.stringify(value),
        previous?.id || null,
        previous?.versionId || null,
        previous?.updatedAt || null,
        submit,
      ])
    )[0].item

  await t.test(
    "pre-fix reproduction: a submitted schedule accepts object notes",
    async () => {
      await db.exec("begin; set local role authenticated")
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ])
        const invalid = (
          await db.query(
            "select public.save_listing($1::jsonb,p_submit=>true) item",
            [
              JSON.stringify({
                ...payload,
                primarySchedules: [
                  {
                    ...schedule,
                    notes: { invalid: "React cannot render this" },
                  },
                ],
              }),
            ],
          )
        ).rows[0].item
        assert.deepEqual(invalid.primarySchedules[0].notes, {
          invalid: "React cannot render this",
        })
      } finally {
        await db.exec("rollback")
      }
    },
  )
  await migrate("202611070001_security_hardening")

  await t.test(
    "malformed nested values, oversized text, invalid arrays and excess items are rejected",
    async () => {
      const invalid = [
        null,
        [],
        { ...payload, name: {} },
        { ...payload, name: "x".repeat(1001) },
        { ...payload, data: null },
        { ...payload, data: { notes: "x".repeat(10001) } },
        { ...payload, primarySchedules: {} },
        { ...payload, locations: {} },
        { ...payload, locations: Array.from({ length: 26 }, () => ({})) },
        ...[
          { notes: {} },
          { daysOfWeek: "012345" },
          { daysOfWeek: [6] },
          { daysOfWeek: ["0"] },
          { prayerType: [] },
        ].map((change) => ({
          ...payload,
          primarySchedules: [{ ...schedule, ...change }],
        })),
        {
          ...payload,
          primarySchedules: Array.from({ length: 101 }, () => schedule),
        },
        {
          ...payload,
          locations: [
            {
              name: "Room",
              address: "2 Example Road",
              schedules: [{ ...schedule, notes: {} }],
            },
          ],
        },
      ]
      for (const value of invalid) {
        await assert.rejects(
          save(owner, value, null, true),
          (error) => error.code === "22023",
        )
      }
    },
  )
  let draft
  await t.test(
    "cross-user read, update, deletion and history access are denied",
    async () => {
      draft = await save(owner)
      assert.deepEqual(
        (await as(other, "select public.my_listings() items"))[0].items,
        [],
      )
      await assert.rejects(save(other, payload, draft), /do not own/)
      await assert.rejects(
        as(other, "select public.delete_draft($1,$2)", [
          draft.id,
          draft.versionId,
        ]),
        /Access denied/,
      )
      await assert.rejects(
        as(other, "select public.listing_history($1)", [draft.id]),
        /Access denied/,
      )
      await assert.rejects(
        as(other, "select public.admin_listings()"),
        /Administrator access/,
      )
      await assert.rejects(
        as(unverified, "select public.my_listings()"),
        /verified email/,
      )
      await assert.rejects(
        as(unverified, "select public.save_listing($1)", [
          JSON.stringify(payload),
        ]),
        /verified email/,
      )
    },
  )
  await t.test(
    "all core tables have RLS; anonymous/private function and helper access is denied",
    async () => {
      const tables = (
        await db.query(
          "select tablename, rowsecurity from pg_tables where schemaname='public'",
        )
      ).rows
      assert.equal(tables.length, 12)
      assert(tables.every((table) => table.rowsecurity))
      for (const table of tables) {
        await assert.rejects(
          as(null, `select * from public.${table.tablename}`),
          /permission denied/,
        )
        if (table.tablename !== "profiles")
          await assert.rejects(
            as(owner, `select * from public.${table.tablename}`),
            /permission denied/,
          )
      }
      for (const query of [
        "my_listings()",
        "admin_listings()",
        "listing_history(null)",
        "save_listing('{}')",
        "review_listing(null,'approved')",
        "set_listing_archived(null,true)",
        "delete_draft(null,null)",
        "request_account_deletion()",
        "claim_notifications()",
        "finish_notification(null,1,true)",
      ]) {
        await assert.rejects(
          as(null, `select public.${query}`),
          /permission denied/,
        )
      }
      await assert.rejects(
        as(owner, "select app_private.save_listing('{}')"),
        /permission denied/,
      )
      await assert.rejects(
        as(owner, "select * from app_private.listing_write_limits"),
        /permission denied/,
      )
      await assert.rejects(
        as(owner, "update public.profiles set role='admin'"),
        /permission denied/,
      )
      await assert.rejects(
        as(owner, "update public.profiles set display_name=$1", [
          "x".repeat(201),
        ]),
        /length limit/,
      )
      await assert.rejects(
        as(owner, "update public.profiles set phone=$1", ["x".repeat(61)]),
        /length limit/,
      )
      assert.deepEqual(
        (await as(other, "select id from public.profiles")).map(
          (row) => row.id,
        ),
        [other],
      )
    },
  )
  await t.test(
    "private read functions set transaction-local no-store headers and isolate identities",
    async () => {
      for (const [id, query, args] of [
        [owner, "my_listings()", []],
        [admin, "admin_listings()", []],
        [owner, "listing_history($1)", [draft.id]],
      ]) {
        await db.exec("begin read only; set local role authenticated")
        try {
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
            id,
          ])
          await db.query(`select public.${query}`, args)
          const headers = (
            await db.query(
              "select current_setting('response.headers',true) value",
            )
          ).rows[0].value
          assert.deepEqual(JSON.parse(headers), [
            { "Cache-Control": "private, no-store" },
          ])
        } finally {
          await db.exec("rollback")
        }
      }
      assert.equal(
        (await as(owner, "select public.my_listings() items"))[0].items.some(
          (item) => item.id === draft.id,
        ),
        true,
      )
      assert.deepEqual(
        (await as(other, "select public.my_listings() items"))[0].items,
        [],
      )
      await assert.rejects(
        as(null, "select public.my_listings()"),
        /permission denied/,
      )
    },
  )
  await t.test(
    "60 successful saves per minute are shared per trusted identity and reset after the window",
    async () => {
      for (let i = 0; i < 60; i++) await save(other)
      await assert.rejects(save(other), (error) => error.code === "PT429")
      assert.equal(
        (await as(other, "select public.my_listings() items"))[0].items.length,
        60,
      )
      await save(owner)
      await db.query(
        "update app_private.listing_write_limits set window_started_at=now()-interval '2 minutes' where user_id=$1",
        [other],
      )
      await save(other)
    },
  )
})
