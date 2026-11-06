# Pre-launch security audit

Audit date: **7 November 2026 (Asia/Manila)**. Repository baseline: `a3ed6b4`, with existing uncommitted authentication, documentation and UI work preserved.

## Executive assessment

**CONDITIONAL GO — HUMAN ACTION REQUIRED.** The audited repository has no remaining known critical or high severity finding after remediation. This is not authorization to launch the current deployment: the new migration, Edge Function changes and frontend configuration have not been deployed, and the mandatory provider/account checks below remain incomplete.

Confidence is strong for the exercised PostgreSQL permissions, validation, moderation workflow and local build. Confidence is limited for production sessions, shared caches, provider settings, backups and operational controls. No claim of complete security or legal compliance is made.

The audit inspected application source, all database migrations, both Edge Functions, authentication callbacks, browser storage, external request sites, manifests and lockfiles, Vite/Vercel configuration, repository instructions and documentation, tests, five reachable Git commits and their 94 text blobs, and generated production assets. There was no PRD or separate architecture document. No hosted records, accounts, DNS, secrets or provider configuration were changed. No production emails, purchases, aggressive scans or load tests were performed.

## Architecture and trust boundaries

| Component | Actual implementation and boundary |
| --- | --- |
| Frontend | React 19.2.4, TypeScript, Tailwind 4, Vite static SPA. Vercel configuration builds `dist/`; no application Node backend or Next.js cache exists. |
| Identity | Supabase Auth. Browser SDK persists the session in browser storage; database roles are loaded from the own-profile policy, never trusted from signup metadata. |
| Application data | Supabase Postgres/PostgREST. Twelve public application tables have RLS; direct browser DML is denied except own-profile name/phone updates. Most work uses explicitly granted RPCs. |
| Privileged code | `app_private` contains security-definer helpers, validation and the original save implementation; its schema and helpers are not executable by browser roles. Server functions fix their search path. |
| Moderation | Contributors own listings; submitted versions freeze. Admin decisions atomically update the approved publication pointer, history and notification outbox. Public reads use approved snapshots. |
| Email | Signed Send Email Hook → fixed Resend endpoint. Separate scheduler secret → notification worker → service-only claim/finish RPCs → fixed Resend endpoint. |
| External public data | Hebcal calendar, Geoapify address lookup, OpenFreeMap tiles, Google Fonts, Unsplash and Wikimedia images. Google Maps opens encoded directions in a separate tab. |
| Absent features | No payments, AI endpoints, file upload handlers, application storage buckets, ORM, realtime subscription, OAuth login, server actions, service worker or application cookie-authenticated backend. |
| Operations | Vercel deployment instructions exist; no repository CI workflow, monitoring integration or accessible backup configuration was present. |

Data flows from an untrusted browser to Supabase Auth and the Data API. Supabase must validate the token before Postgres can trust `auth.uid()`. Grants, verified-email checks, ownership checks and database admin checks form the next boundary. Browser role checks only shape the UI. Service credentials bypass ordinary RLS and remain confined to the notification function. Auth hooks trust only the signed raw payload; callback destinations are pinned to a configured/trusted origin.

Public routes: `/`, `/find`, `/shuls`, `/shuls/:id`, `/mikvahs`, `/mikvahs/:id`, `/login`, `/signup`, `/forgot`, `/verify`, and callback routes. Contributor views are SPA state plus `/contributor/shuls/:id`; administrative routes are `/admin` and `/admin/review/:id`. HTML is the same static shell for every visitor and contains no rendered account data.

## API inventory

Routes below are relative to the configured Supabase project, except the external providers. PostgREST provides the HTTP transport; application writes use POST. SQL mutation functions cannot execute their writes in read-only GET transactions. There is no arbitrary URL proxy.

| Method and route | Access, inputs and data | Controls, caching and abuse considerations |
| --- | --- | --- |
| GET/POST `/rest/v1/rpc/directory_listings` | Public; no input. Approved public listing projection. | No owner identity, review feedback, confirmations or internal notes. Ordinary public caching remains allowed. Full collection response; capacity/pagination is an operational follow-up. |
| GET/POST `/rest/v1/rpc/my_listings` | Verified user; own latest versions. | Trusted identity, ownership filter; private no-store response setting added. |
| GET/POST `/rest/v1/rpc/admin_listings` | Verified database admin; submissions and contributor contact information. | Server-side admin lookup, private no-store response setting added. |
| GET/POST `/rest/v1/rpc/listing_history` | UUID; verified owner or admin. | Ownership check; internal notes/actor information only for admins. Private no-store response setting added. |
| POST `/rest/v1/rpc/save_listing` | Verified owner; bounded JSON, UUID/version/time, submit flag and optional legacy ID. | New type/length/collection validation and 60 successful saves/account/minute. Original ownership, optimistic concurrency, submission validation and immutable snapshots retained. Ignores untrusted authority fields. Private no-store setting added. |
| POST `/rest/v1/rpc/review_listing` | Verified admin; version UUID, allowed decision, feedback/internal note. | Listing/version locks, required feedback for returns/rejections, stale decision denial, atomic outbox. No additional app rate limiter; large admin feedback remains a capacity concern. |
| POST `/rest/v1/rpc/set_listing_archived` | Verified admin; listing UUID and boolean. | Admin check, lock, approved-version restoration rule and audit event. |
| POST `/rest/v1/rpc/delete_draft` | Verified owner; listing/version UUID. | Ownership and draft-only deletion; cannot delete submitted versions. |
| POST `/rest/v1/rpc/request_account_deletion` | Verified user; no target ID accepted. | Idempotent request for manual review, not automatic Auth deletion. |
| GET/PATCH `/rest/v1/profiles` | Own profile under RLS; updates only display name and phone. | Cannot grant own admin role. New trigger bounds name to 200 and phone to 60 characters. Browser no-store; successful origin cache headers still require verification/configuration. |
| POST `/rest/v1/rpc/claim_notifications` and `/finish_notification` | Service role only; ten-message claim, bounded attempts and attempt-number lease completion. | Browser/anonymous execution denied; locks, expired-lease recovery, retry backoff, idempotency keys and five-attempt cap. |
| POST `/functions/v1/send-auth-email` | Machine hook; HMAC-SHA256 Standard Webhooks signature, timestamp within five minutes. | Raw body verification; streaming body cap 128 KiB added before verification. Signed schema validation, safe callback paths, escaped email HTML, deterministic opaque idempotency key, 15-second provider timeout, no-store responses. |
| POST `/functions/v1/process-notifications` | Machine endpoint; constant-size hash comparison of worker secret. | Minimum 32-character secret added; no browser JWT fallback, fixed provider endpoint, HTTPS dashboard link, lease completion, timeout and private no-store responses. Wrong methods return 405/Allow. |
| Supabase Auth: POST `/auth/v1/signup`, `/token` (password/refresh/PKCE), `/resend`, `/recover`, `/verify`, `/logout`; GET/PUT `/user` | Supabase-managed identity, password, verification and session APIs used by the SDK. | Local callback and failure tests passed; live email confirmation enabled and invalid token denied. Password policy, brute-force limits, expiry, revocation and live flows require provider/account testing. Browser requests use no-store. |
| GET external calendar/geocoding/map/image/font URLs | Public content and optional browser geocoding key. | Public calendar values validated and date-scoped; third-party timeouts/cancellation exist. Provider quota/origin restrictions are external. Typed addresses are shared with Geoapify. |

Other direct table reads/writes, privileged helpers and queue functions were checked in the isolated database. No extra backend endpoint was found by source inventory. The deployed provider can expose other objects/configuration not present in this repository; an authenticated catalog/infrastructure review is still required.

## Findings

Counts below group the 15 initial package advisories into one supply-chain finding; they are not 15 independently reproduced application exploits.

| Severity | Total | Fixed in repository | Partial/open |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 5 | 3 | 2 |
| Low | 2 | 2 | 0 |
| **Total** | **8** | **6** | **2** |

### SA-01 — Vulnerable build/development dependencies — High — Fixed in repository

Affected: `package.json`, `pnpm-lock.yaml`, old `package-lock.json`. The initial registry audit reported **7 high, 7 moderate and 1 low** advisories in Vite, PostCSS, nanoid and source-map-js. `pnpm why` placed the affected paths in development/build tooling. Some advisories require Windows, an exposed development server, or attacker-controlled CSS/source maps; exploitation of the public static site was not established.

Changed Vite **8.0.5 → 8.1.6**, resolved PostCSS **8.5.32** and its patched dependencies, and overrode Tailwind's pinned source-map-js to **1.2.2**. No major-version upgrade or lifecycle scripts were used. Removed the divergent npm lockfile; pnpm is the declared package manager and Vercel uses its frozen lockfile. Final registry audit: **zero advisories across 147 reported dependencies**. Frozen offline install, production build and regression tests passed.

Relevant primary advisory evidence: [Vite imported-path file exposure](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22), [PostCSS source-map file disclosure](https://github.com/advisories/GHSA-6g55-p6wh-862q), and [source-map-js event-loop denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). The latter is fixed in 1.2.2.

### SA-02 — Malformed persisted schedules can break screens — Medium — Fixed in repository

Affected: `save_listing`, nested schedule/detail fields and consumers in `AdminWorkspace`, `MinyanSchedule` and directory pages. The original SQL accepted a submitted schedule with object-valued `notes`. React consumers expect text; malformed arrays could also reach UI methods expecting arrays. Reproduced against the original migrations in a disposable transaction. A public-directory impact requires admin publication; admin review can already encounter malformed content.

Added `202611070001_security_hardening.sql`: validate nested types in drafts and submissions, text lengths, weekday values, at most 25 additional locations and 100 schedules/location, and retain the existing 200,000-byte JSON limit. The old save function is moved behind the inaccessible private schema. Existing schedule rows are preflighted; incompatible records abort migration rather than being silently changed. Original authority allowlists and transaction/ownership rules remain intact. Regression tests reproduce pre-fix acceptance, then verify rejection and workflow preservation. **Apply this new migration before launching the updated frontend.**

### SA-03 — Private-response cache policy is incomplete — Medium — Partially addressed

Affected: private listing/admin/history RPCs, direct profile reads, Auth and external cache configuration. The source had no explicit private HTTP cache policy. This was a defense gap, not a demonstrated cross-user leak. Browser state already invalidates requests and clears private collections on identity changes; the profile controller has logout/account-switch regression tests.

Added browser `cache: no-store` for private Supabase requests and transaction-local `Cache-Control: private, no-store` for sensitive read RPCs and listing saves. The public directory is exempt from browser cache suppression. Both email functions use no-store. PostgreSQL tests check the header setting in read-only transactions and user isolation, and fetch tests verify private request policy.

**Remaining:** successful hosted private responses, direct profile origin headers, Auth headers, CDN overrides/cache keys, 304 behavior, session expiry/permission changes, account switching and browser back/forward cache have not been tested with real sessions. Anonymous/invalid-token failures returned no Cache-Control header; that observation does not establish successful response behavior. Configure/review the provider or existing PostgREST pre-request hook for profile responses, then test two isolated accounts. Do not claim shared-cache isolation has passed from the database simulation alone. [PostgREST documents response headers](https://docs.postgrest.org/en/v10/api.html); [Supabase documents pre-request scope and limitations](https://supabase.com/docs/guides/api/securing-your-api).

### SA-04 — Verified accounts could save listings without an application write limit — Medium — Fixed for listing saves

Affected: `save_listing`, database write/collection growth. Originally a verified user could repeatedly create or save listings without an application limiter. Added an atomic private per-account counter for 60 successful saves per minute, independent of client-supplied owner IDs and shared across instances. The 61st successful write attempt raises `PT429`; the trusted identity and window reset are exercised in PostgreSQL tests. Failed transactions roll back their counter change; this is not a limiter for invalid attempts or a substitute for gateway quotas. Other endpoints, per-IP limits, daily quotas and large collection pagination remain operational follow-ups.

### SA-05 — Auth email body was buffered before size checking — Medium — Fixed in repository

Affected: `send-auth-email/emailBuilder.ts`. The previous `request.text()` read the full unauthenticated body before the 128 KiB check, allowing disproportionate memory consumption until platform limits intervened. Added bounded streaming reads, byte-based limits and cancellation, independent of Content-Length. Oversized input returns 413 without email delivery. Tests cover multibyte input, missing-length streaming and cancellation; signature, malformed payload, replay/idempotency and provider-failure regressions still pass. Redeploy the function separately.

### SA-06 — Arbitrary backend error messages reached the UI — Low — Fixed in repository

Affected: `src/lib/backend.ts`. The error helper previously returned any provider/database `message`. Internal diagnostics or sensitive details could be displayed to a visitor. Added an explicit static allowlist of application guidance and generic fallback, with safe Auth/rate-limit mappings. Unexpected provider, network and database diagnostics are not rendered. Tested direct and wrapped errors. No sensitive production error disclosure was observed during this audit.

### SA-07 — Browser security headers were absent from deployment configuration — Low — Fixed in repository, not yet deployed

Affected: `vercel.json`. The reachable production root had HTTPS and HSTS, but the checked response did not include CSP, frame denial, nosniff or referrer-policy headers. Added enforced base/object/frame/form restrictions, frame denial, nosniff, referrer and permissions policy. Script/connect/image/font restrictions start in **Report-Only** to avoid breaking untested maps, fonts, callback flows or deployment customizations. This report-only policy does not block scripts and has no reporting collector; review browser violations in staging before enforcement.

Only fingerprinted `/assets/` responses receive immutable caching. No blanket no-store on public assets, HSTS/subdomain changes, COEP or COOP were introduced. Actual deployed header behavior and CSP compatibility require verification after deployment. [Vercel supports these custom headers](https://vercel.com/docs/project-configuration/vercel-json).

### SA-08 — Privacy and terms controls remain prototype content — Medium — Open, human action required

Affected: signup agreement buttons in `Community.tsx`; data handling in `geoapify.ts`, `LegacyImport.tsx`, and Supabase Auth. The terms/privacy buttons show placeholder alerts rather than documents. Address searches send text to Geoapify; `geocodePublicAddress` also stores search addresses/results in localStorage for 30 days when called by the nearby-address search. Device geolocation is held in memory. Legacy browser account/listing data remains until the human removes it. Supabase sessions are persisted in JavaScript-readable browser storage by design.

Publish reviewed privacy/terms documents, disclose providers/storage/retention, decide whether manually entered search addresses should persist, and establish deletion/support/retention handling. Do not invent legal promises or claim compliance from source review. If HttpOnly session storage is required, a backend-for-frontend design would be a separate architectural change. No legal text or backend rewrite was added during this audit.

## Other hardening and controls reviewed

- **Secrets:** no matching private secret in the final working tree, reachable history or inspected local build. The live main bundle also had no tested private-key/Supabase-secret pattern or inline source map. The browser publishable key is intentionally present. New build/runtime configuration validation rejects secret/legacy keys, credential-bearing URLs, insecure remote origins and unexpected URL paths. `.gitignore` now covers private certificates/keys as well as the existing environment protections. No evidence currently requires credential rotation; the scan cannot prove no historical exposure elsewhere. Gitleaks/Semgrep were unavailable; the focused scanner is explicitly non-exhaustive.
- **Key boundaries:** Supabase publishable and restricted Geoapify browser keys are public configuration. Resend keys, hook signing secrets, worker secret and Supabase service credentials occur only in server environment lookups. No server function was bundled in the client. Public keys require real database/provider access policies; see [Supabase's key security model](https://supabase.com/docs/guides/getting-started/api-keys).
- **Authentication:** signed callbacks support OTP, PKCE and legacy hash processing, scrub credentials synchronously and pin recovery behavior to verified results. Unit tests cover unsupported/expired/error callbacks and safe destinations. Live email confirmation is required. Password hashing, session revocation, expiry, logout reuse, resets and email delivery belong to hosted Supabase and were not validated using real accounts. No live credential rotation was attempted.
- **Authorization/database:** all twelve core tables have RLS and restrictive grants in the test database; contributor role cannot read private tables, grant admin status, use private helpers or access worker leases. Own-profile RLS and column grants are enforced. Owner/admin mutation, review locks, immutable history, source attribution, version conflicts and account anonymization tests pass. Hosted role grants, default privileges, migrations, network restrictions, TLS-to-database, pooling and backups require an operator audit.
- **Injection/CORS/CSRF/SSRF:** inspected application queries are parameterized RPCs/SDK calls; dynamic SQL uses identifier formatting for fixed table names. No browser untrusted HTML/eval sink or user-selected server fetch destination was found. React text and email HTML escaping remain intact. Direct bearer-token APIs do not use ambient application cookies; machine endpoints require separate secrets/signatures and add no credentialed wildcard CORS. This does not verify provider CORS, OAuth or cookie policy. Only fixed Resend URLs are fetched server-side.
- **Uploads/storage/payments:** no implemented upload, signed private-download or payment workflow; their feature tests are NOT APPLICABLE. Existing provider buckets, if any, are NOT VERIFIED without dashboard access. Media/source URLs are imported/trusted records rather than a browser-writable upload endpoint.
- **Logging/failures:** email functions do not log recipients, feedback, token hashes, provider bodies or keys. The notification handler now returns safe private errors for thrown database failures, validates configuration, retains lease retries and requires a nonempty accepted provider ID. No production log access or alerting was available. Sanitized failure responses do not establish operational monitoring.
- **Caching/performance:** public calendar session caching is date-scoped and validated; public geocoding cache is bounded by time; no service worker or framework server cache was found. Map rendering is lazy. Build warnings remain for the roughly 716 kB main and 1.08 MB lazy map chunks (before gzip); no warning was suppressed. Unbounded listing aggregation and provider quotas need capacity monitoring.
- **Supply chain/deployment:** frozen lockfile install passes with lifecycle scripts disabled. No CI workflow was found; remote branch protection, preview secret separation, Vercel settings and provider permissions are NOT VERIFIED. Development-mode inline maps remain an intentional Figma preview feature; never deploy a development-mode build or Vite dev server as production.

## Executed verification and evidence

The full suite was initially **58/58**; the final suite is **72/72**, including nested tests. Final runtime: **Node 22.23.4**, matching `engines: 22.x`; tests also passed on the host Node 24.19.0. An official Node 22 archive was SHA-256 checked against Node's published checksum before isolated use under `/tmp`.

| Exact command or procedure | Result | Evidence / limit |
| --- | --- | --- |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts --offline` | PASS | Lockfile current; no lifecycle scripts. |
| `pnpm exec oxfmt --check` with the modified TS/JS/config paths listed in the fixes summary | PASS | All 15 applicable code files formatted. Formatter does not check SQL/Markdown/JSON in this version. |
| `pnpm typecheck` | PASS | Strict frontend/Vite TypeScript check. |
| `pnpm exec tsc -p /tmp/catskill-edge-tsconfig.json` | PASS | Both Edge entrypoints and transitive modules checked with temporary Deno global declarations and the installed Supabase types. Native Deno runtime/deployment remains NOT VERIFIED. |
| `pnpm test` | PASS | 72 tests, zero failed; calendar, auth, email, maps, moderation and security. On Node 22 use `PATH=/tmp/catskill-node22/node-v22.23.4-darwin-arm64/bin:$PATH pnpm test`. |
| `pnpm build` | PASS | Typecheck + Vite 8.1.6 production build on Node 22. Warnings: large app/map chunks only. |
| Negative build procedure: run `pnpm exec vite build --outDir /tmp/catskill-negative-build` with empty required VITE variables; repeat with synthetic invalid publishable key | PASS | Both fail closed with safe variable-name/configuration errors. No real credential was used in output. |
| `pnpm scan:secrets` | PASS within scanner rules | Working tree, environment files, build text and 94 historical text blobs; zero matches. Report files added afterward are scanned in the final pass. No entropy scan or external secret-history service. |
| Generated artifact procedure: enumerate JS and maps; check public-key presence, source-map markers and server-handler names | PASS | Five JS files, zero `.map` files, no inline source maps or server function names; intentional publishable key present. |
| `pnpm audit --json` | PASS after fixes | Initial 15 advisories; final zero. Registry results are time-specific. |
| `pnpm check:supabase --schema` | PASS, read-only live check | Auth settings 200; email confirmation required; 11 approved public records; tested private fields absent; anonymous my/admin/queue/profile requests denied 401. Does not prove deployed migrations match the repository. |
| Bounded live GET/POST denial probes, with public key only and one synthetic invalid bearer | PASS for denials | Private listing/admin/profile requests 401; invalid Auth user token 403. No successful private session inspected. Cache-Control absent on these error responses. |
| HTTPS HEAD on production root; GET root and main JS | PASS for reachability | 200; HTML revalidation caching; HSTS supplied by platform. Main JS had no tested private-key/Supabase-secret patterns or inline source map. Production source differs from audited local changes. |
| GET `/.env`, `/.git/config`, `/.figma/make/kit.html`, `/src/main.tsx` on production | PASS for tested disclosure checks | SPA HTML 200, not requested file contents; no tested credential assignments. These soft-404 rewrites are not evidence the files exist. No broad external scan. |
| Real browser, production build at `http://127.0.0.1:4173` | PASS, anonymous smoke | `/`, `/find`, `/shuls`, `/mikvahs`, `/login` rendered; `/admin` showed login; `/auth/reset-password` without a valid link denied recovery. No signup/email sent. |
| `git diff --check` and final diff review | PASS | Existing user work retained; no credential values in reports/patches. |
| Dedicated lint/security SAST tools | NOT VERIFIED | No linter script, Gitleaks or Semgrep installed. TypeScript, targeted source review and regression scanner were used; no claim of a SAST pass. |
| Hosted two-account read/write/delete, logout/expiry/cache/304/back-forward tests; live email/limits | NOT VERIFIED | Requires isolated contributor/admin accounts and provider access. SQL identities model authorization, not the hosted Auth service. |

## Mandatory follow-through before public launch

1. Back up the hosted project and verify a restore/rollback procedure. Review/apply the new additive migration in staging first; resolve any preflight failures without deleting production data or loosening validation.
2. Redeploy both email functions with the existing server-only secrets; check worker-secret length, trusted HTTPS URLs, hook signature configuration, verified Resend sender and scheduler. Prove delivery with isolated test accounts, not real users.
3. Deploy a fresh production frontend build from the reviewed source and frozen lockfile. Verify the actual security/asset cache headers, SPA routes, map/font features and callback flows. Review report-only CSP violations before expanding enforcement.
4. Test two users plus an admin: unauthorized and cross-user read/update/delete; revoked/expired/invalid tokens; old-session behavior after logout and reset; account switching; direct APIs; demoted admin; malformed payloads; safe failure messages. Then inspect successful private cache headers and test CDN/304/back-forward behavior. Profile/Auth response cache policy is still a required provider check.
5. Verify Auth password policy, login/reset/resend/signup limits and bot controls; Geoapify production origin restrictions and spending quotas; API gateway limits and collection-growth monitoring. Client pacing does not enforce provider quotas.
6. Publish real privacy/terms documents and decide retention/deletion/search-cache behavior. Resolve remaining sample religious schedules/calendar content and confirm facility contact information before presenting it as authoritative.
7. Verify deployment ownership/branch protection, preview/production isolation, database access/default grants, storage inventory, monitoring, provider/DNS/email records and an operational incident owner. None of these settings was inferred from a successful build.

Until these actions have evidence, production readiness remains conditional. No credentials were found that presently justify rotation; revoke/rotate any credential independently confirmed exposed rather than merely deleting it from source history.
