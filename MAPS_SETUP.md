# Free maps and address suggestions

Public Mikvah/Shul directories, Find a Minyan, listing details, and submission forms use OpenFreeMap with MapLibre for maps. Submission forms include pin selection. Geoapify supplies optional address suggestions. No Google Cloud billing or Google API key is required for these features. Existing Google Maps directions links still open normally.

## Activate autocomplete

1. Sign up at https://myprojects.geoapify.com/ (Free plan).
2. Create a project named **Mikvah Website** and copy its API key.
3. Configure the key's allowed HTTP referrers/origins for the local development addresses and your actual production website using the syntax shown in Geoapify's dashboard. Do not edit KSE's Google keys.
4. Add to `.env.local`, keeping the existing Supabase variables:

   ```env
   VITE_GEOAPIFY_API_KEY=YOUR_KEY
   ```

5. Restart Vite. In Vercel, add the same variable under Project Settings → Environment Variables, then redeploy. Vite embeds browser variables at build time; this key is visible to visitors, so provider-side website restrictions matter.
6. On a new Mikvah or Shul form, type at least three characters and pause. Select a suggestion using the mouse or arrow keys and Enter. Verify that street, city, state, ZIP and map coordinates fill together. Drag the pin to confirm the exact entrance. Save a draft, reopen it, and verify the pin persists.

Suggestions send the typed address to Geoapify. The form displays Geoapify and OpenStreetMap attribution; MapLibre displays the map data attribution. Do not remove these credits.

## Usage and behavior

- Free Geoapify currently includes 3,000 credits/day and up to 5 requests/second across the account. One autocomplete request costs one credit. Quotas are shared with any other Geoapify services using the account. Review actual usage in the provider dashboard as traffic grows.
- The form waits 500 ms after typing, cancels obsolete requests and caches up to about 100 queries in component memory. Autocomplete and public lookup share a per-tab request queue paced at roughly 2.5 requests/second; requests time out after 15 seconds. This reduces usage but does not enforce an account-wide quota or rate limit. Sustained higher traffic may need server-side throttling or a different plan.
- Manual address entry remains available if a key is missing, a request fails or an address is not found. A selected suggestion is not proof that a house number or location is correct: contributors and admins should verify it.
- Pins persist as `latitude, longitude` in the existing `mapLocation` field and go through the existing review workflow. No schema migration is required. Existing Google Maps links remain accepted, but this picker does not resolve their coordinates automatically.
- Public map routes are `/find`, `/shuls`, `/mikvahs`, `/shuls/:id` and `/mikvahs/:id`. Only published listings and the existing attributed public Shul sources appear. Drafts and pending submissions are excluded. Additional Shul locations show their own approved addresses and schedules.
- Public pins use contributor coordinates where available. For older public addresses, Geoapify forward geocoding resolves building/street matches with confidence at least 0.7; city and postcode centroids are excluded. All geocoded pins are labelled approximate. Missing locations remain in the list with details/directions and a retry action.
- Public address lookup results are cached in browser storage for 30 days, with in-memory request deduplication. This cache is advisory, not a verified location record. New browsers require new lookups, which consume the same Geoapify quota as autocomplete. An account-wide shared coordinate cache is a future optimization for higher traffic.
- Map and result selection stay synchronized. Address autocomplete sets a search center; distance filters and sorting use straight-line miles, never fabricated walking/driving estimates. Device location is requested only after a visitor clicks Use my location; it is not persisted.
- Find a Minyan's prayer filters use published schedules and show recurrence details. They do not assert that seasonal, holiday, or Shabbos schedules run today. Sourced Shuls without schedules are available under All shuls. The old home-page sample timetable and Shabbos date/time placeholders are separate work.
- Additional Shul location forms also offer autocomplete. They retain the existing free-text address field and resolve that public address after approval.
- OpenFreeMap's public instance requires no key and currently states no map-view/request limits. It has no SLA guarantee. The map renderer loads lazily on map pages and listing location forms. Keep provider attribution visible.

Sources checked October 30, 2026:
- https://openfreemap.org/quick_start/
- https://www.geoapify.com/pricing/
- https://www.geoapify.com/pricing-details/
- https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
