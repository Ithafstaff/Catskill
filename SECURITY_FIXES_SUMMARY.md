# Security fixes summary

Audit date: 7 November 2026 (Asia/Manila). Launch decision: **CONDITIONAL GO — HUMAN ACTION REQUIRED**. Full evidence and unresolved risks are in `SECURITY_AUDIT_REPORT.md` and `PRODUCTION_READINESS_CHECKLIST.md`.

## Files changed by this audit

| Files | Change and reason |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | Compatible Vite 8.1.6 update; patched PostCSS/nanoid resolution; source-map-js 1.2.2 override for Tailwind's old pin. Added full-suite/security/scanner commands. Final dependency audit reports zero known advisories. |
| `package-lock.json` | Removed divergent npm lockfile. Project and Vercel already require pnpm; one frozen dependency graph is now authoritative. |
| `.gitignore` | Added private certificate/key extensions. Existing environment and Vercel ignores preserved. |
| `src/lib/publicConfig.ts`, `src/lib/supabase.ts`, `vite.config.ts` | Shared build/runtime validation requires browser-safe publishable key and HTTPS project origin; local HTTP allowed only on loopback. Never echo rejected values. |
| `src/lib/supabaseFetch.ts`, `src/lib/supabase.ts` | Private Supabase requests explicitly bypass browser HTTP cache; public directory retains ordinary caching. |
| `src/lib/backendError.ts`, `src/lib/backend.ts` | Static safe-message allowlist and generic fallback prevent arbitrary provider/database diagnostics reaching UI. Existing Auth helpers and callback changes preserved. |
| `supabase/migrations/202611070001_security_hardening.sql` | New versioned migration adds bounded nested validation, private save implementation, verified-user write limiter, profile length trigger and private read response cache headers. Preflights existing schedules without silently modifying them. Existing migrations left unchanged. |
| `supabase/functions/_shared/http.ts`, `supabase/functions/send-auth-email/emailBuilder.ts` | Streaming 128 KiB cap before signature verification/JSON parsing prevents unbounded unauthenticated body buffering. Existing signature, origin, escaping and delivery logic retained. |
| `supabase/functions/process-notifications/index.ts`, new `worker.ts` | Separate testable handler from Deno bootstrap; require long shared secret and HTTPS dashboard URL; safe private failure responses and method handling; nonempty accepted provider ID. Preserve fixed provider destination, timeout, idempotency and SQL leases. |
| `vercel.json` | Prepared browser security headers, narrow enforced CSP directives and staged report-only resource CSP. Long-lived caching only for hashed assets. |
| `scripts/security-scan.mjs` | Reproducible focused working-tree/build/history scan. Reports locations/rules only, never credential values. Explicitly not an exhaustive secret scanner. |
| `tests/security.test.mjs` | Configuration, private fetch caching, streaming body and safe error tests. |
| `tests/securityDatabase.test.mjs` | Reproduces original malformed schedule acceptance, verifies new validation and limits, cross-user restrictions, profile grants, RLS/private helper denial, private headers in read-only transactions and save rate limits. |
| `tests/notificationWorker.test.mjs` | Machine authentication/configuration/method rejection, fixed provider requests, lease completion and safe retryable failures. |
| `tests/moderation.test.mjs` | Existing full moderation workflow now runs with the new migration. |
| `README.md`, `supabase/README.md` | Document canonical package manager, security commands, new migration, behavior and deployment/verification requirements. |
| Three root security reports | Findings, evidence, limitations, explicit launch statuses and required human actions. |
| `dist/` (generated output) | Built and inspected, then restored the previously tracked output to its unchanged baseline to avoid unrelated generated Git changes. The audited build copy is `/var/folders/75/3y_tpyqd37v4p193hnxvhfym0000gn/T/catskill-audited-dist-o0p3whgz/dist`. Deployment must run a fresh build from source; the old tracked output is not the audited release. |

Existing uncommitted work in `App.tsx`, `Community.tsx`, `PasswordReset.tsx`, styles, Auth callback/hook tests and documentation was present before this audit and retained. This summary does not claim authorship of that work. The audit did not redesign pages, deploy, change DNS/provider settings, rotate credentials, send mail, create production accounts or change hosted records.

## Behavioral changes

- Malformed schedule/detail types are rejected for drafts as well as submissions. Top-level listing text is capped at 1,000 characters, detail text at 10,000 and schedule text at 4,000. Per listing: up to 25 additional locations; per location: up to 100 schedules. The existing 200,000-byte payload cap remains.
- The server, not browser-provided IDs, scopes a 60-successful-save/minute allowance to a verified user. Transaction failures do not count; gateway/IP/invalid-attempt limits still require provider configuration.
- Direct profile name/phone writes are capped at 200/60 characters. No browser can change role through these grants.
- Sensitive read RPCs set `private, no-store`; the browser uses no-store for private Supabase calls. Profile/Auth origin headers and shared-cache isolation remain required live checks.
- Builds reject legacy JWT keys and private keys in the public Supabase variable. Migrate legacy configuration to a publishable key before deploying.
- Unexpected frontend errors are generic. Known validation guidance remains readable; detailed diagnostics belong in sanitized operator tooling.
- Auth email hooks reject oversized bodies with 413 before reading them in full. The worker rejects short secrets and non-HTTPS dashboard URLs; functions must be redeployed separately.
- Vercel frame denial may intentionally prevent third-party framing of the production site. Figma's local preview configuration is untouched. The broader resource CSP remains report-only pending compatibility testing.

## Verification performed

| Command / procedure | Final result |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts --offline` | PASS; lockfile up to date. |
| `pnpm typecheck` | PASS on Node 22.23.4. |
| `pnpm test` | PASS, 72 tests, zero failed, on Node 22.23.4; also passed on host Node 24.19.0. |
| `pnpm exec tsc -p /tmp/catskill-edge-tsconfig.json` | PASS; temporary Deno globals and npm module mapping check both Edge entrypoints. Native Edge deployment unverified. |
| `pnpm build` | PASS on Node 22; large app/map chunk warnings retained and explained. |
| Negative configuration builds | PASS; empty required variables and synthetic invalid public key stop the build. |
| `pnpm audit --json` | PASS after remediation; 15 initial advisories reduced to zero. |
| `pnpm scan:secrets` | PASS within focused pattern scope; zero private secret matches in current text/artifacts and 94 historical blobs. |
| Build artifact inspection | PASS; five JS outputs, zero map files or inline maps, no server handlers, intentional public publishable key. |
| `pnpm check:supabase --schema` | PASS; confirmation required, 11 approved records, tested private fields absent, anonymous private routes denied. |
| Bounded live denial/disclosure probes | PASS for tested cases; 401/403 on private/invalid-token requests; tested config/source URLs return SPA shell rather than files. Successful private cache responses unverified. |
| Browser smoke of built app on port 4173 | PASS; public directories/login render, admin shows login, unverified reset blocked. No real-account/email actions. |
| `git diff --check` and final review | PASS; no introduced whitespace error or secret value. |

Formatting command (the 15 supported code files passed):

```bash
pnpm exec oxfmt --check src/lib/publicConfig.ts src/lib/supabaseFetch.ts src/lib/supabase.ts src/lib/backend.ts src/lib/backendError.ts vite.config.ts supabase/functions/_shared/http.ts supabase/functions/send-auth-email/emailBuilder.ts supabase/functions/process-notifications/index.ts supabase/functions/process-notifications/worker.ts tests/security.test.mjs tests/securityDatabase.test.mjs tests/notificationWorker.test.mjs tests/moderation.test.mjs scripts/security-scan.mjs package.json vercel.json
```

The configured formatter version handles the TS/JS paths but does not count the JSON files as formatted output. JSON was parsed for validity. SQL was executed in PostgreSQL; Markdown was reviewed. No dedicated linter or security SAST tool was installed, and none is reported as passed.

## Deployment and remaining actions

1. Review/commit the entire intended working tree, including existing untracked Auth files, new helpers, migration, worker and tests. Deploy from source with `pnpm install --frozen-lockfile` and a fresh production build; do not publish a development-mode bundle or stale tracked build output.
2. Verify backups/restore first. Apply the new migration in staging, then production through the existing controlled process. Investigate preflight failures; do not bypass validation or reset a linked live database.
3. Redeploy `send-auth-email` and `process-notifications`. Configure verified sender, pinned callback/site URLs, hook signing secret and scheduler secret in server stores. Test real delivery with isolated accounts.
4. Verify successful private profile/Auth/RPC no-store behavior, provider/CDN rules, two-user cache isolation, expired/revoked tokens, logout/reset old-session behavior and role changes. Current SQL tests do not replace these checks.
5. Verify production security headers, CSP compatibility, Geoapify origin restrictions/quotas, Auth/gateway limits and monitoring. Remote CI/branch/deployment permissions and database/default grants require an operator review.
6. Replace placeholder terms/privacy alerts with reviewed documents and confirm retention/deletion/search-cache behavior. Resolve remaining prototype schedule content before representing it as live information.

No currently observed credential exposure requires rotation. If an independent incident establishes exposure, rotate/revoke affected credentials explicitly; a Git deletion alone is insufficient. All infrastructure, account, storage, compliance and operational gaps remain visible in the checklist.
