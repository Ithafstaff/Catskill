# Shared moderation backend

## Implemented boundary

The app uses Supabase Auth, shared Postgres records, verified-user RPCs, and
database authorization. Browser-local roles are never trusted. Public reads
return only the approved version, with an explicit public field projection.
Contributor records and admin review data are separate frontend collections.
Public directory reads cannot accidentally select the owner's pending draft.

The logical schema follows the versioned listing plan: profiles, listings,
versions, type-specific details, Shul locations, schedules, source attribution,
media, immutable review events and notification outbox. Type-specific detail
values and schedule values are JSONB maps to preserve the existing descriptive
forms; the server validates submitted schedules and allowlists public keys.
They can be expanded into individual typed columns as search requirements grow.
No client-supplied owner, reviewer, admin role, status, source attribution or
publication pointer is accepted as authority.

## Migrations

Apply in order to a fresh Supabase project, using its SQL Editor or the CLI:

1. `migrations/202610290001_moderation.sql`
2. `migrations/202610290002_import_directory.sql`
3. `migrations/202610290003_notification_worker.sql`

Each file is transactional. The source import is repeatable and never overwrites
reviewed records. The initial schema is intentionally not repeatable: do not
re-run it over an existing installation. Future changes need new migrations.
Source imports omit fake Shul examples and do not invent permission confirmations.
The import generator reads `src/MikvahListings.ts`; run
`node scripts/generate-source-import.mjs` only when intentionally regenerating it.

If SQL Editor was used, record those existing migrations before switching to CLI
deployment, after checking the project reference and confirming each was applied:

```bash
supabase login
supabase link --project-ref tibmytlehlumuzdehthl
supabase migration repair --status applied 202610290001 202610290002 202610290003
supabase migration list
supabase db push --dry-run
```

Do not use `db reset --linked` against this project's live data.
Keep development and production in separate projects. The dashboard's primary
branch may be labelled Production even while the whole project is used for development.

## Authentication settings

Development Site URL: `http://127.0.0.1:8443`.
Allow these exact redirects:

- `http://127.0.0.1:8443/auth/confirm`
- `http://127.0.0.1:8443/auth/reset-password`
- `http://localhost:8443/auth/confirm`
- `http://localhost:8443/auth/reset-password`

Keep email confirmation enabled. For deployment, add the matching HTTPS
production callbacks to the production project and set its Site URL. Configure
custom SMTP for confirmations/recovery to arbitrary contributor addresses.
Supabase's default sender is limited and must not be treated as production mail.

## First admin

The human administrator signs up through the website and confirms their email.
The trusted operator checks that the Auth user belongs to the intended person,
then uses SQL Editor to promote exactly that UUID:

```sql
-- Replace the UUID only after independently verifying the account.
update public.profiles
set role = 'admin', updated_at = now()
where id = 'REPLACE-WITH-VERIFIED-AUTH-USER-UUID';
```

Refresh/sign in again to reload the profile. Application admins do not need
Supabase dashboard access. Public signup metadata cannot grant admin status.

## Notification worker (prepared, requires email-provider configuration)

Moderation decisions commit independently of email. The outbox is written in
the same transaction as the decision. The prepared Edge Function uses Resend;
provider credentials and a verified sender are required before deploying it.
Auth SMTP is a separate configuration from moderation notifications.

Set server-side Edge Function secrets through the dashboard or a local ignored
secrets file using `supabase secrets set --env-file PATH`:

- `RESEND_API_KEY`: provider API key.
- `NOTIFICATION_FROM`: verified sender address/display name.
- `APP_DASHBOARD_URL`: full contributor dashboard URL; currently the site root
  followed by login/continue navigates to the contributor dashboard.
- `WORKER_SECRET`: generate a random secret of at least 32 bytes.
- `SUPABASE_SECRET_KEY`: optional server key. Otherwise the function uses the
  platform-provided `SUPABASE_SERVICE_ROLE_KEY`; never expose either in Vite.

Deploy using `supabase functions deploy process-notifications`. Its platform JWT
check is disabled because this endpoint is machine-only; it checks the
`x-worker-secret` header before any database/email access. A normal user JWT or
publishable key cannot run it. Missing configuration fails closed.

Invoke the function with POST from a trusted scheduler, supplying that header.
Store the scheduler secret in a server secret store/Vault, not source control
or frontend code. One invocation claims up to ten messages with row locks.
Claims expire after ten minutes; failures back off and stop after five attempts.
After fixing a persistent failure, a trusted operator can reset its status,
attempt count and next-attempt time. Investigate before manually retrying.

Resend requests use an idempotency key per notification. Its deduplication window
is finite (currently 24 hours); exactly-once external delivery is not guaranteed
after an ambiguous provider failure or manual retries beyond that window.
`sent` means the provider accepted the message, not confirmed inbox delivery.
No internal notes are passed to the provider. Worker logs omit recipient data,
feedback, credentials and provider response bodies.

Worker deployment, live email delivery and scheduler configuration require
separate verification once the provider is configured.

## Browser-local migration

The dashboard offers import only when the legacy local account's email matches
the authenticated account and the human confirms ownership. The backend keys
imports by authenticated user plus legacy ID, so retries do not duplicate them.
Compatible records become private drafts. Individual failures are listed and
the original localStorage remains untouched. Old browser data is not centrally
recoverable and cannot be trusted as an authenticated ownership record.

## Review behavior

- One draft or pending version per listing; submitted content and children freeze.
- Saving an edit to an approved/returned/rejected version creates a new draft.
- Approval switches the publication pointer atomically; changes requested and
  rejection leave the approved pointer unchanged.
- Pending versions cannot be edited; resubmission creates a new version.
- Admin decisions lock the listing/version and reject stale decisions.
- Admin feedback is contributor-visible; internal notes are admin-only.
- Archiving preserves history; restoring requires a previously approved version.
- Approving an archived listing keeps it archived until separately restored.
- Account deletion is a request for manual review. Trusted actual Auth deletion
  anonymizes ownership/reviewer references and preserves published history.

## Verification and backups

`pnpm test:backend` runs PostgreSQL tests for permissions, snapshots, transactional
validation, decision conflicts, source imports, archive/restore, account removal,
and notification leases. Supabase Auth is represented by a minimal test schema;
these tests do not verify the hosted Auth service or a browser login session.

`pnpm check:supabase --schema` checks the deployed public endpoint and anonymous
denials without privileged credentials. Complete a contributor/admin test from
separate browsers after the first verified accounts exist. Check signup, login,
recovery, both listing types, draft deletion, decisions/feedback, revision
isolation and notification delivery. Exercise live save/network failures too.

Before public launch, establish platform backups or scheduled encrypted logical
exports for the chosen plan. Record retention, export location, responsible
operator and restore credentials. Rehearse restoration into a separate project:
apply the schema/migration history, restore the data including Auth dependencies,
verify record counts/approved pointers and RLS, reconfigure Auth URLs and secrets,
then run the tests above. Never claim backups are working until a restore has
actually been verified. Database exports do not automatically preserve Storage
objects, provider configuration or server secrets; back those up separately.

References:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
