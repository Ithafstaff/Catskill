import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

test("PostgreSQL moderation boundaries and workflow", async (t) => {
  const db = new PGlite()
  const owner = "10000000-0000-4000-8000-000000000001"
  const admin = "10000000-0000-4000-8000-000000000002"
  const other = "10000000-0000-4000-8000-000000000003"
  const unverified = "10000000-0000-4000-8000-000000000004"
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `)
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610290001_moderation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610290003_notification_worker.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611070001_security_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  )
  for (const id of [owner, admin, other, unverified]) {
    await db.query(`insert into auth.users values($1,$2,$3,$4)`, [
      id,
      `${id}@example.test`,
      id === unverified ? null : new Date().toISOString(),
      { name: "Test user", role: "admin" },
    ])
  }
  await db.query(`update public.profiles set role='admin' where id=$1`, [admin])
  async function as(id, sql, params = []) {
    await db.exec(`set role ${id ? "authenticated" : "anon"}`)
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      id || "",
    ])
    try {
      return (await db.query(sql, params)).rows
    } finally {
      await db.exec("reset role")
    }
  }
  const payload = {
    type: "Mikvah",
    name: "Test Mikvah",
    address: "1 Test Road",
    city: "Liberty",
    state: "NY",
    zip: "12754",
    mapLocation: "",
    data: {
      permission: "yes",
      confirmed: "yes",
      appointmentRequired: "No",
      contactPhone: "555-0100",
      internalNote: "must not publish",
    },
  }
  const save = async (id, p, previous = null, submit = false, legacy = null) =>
    (
      await as(
        id,
        `select public.save_listing($1::jsonb,$2::uuid,$3::uuid,$4::timestamptz,$5,$6) as item`,
        [
          JSON.stringify(p),
          previous?.id || null,
          previous?.versionId || null,
          previous?.updatedAt || null,
          submit,
          legacy,
        ],
      )
    )[0].item
  let first, pending, approved
  await t.test(
    "metadata cannot create an admin; direct writes and private reads denied",
    async () => {
      const rows = await as(owner, "select role from public.profiles")
      assert.deepEqual(rows, [{ role: "contributor" }])
      await assert.rejects(
        as(owner, `update public.profiles set role='admin'`),
        /permission denied/,
      )
      await assert.rejects(
        as(owner, "select * from public.review_events"),
        /permission denied/,
      )
      await assert.rejects(
        as(other, "select public.admin_listings()"),
        /Administrator access required/,
      )
      await assert.rejects(
        as(null, "select public.my_listings()"),
        /permission denied/,
      )
      await assert.rejects(save(unverified, payload), /verified email/)
    },
  )
  await t.test(
    "drafts are private, required fields are validated transactionally",
    async () => {
      first = await save(owner, payload)
      assert.equal(first.status, "Draft")
      assert.deepEqual(
        (await as(null, "select public.directory_listings() as items"))[0]
          .items,
        [],
      )
      assert.deepEqual(
        (await as(other, "select public.my_listings() as items"))[0].items,
        [],
      )
      await assert.rejects(save(other, payload, first), /do not own/)
      await assert.rejects(
        save(owner, { ...payload, name: "  " }, first, true),
        /complete address/,
      )
      const items = (await as(owner, "select public.my_listings() as items"))[0]
        .items
      assert.equal(items[0].name, "Test Mikvah")
      pending = await save(owner, payload, first, true)
      assert.equal(pending.status, "Pending Review")
      await assert.rejects(save(owner, payload, pending), /awaiting review/)
    },
  )
  await t.test(
    "feedback required, unauthorized decisions denied, approval/outbox atomic",
    async () => {
      await assert.rejects(
        as(other, "select public.review_listing($1,$2)", [
          pending.versionId,
          "approved",
        ]),
        /Administrator access/,
      )
      await assert.rejects(
        as(admin, "select public.review_listing($1,$2)", [
          pending.versionId,
          "rejected",
        ]),
        /feedback is required/,
      )
      await as(admin, "select public.review_listing($1,$2,$3,$4)", [
        pending.versionId,
        "approved",
        "Approved.",
        "Private reviewer note",
      ])
      approved = (await as(owner, "select public.my_listings() as items"))[0]
        .items[0]
      assert.equal(approved.status, "Published")
      const publicItem = (
        await as(null, "select public.directory_listings() as items")
      )[0].items[0]
      assert.equal(publicItem.data.contactPhone, "555-0100")
      assert.equal(publicItem.data.permission, undefined)
      assert.equal(publicItem.data.internalNote, undefined)
      assert.equal(publicItem.ownerId, null)
      assert.equal(
        (await db.query("select count(*)::int as n from public.notifications"))
          .rows[0].n,
        1,
      )
      await assert.rejects(
        as(admin, "select public.review_listing($1,$2)", [
          pending.versionId,
          "approved",
        ]),
        /already decided/,
      )
      assert.equal(
        (await db.query("select count(*)::int as n from public.notifications"))
          .rows[0].n,
        1,
      )
      const history = (
        await as(owner, "select public.listing_history($1) as items", [
          approved.id,
        ])
      )[0].items
      assert(!JSON.stringify(history).includes("Private reviewer note"))
      await assert.rejects(
        as(other, "select public.listing_history($1)", [approved.id]),
        /Access denied/,
      )
    },
  )
  await t.test(
    "published versions survive revisions, changes requested and rejection",
    async () => {
      const revision = await save(
        owner,
        { ...payload, name: "Proposed new name" },
        approved,
        true,
      )
      assert.equal(
        (await as(null, "select public.directory_listings() as items"))[0]
          .items[0].name,
        "Test Mikvah",
      )
      await as(admin, "select public.review_listing($1,$2,$3)", [
        revision.versionId,
        "changes_requested",
        "Please correct the hours.",
      ])
      let latest = (await as(owner, "select public.my_listings() as items"))[0]
        .items[0]
      assert.equal(latest.reviewNotes, "Please correct the hours.")
      const resubmission = await save(
        owner,
        { ...payload, name: "Revised name" },
        latest,
        true,
      )
      assert.notEqual(resubmission.versionId, revision.versionId)
      await as(admin, "select public.review_listing($1,$2,$3)", [
        resubmission.versionId,
        "rejected",
        "Not confirmed.",
      ])
      assert.equal(
        (await as(null, "select public.directory_listings() as items"))[0]
          .items[0].name,
        "Test Mikvah",
      )
      latest = (await as(owner, "select public.my_listings() as items"))[0]
        .items[0]
      const final = await save(
        owner,
        { ...payload, name: "Approved new name" },
        latest,
        true,
      )
      await as(admin, "select public.review_listing($1,$2)", [
        final.versionId,
        "approved",
      ])
      assert.equal(
        (await as(null, "select public.directory_listings() as items"))[0]
          .items[0].name,
        "Approved new name",
      )
      await assert.rejects(save(owner, payload, latest), /changed/)
    },
  )
  await t.test(
    "archive/restore is admin-only and retains approved data",
    async () => {
      await assert.rejects(
        as(owner, "select public.set_listing_archived($1,true)", [approved.id]),
        /Administrator access/,
      )
      await as(admin, "select public.set_listing_archived($1,true)", [
        approved.id,
      ])
      assert.deepEqual(
        (await as(null, "select public.directory_listings() as items"))[0]
          .items,
        [],
      )
      await as(admin, "select public.set_listing_archived($1,false)", [
        approved.id,
      ])
      assert.equal(
        (await as(null, "select public.directory_listings() as items"))[0].items
          .length,
        1,
      )
    },
  )
  await t.test(
    "Shul primary/additional schedule snapshots validated and immutable",
    async () => {
      const schedule = {
        id: "schedule-1",
        prayerType: "Shacharis",
        scheduleType: "weekly",
        daysOfWeek: [0, 1, 2, 3, 4, 5],
        timeType: "fixed",
        startTime: "07:00",
      }
      const shul = {
        ...payload,
        type: "Shul",
        name: "Test Shul",
        primarySchedules: [schedule],
        locations: [
          {
            id: "location-1",
            name: "Side room",
            type: "Beis Medrash",
            address: "2 Test Road",
            schedules: [{ ...schedule, id: "schedule-2" }],
          },
        ],
      }
      await assert.rejects(
        save(
          owner,
          { ...shul, primarySchedules: [{ ...schedule, startTime: "25:00" }] },
          null,
          true,
        ),
        /schedule fields/,
      )
      const submitted = await save(owner, shul, null, true)
      assert.equal(submitted.primarySchedules[0].startTime, "07:00")
      assert.equal(submitted.locations[0].schedules.length, 1)
      await assert.rejects(
        db.query(
          `update public.minyan_schedules set details='{}' where location_id in (select id from public.shul_locations where version_id=$1)`,
          [submitted.versionId],
        ),
        /cannot be edited/,
      )
      await assert.rejects(
        db.query(`delete from public.listing_versions where id=$1`, [
          submitted.versionId,
        ]),
        /cannot be edited/,
      )
      await as(admin, "select public.review_listing($1,$2)", [
        submitted.versionId,
        "approved",
      ])
      assert(
        (
          await as(null, "select public.directory_listings() as items")
        )[0].items.some((x) => x.name === "Test Shul"),
      )
    },
  )
  await t.test(
    "legacy draft import is idempotent and cannot auto-publish",
    async () => {
      const a = await save(owner, payload, null, false, "legacy-test")
      const b = await save(owner, payload, null, false, "legacy-test")
      assert.equal(a.id, b.id)
      assert.equal(b.status, "Draft")
      await assert.rejects(
        as(other, "select public.delete_draft($1,$2)", [a.id, a.versionId]),
        /Access denied/,
      )
      await as(owner, "select public.delete_draft($1,$2)", [a.id, a.versionId])
    },
  )
  await t.test(
    "source import is repeatable and preserves attribution without fabricated confirmations",
    async () => {
      const source = await readFile(
        new URL(
          "../supabase/migrations/202610290002_import_directory.sql",
          import.meta.url,
        ),
        "utf8",
      )
      await db.exec(source)
      await db.exec(source)
      assert.equal(
        (await db.query("select count(*)::int n from public.listing_sources"))
          .rows[0].n,
        9,
      )
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.mikvah_details where contact_publication_confirmed_at is not null and version_id in (select published_version_id from public.listings where owner_id is null)",
          )
        ).rows[0].n,
        0,
      )
      const publicItems = (
        await as(null, "select public.directory_listings() as items")
      )[0].items
      assert.equal(
        publicItems.filter(
          (item) => item.data.sourceLabel === "Mikvah.org public directory",
        ).length,
        9,
      )
    },
  )
  await t.test(
    "notification leases are server-only and completed leases cannot be replayed",
    async () => {
      await assert.rejects(
        as(owner, "select public.claim_notifications()"),
        /permission denied/,
      )
      await db.exec("set role service_role")
      let claimed
      try {
        claimed = (
          await db.query("select public.claim_notifications() as items")
        ).rows[0].items
      } finally {
        await db.exec("reset role")
      }
      assert(claimed.length > 0)
      assert(!JSON.stringify(claimed).includes("Private reviewer note"))
      const message = claimed[0]
      await db.exec("set role service_role")
      try {
        await db.query("select public.finish_notification($1,$2,true,$3)", [
          message.id,
          message.attempt,
          "provider-123",
        ])
        await assert.rejects(
          db.query("select public.finish_notification($1,$2,true,$3)", [
            message.id,
            message.attempt,
            "provider-123",
          ]),
          /lease expired/,
        )
        assert.deepEqual(
          (await db.query("select public.claim_notifications() as items"))
            .rows[0].items,
          [],
        )
      } finally {
        await db.exec("reset role")
      }
    },
  )
  await t.test(
    "deleting an account retains published listings and anonymized review history",
    async () => {
      await db.query("delete from auth.users where id=$1", [owner])
      assert(
        (await db.query("select count(*)::int n from public.review_events"))
          .rows[0].n > 0,
      )
      assert(
        (
          await as(null, "select public.directory_listings() as items")
        )[0].items.some((item) => item.name === "Approved new name"),
      )
    },
  )
  await db.close()
})
