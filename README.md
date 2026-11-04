# Catskills Eruv

A responsive community directory built with **React, TypeScript, Vite, and Tailwind CSS**.

## Development

Requires Node.js 22 and pnpm 10.

From the project folder, run:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed in the terminal. The default is [http://localhost:8443](http://localhost:8443). Changes refresh automatically.

## Production

```bash
pnpm build
pnpm preview
```

Deploy the generated `dist/` folder with a Vite-compatible host.

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
