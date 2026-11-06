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
4. `migrations/202611070001_security_hardening.sql`

Each file is transactional. The source import is repeatable and never overwrites
reviewed records. The initial schema is intentionally not repeatable: do not
re-run it over an existing installation. Future changes need new migrations.
Source imports omit fake Shul examples and do not invent permission confirmations.
The security migration validates nested schedules before saving (including drafts),
limits field lengths and collection sizes, and enforces 60 successful listing
saves per verified account per minute across API instances. Failed transactions
do not consume that allowance. It checks existing schedule shapes and aborts
without changing data if incompatible records require an operator's review.
The prior save implementation moves to the unexposed `app_private` schema;
browser roles cannot call it to bypass validation.

Private listing, admin and history RPCs set `Cache-Control: private, no-store`.
The browser also requests private Supabase resources with `cache: no-store`.
These headers do not configure Supabase Auth, direct profile responses, or an
external proxy/CDN. Before launch, verify successful private response headers
using two isolated accounts. Configure a PostgREST pre-request hook or gateway
policy for profile responses if required; inspect and compose with any existing
hook rather than replacing it blindly. Do not cache private responses at a CDN.
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
the Resend Send Email Hook below for confirmations and recovery. Supabase's
default sender is limited and must not be treated as production mail.

## Authentication email hook (Resend)

`functions/send-auth-email` replaces Supabase Auth email delivery with the
Resend HTTP API. It supports `signup`, `email`, `email_change`, and `recovery`.
It does not implement invitation or magic-link actions; do not enable those
flows without extending the hook and its tests. Keep the Email provider and
**Confirm email** enabled. When the hook is enabled, Auth uses the hook instead
of SMTP. The moderation notification worker remains a separate endpoint.

1. Verify a sending domain in Resend and create a sending API key. In Supabase
   **Authentication → Auth Hooks → Send Email Hook**, create an HTTP hook for
   `https://<project-ref>.supabase.co/functions/v1/send-auth-email`. Generate the
   signing secret there; keep it in the server secret store. Enable the hook
   only after the function is deployed with its matching signing secret.
2. Set these **Edge Function secrets**, through the Supabase dashboard or an
   ignored local secrets file (outside browser environment files):

   ```dotenv
   RESEND_API_KEY=<resend-sending-api-key>
   AUTH_EMAIL_FROM=Catskills Eruv <no-reply@your-verified-domain.example>
   SEND_EMAIL_HOOK_SECRET=v1,whsec_<base64-signing-secret-from-auth-hooks>
   PUBLIC_SITE_URL=https://your-production-domain.example
   ```

   `AUTH_EMAIL_FROM` falls back to `NOTIFICATION_FROM`. One verified sender is
   required. `PUBLIC_SITE_URL` is optional but recommended in production: when
   set, it is the sole callback origin, even if the signed payload has another
   Site URL. Without it, the signed hook's `email_data.site_url` is the trusted
   origin. Use separate secrets/projects for local development and production.
   A local example is `PUBLIC_SITE_URL=http://localhost:8443`; use that same
   hostname in the browser and Supabase Site URL.
3. From this repository, deploy and set the prepared secrets:

   ```bash
   supabase secrets set --env-file /path/to/ignored-auth-email-secrets.env
   supabase functions deploy send-auth-email
   ```

   `config.toml` disables gateway JWT verification for this machine endpoint.
   The handler instead requires **Standard Webhooks HMAC-SHA256** headers:
   `webhook-id`, `webhook-timestamp`, and `webhook-signature`. It verifies the
   exact raw body with `SEND_EMAIL_HOOK_SECRET`, accepts the `v1,whsec_` prefix,
   and rejects timestamps more than five minutes old or in the future. No
   browser JWT, publishable key, or unsigned shared-header fallback is accepted.
4. Configure **Authentication → URL Configuration** with the local redirect
   URLs above and these exact production URLs using your actual origin:

   ```text
   https://your-production-domain.example/auth/confirm
   https://your-production-domain.example/auth/confirm?intent=mikvah
   https://your-production-domain.example/auth/confirm?intent=shul
   https://your-production-domain.example/auth/reset-password
   ```

   Add the `?intent=mikvah` and `?intent=shul` confirmation variants for each
   local origin as well if testing the contributor form flows. Add preview
   origins explicitly in a separate test project; the production hook pins its
   production origin. Avoid broad wildcard production redirect rules.

The hook builds `/auth/confirm?token_hash=…&type=…` or
`/auth/reset-password?token_hash=…&type=recovery`. It ignores untrusted redirect
origins/paths and forwards only allowlisted contributor intents. Secure Email
Change sends the current address `token_hash_new` and the new address
`token_hash`, following Supabase's backwards-compatible field mapping. Both
confirmations may be required; the confirmation screen explains this.

Each message has HTML and plain text, an escaped callback URL, a fallback link,
and expiration/security guidance. Actual expiry is governed by Supabase Auth's
email OTP settings. Resend requests have a 15-second timeout and a deterministic
SHA-256 idempotency key per action, account, recipient, and token hash. Retrying
a partially delivered email change reuses each message's key. Resend's finite
idempotency window does not guarantee exactly-once delivery indefinitely.
Provider acceptance does not guarantee inbox delivery. Disable link tracking
in Resend for authentication links to avoid rewriting one-use URLs.

Non-POST requests return 405, incomplete/invalid server configuration 503,
invalid signatures 401, invalid/unsupported payloads 400, and delivery failures
502. Success returns HTTP 200 with `{}`. Error JSON uses the Auth Hook
`error: { http_code, message }` structure. Provider bodies, addresses, passwords,
tokens, hashes, and credentials are never logged or returned. Disable request
body capture in any external tracing for this endpoint. Neither
`RESEND_API_KEY` nor `SEND_EMAIL_HOOK_SECRET` belongs in any `VITE_` variable,
browser code, commit, or client bundle.

The app captures callback parameters before creating the Supabase client,
scrubs sensitive query/hash values with `replaceState`, and explicitly verifies
OTP hashes, exchanges PKCE codes, or establishes legacy hash sessions. PKCE
links require the browser that requested them (its locally stored verifier).
A normal persisted session alone does not unlock the recovery screen. Verified
recovery sessions are signed out after a successful password update; sign-out
failures have an explicit retry. Signup/resend links preserve the intended
Mikvah or Shul form. Resend buttons wait 60 seconds; Supabase's server rate
limits remain authoritative, and recovery wording avoids account enumeration.

Run `pnpm test:auth` for isolated tests with mocked provider/Auth responses.
These do not send messages or verify hosted settings. After deployment, use a
designated test account to check signup, unconfirmed login/resend, verification
and intended-form navigation, forgot/resend, expired/used links, password
update/sign-out/login, and both secure email-change confirmations. Check local
and production redirects, spam folders, Resend delivery events, and Supabase
hook status without logging link contents. No new database migration is needed;
verified-user RPC policies remain authoritative.

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
Auth email delivery uses the separate Send Email Hook described above; the
Resend API key may be shared, but caller authentication and senders are separate.

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
The handler also rejects shared secrets shorter than 32 characters and requires
an HTTPS dashboard link. All responses use `private, no-store`. Redeploy this
function separately after updating its source.

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
