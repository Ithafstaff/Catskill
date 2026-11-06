# Production readiness checklist

Audit: 7 November 2026 (Asia/Manila). Decision: **CONDITIONAL GO — HUMAN ACTION REQUIRED**.

Statuses distinguish repository verification from deployed controls. PASS means the stated, bounded check executed successfully. NOT VERIFIED is not a pass. Items marked **Required** must be resolved before public launch. See `SECURITY_AUDIT_REPORT.md` for evidence, limitations and finding IDs.

## Audit phases

| Phase / requirement | Status | Evidence or required action |
| --- | --- | --- |
| 1. Repository instructions, documentation, architecture and attack surface | PASS | Instructions, all relevant runtime sources, migrations, functions, configurations, manifests, tests and five reachable commits inspected. Missing PRD/architecture document not invented. |
| 2. Working tree/history secret scan | PASS | Focused scanner found no matching private credential in working text or 94 historical text blobs. Limited patterns; no Gitleaks/entropy scan. |
| 2. Browser private-key boundary | PASS | Public-key validation at build/runtime; no private credential matched in inspected artifacts. Intentional Supabase publishable key present. |
| 2. Rotation required by an observed exposure | NOT APPLICABLE | No confirmed credential exposure found. Independent evidence of exposure would require revocation/rotation. |
| 2. Server secrets and production environment isolation | NOT VERIFIED | **Required:** inspect provider secret stores and preview/production separation; variable values were never printed. |
| 3. Public cache classification and static assets | PASS | Static public HTML, hashed assets, date-scoped calendar cache and geocoding cache classified; no service worker or server framework cache. Immutable asset policy prepared. |
| 3. Private browser fetch and RPC response policy | PASS | Browser no-store tests and transaction-local private response settings in PostgreSQL, including read-only transactions. Applies after deployment. |
| 3. Successful hosted profile/Auth/RPC cache headers, shared cache isolation | NOT VERIFIED | **Required:** successful private sessions, upstream/CDN policy, 304, logout/account switch/expiry/demotion and back-forward cache tests. SA-03 remains partial. |
| 4. API inventory and SQL authorization | PASS | All public RPCs, profile operations, two functions and SDK Auth routes inventoried. Local direct access/cross-user denials tested. |
| 4. Input bounds and malformed nested payloads | PASS | New migration rejects invalid types/arrays, excessive text/items; pre-fix case reproduced; 200,000-byte save cap retained. |
| 4. Injection, SSRF, response projection and method review | PASS | No identified untrusted HTML/eval/server fetch target or interpolated request SQL; public projection and private helpers tested. This is source/test scope, not exhaustive penetration testing. |
| 5. Callback parsing, destination validation and recovery gating | PASS | Auth unit suite plus anonymous browser recovery denial; synchronous URL scrubbing retained. |
| 5. Hosted email confirmation configuration | PASS | Read-only Auth settings response confirms confirmation required. |
| 5. Real signup/login/reset/logout, password policy, expiry/revocation | NOT VERIFIED | **Required:** isolated users, delivered mail and hosted provider settings. No account/password changed during audit. |
| 5. Cookie-based app session / OAuth / server actions | NOT APPLICABLE | Direct Supabase bearer sessions; no application cookie backend or OAuth flow implemented. JavaScript-readable persisted tokens are an architectural residual risk. |
| 6. RLS, ownership, admin checks, history and write isolation | PASS | Twelve core tables; metadata escalation, cross-user operations, immutable snapshots and transactional moderation tested in PostgreSQL. |
| 6. Hosted schema/grants/least privilege, database transport/access | NOT VERIFIED | **Required:** apply/review migration, inspect live catalog/default grants/network configuration and privileged access. Public smoke checks are insufficient. |
| 6. Backups and restoration | NOT VERIFIED | **Required:** establish ownership/retention, rehearse isolated restore and rollback; include Auth dependencies, settings and secrets. |
| 7. React rendering and browser credential exposure review | PASS | Identified data sinks use React text/DOM textContent; no untrusted raw-HTML rendering found. Built client excludes server handlers. |
| 7. Browser security headers and CSP | NOT VERIFIED | **Required:** deploy prepared enforced base/object/frame/form policy and report-only script/resource policy; verify actual headers and feature compatibility. Current live root lacked the checked custom headers. |
| 8. Application request trust / CORS / CSRF / SSRF | PASS | Bearer/machine-auth boundaries reviewed; fixed server provider URLs; no credentialed origin-reflection logic in application source. |
| 8. Hosted cross-origin behavior and provider request limits | NOT VERIFIED | **Required:** controlled staging Origin/preflight tests, provider limits and production allowlists. No claim that provider CORS has passed. |
| 9. Listing-save rate limit | PASS | Atomic 60 successful saves/account/minute; 61st rejected with PT429; user/window independence tested. Failed writes do not consume quota. |
| 9. Auth/email/IP/global quotas and abuse monitoring | NOT VERIFIED | **Required:** provider login/signup/resend/reset limits, bot protection, worker schedule, Geoapify origins/quota and gateway limits. Client pacing is not a security control. |
| 10. Upload/payment/private-file feature tests | NOT APPLICABLE | No implemented upload, payment, storage bucket or private-download workflow in repository. |
| 10. External project storage inventory | NOT VERIFIED | **Required if buckets exist:** inspect policies, public/private classification and retention. No assumption that an unused repository means an empty hosted project. |
| 11. Hook signatures, body limits, callback origins and retry safety | PASS | HMAC raw body, timestamps, bounded streaming, safe URLs, HTML escaping, idempotency and provider failure tests. |
| 11. Notification worker authorization, leases and errors | PASS | Secret/method/config rejection, fixed provider, retryable failures, no-store and SQL lease ownership tested. |
| 11. Deployed functions, real email and sender/scheduler configuration | NOT VERIFIED | **Required:** redeploy both functions and prove delivery in staging. Native Edge runtime also needs verification. |
| 12. Dependency audit | PASS | 15 initial advisories → zero; Vite 8.1.6, patched PostCSS/nanoid and source-map-js 1.2.2. No new major version. |
| 12. Canonical lockfile/frozen installation | PASS | pnpm lock current; divergent npm lock removed; frozen offline install without lifecycle scripts passed. |
| 12. Remote CI/branch protections/deployment access | NOT VERIFIED | **Required:** operator check. No CI workflow in repository; provider permissions inaccessible. |
| 13. Missing/invalid public build configuration fails closed | PASS | Negative builds reject absent required variables and synthetic invalid key; HTTPS-origin/key tests pass. |
| 13. Production/preview secrets, debug and origin configuration | NOT VERIFIED | **Required:** inspect Vercel/Supabase settings. Do not publish development-mode sourcemaps or run a Vite dev server as production. |
| 14. Production root HTTPS/reachability | PASS | Public HTTPS request 200, valid transport through client verification, platform HSTS present. |
| 14. Tested public file disclosure paths | PASS | `/.env`, `/.git/config`, Figma kit and source paths return SPA HTML, not the requested source/config files. No broad infrastructure scan. |
| 14. HTTP redirects, DNS/subdomains, domain/email/provider security | NOT VERIFIED | **Required:** inspect DNS, stale records, email domain verification and production provider configuration. No DNS changes made. |
| 15. Source error redaction and function failure responses | PASS | Static allowlist/generic frontend fallback; private generic worker errors; no credentials/provider bodies returned or logged in reviewed paths. |
| 15. Production logs, alerts, incident owner and retention | NOT VERIFIED | **Required:** verify sanitized logs and alerting. No monitoring integration observed. |
| 16. Privacy/terms documents and retention/deletion process | FAIL | **Required:** signup currently opens placeholder alerts; SA-08. Human review and implementation of real documents required. Review persistent typed-address cache and legacy storage. |
| 16. Legal/regulatory compliance | NOT VERIFIED | Human/legal assessment required; source inspection cannot establish it. |
| 17. Reliability and bounded expensive operations | PASS | Tested workflow failures/transactions, email timeout/retry behavior, payload limits and lazy map loading. |
| 17. Capacity/performance readiness | NOT VERIFIED | Review full-collection RPC aggregation, daily write growth and provider quotas. Large main/map build warnings remain; no load test was run. |
| 18. TypeScript, tests, production build and artifact inspection | PASS | Node 22.23.4; 72 tests, zero failed; successful build; no public sourcemaps or matched private secrets. |
| 18. Linter / dedicated SAST | NOT VERIFIED | No linter configured; Gitleaks/Semgrep unavailable. Formatting/typechecking are not a SAST substitute. |
| 18. Hosted account, cache and email E2E | NOT VERIFIED | **Required:** isolated accounts/provider access; no live account mutations or real emails during audit. |
| 19–21. Remediation, formatting, regressions and final diff | PASS | Targeted changes tested; full suite rerun; final diff reviewed; existing user modifications retained. |
| 22. Required reports | PASS | Audit report, this checklist and fixes summary created without secret values. |
| 23. Unconditional production launch | FAIL | Required deployment and verification work plus privacy/terms content remain. This is a conditional assessment only. |

## Final launch gate

| Mandatory gate | Status |
| --- | --- |
| No known exposed active private secrets in audited materials | PASS (limited scan scope) |
| No known exploitable critical vulnerability in audited repository | PASS (no such finding identified) |
| No unresolved launch-blocking high severity repository finding | PASS (tooling findings remediated) |
| Private integration credentials stay server-side in source/build | PASS |
| Protected operations enforce authentication/authorization locally | PASS |
| Hosted private/cross-user read, update, deletion and admin tests | NOT VERIFIED — Required |
| Sensitive cache isolation through browser, origin and CDN | NOT VERIFIED — Required |
| Production migration, configuration and deployment validated | NOT VERIFIED — Required |
| Live database permissions/default grants/backups validated | NOT VERIFIED — Required |
| File upload permissions | NOT APPLICABLE to implemented app; hosted bucket inventory still required |
| Security-sensitive dependencies assessed | PASS |
| Production build and local critical workflows | PASS |
| Hosted auth/email critical workflows | NOT VERIFIED — Required |
| Safe application errors | PASS |
| Production logging/monitoring | NOT VERIFIED — Required |
| Remaining infrastructure/privacy risks documented | PASS |

Only release after the required rows are resolved and supported by evidence. Document an accountable owner for any remaining non-blocking risk. A conditional result does not mean the currently deployed website is verified ready for public accounts.
