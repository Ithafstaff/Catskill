# Catskills Eruv

A responsive community directory built with **React, TypeScript, Vite, and Tailwind CSS**.

## Development

Requires Node.js 22.12 or newer in the 22.x series and pnpm 10.11.0.

From the project folder, run:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Fill in the Supabase URL and publishable key in `.env.local`, then run:

```bash
pnpm dev
```

Open the local URL printed in the terminal. The default is [http://localhost:8443](http://localhost:8443). Changes refresh automatically.

## Production

```bash
pnpm build
pnpm preview
```

Deploy the generated `dist/` folder with a Vite-compatible host.

### Deploy to Vercel

The repository includes Vercel settings for Vite, a locked pnpm install,
`pnpm build`, the `dist` output directory, and SPA rewrites for all application
routes. The build checks TypeScript and stops with an explicit error if the
required Supabase variables are absent.

1. In the existing Vercel project, connect `Ithafstaff/Catskill` and set the
   production branch to `main`. Use the repository root as the Root Directory;
   do not select `src` or `dist`. Framework Preset: **Vite**; Node.js: **22.x**.
2. Add these under **Settings → Environment Variables**, scoped to **Production**
   and also **Preview** if you use preview deployments:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase project HTTPS URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |
   | `VITE_GEOAPIFY_API_KEY` | Optional Geoapify browser key for address search |

   All `VITE_` values are public in the built JavaScript. Never use Supabase
   secret/service-role keys, database passwords, or email-provider secrets here.
   Environment changes require a new deployment because Vite embeds values at
   build time. Do not set `FIGMA_PUBLIC_URL` in Vercel; it is for Figma previews.
3. Confirm the Supabase migrations in [supabase/README.md](supabase/README.md)
   have been applied to the project whose URL you configured. Vercel deploys the
   frontend; it does not apply these database migrations or deploy the email worker.
4. In Supabase **Authentication → URL Configuration**, set Site URL to
   `https://catskill-eruv-app.vercel.app` and allow these exact redirect URLs:
   - `https://catskill-eruv-app.vercel.app/auth/confirm`
   - `https://catskill-eruv-app.vercel.app/auth/reset-password`

   Use your actual domain if it differs. Add explicit preview callbacks when
   testing preview authentication. Configure production SMTP as described in the
   backend guide. If using Geoapify, allow the production origin in its key settings.
5. Commit and push the prepared changes to `main` to trigger production deployment.
   Alternatively, from the repository root, run `npx vercel@latest --prod`,
   authenticate, and select the **existing** Vercel project. Wait for **Ready**
   and confirm the production domain is assigned to that deployment.

**“No Deployment”** on the domain means there is no successful production
deployment assigned to it. DNS can be correct while this remains unresolved.
Inspect the latest deployment's build logs if deployment fails. A successful
preview alone does not populate the production domain; deploy or promote to Production.

After deployment, open `/`, `/find`, `/shuls`, `/mikvahs`, `/login`, and `/admin`
directly and refresh each. Verify published listings load, then check signup
confirmation and password-reset callbacks with a test account. An anonymous
visitor to `/admin` should see the login flow. Static assets must return CSS/JS,
not the application HTML.

## Project structure

- `src/main.tsx`: app entry point
- `src/App.tsx`: homepage, navigation, and page routing
- `src/index.css`: global styles and Tailwind CSS import
- `src/Community.tsx`: account and community management pages
- `src/MikvahHome.tsx`: Mikvah homepage
- `src/MikvahListings.ts`: Mikvah directory listings
- `src/ShulManagement.tsx`: shul management pages
- `src/MinyanSchedule.tsx`: minyan schedule tools
- `vite.config.ts`: Vite, React, and Tailwind configuration

## Supabase backend

Copy `.env.example` to `.env.local` and supply your project URL and publishable
key. Never place a secret/service-role key or database password in `VITE_`
variables. Restart Vite after changing the environment.

Authentication, contributor saves, directory reads, and admin reviews use
Supabase. Database policies and authenticated RPCs enforce authorization. The
admin route is `/admin`; it requires a verified account whose profile role was
manually assigned by a trusted operator.

Setup, migration, admin assignment, email-worker configuration, and operational
checks are documented in [supabase/README.md](supabase/README.md).

```bash
pnpm test:backend
pnpm check:supabase --schema
pnpm exec tsc --noEmit
pnpm build
```

The backend tests run real PostgreSQL in an isolated embedded runtime; they do
not modify the hosted project or send email. Live checks use only the
publishable key and verify public projection and anonymous access restrictions.

## Remaining prototype content

Minyan discovery, Shabbos calendar values, maps, and sample prayer schedules
still use prototype data. They are separate from the new shared listing/review backend.
The existing nine sourced Mikvah records are imported with attribution; this
does not establish that their details are current. Confirm hours, contacts,
and visitor guidance with each facility before launch.

## Daf Yomi

The homepage requests the daily Bavli entry from the [Hebcal calendar API](https://www.hebcal.com/home/195/jewish-calendar-rest-api), identifies its `dafyomi` event by date and category, and checks the tractate and folio against plausible ranges. Hebcal data is credited on the page under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Sefaria's calendar API](https://developers.sefaria.org/reference/get-calendars) can be used to independently check dates; it is not a runtime fallback.

The date is the civil day in `America/New_York`, changing at midnight. The page checks for a new day every 30 seconds and on focus, visibility, page restoration, and reconnection. Validated entries are cached per date in memory and session storage. On failure the current day's cached entry is used, or an unavailable message and retry control are shown. Since this is a static app, caching is per browser session rather than shared between visitors; the browser must be able to reach Hebcal. The nearby shiur is sample data and its directory is not yet connected.

Run the focused tests with `pnpm test:daf-yomi` (Node.js 22.12 or newer). The tests use mocked responses; live provider availability should also be checked when deploying.

### Home page calendar

The home hero shows live Gregorian and Hebrew dates for America/New_York. Hebrew dates change at the calculated sea-level sunset for a fixed central Catskills reference (41.65, -74.65); the Gregorian date changes at New York midnight. This display uses `@hebcal/core` locally, requires no API key or network request, and follows the device clock. It refreshes while open and when the tab becomes visible again. This does not implement the separate Shabbos timetable placeholders.

Run `pnpm test:calendar` to check civil midnight, sunset, Hebrew month/year boundaries, leap day, and daylight saving changes.
