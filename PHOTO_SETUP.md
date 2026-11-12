# Listing photos: setup and local review

## Supabase setup

Applied to the connected Mikvah Project on November 13, 2026 (Asia/Manila).
The bucket is private; the two photo policies permit scoped reads and uploads,
with no client overwrite/delete policy. Do not rerun these migrations.

In the **Mikvah Project** SQL Editor, apply these files in order, once:

1. `supabase/migrations/202611070001_security_hardening.sql`
2. `supabase/migrations/202611130001_listing_cover_photos.sql`

The first is the prerequisite from the latest shared repository update. The
second creates the private `listing-covers` bucket, enforces a 5 MB limit and
JPG/PNG/WebP types, and attaches each photo to an immutable listing version.
No additional environment variables or API keys are needed. Do not make the
bucket public or add overwrite/delete policies.

## Review locally

Open http://127.0.0.1:8443/ and sign in with an existing contributor account.
Use a real location and a photo you have permission to publish. The local site
uses the connected Supabase database, so saved drafts and submissions are real.

1. Start a Mikvah or Shul registration. Below the location map, choose a cover
   photo. Check the preview, replace/remove controls, and moving between steps.
2. Save as Draft and reopen it from the dashboard. The saved photo should return.
3. Submit for review. As a website administrator, open the submission in Admin
   Review. Check the submitted photo and, for an update, the currently approved
   photo side by side. Approval requires confirming photo review. A removed
   photo is explicitly identified and its removal must be confirmed too.
4. Approve only a listing you intend to make public. On its public card and
   detail page, check the approved photo. A pending replacement should leave the
   previous approved photo visible until approval.
5. For a listing without a photo, check the non-interactive map preview and pin.
   An address-derived position remains approximate. If a usable location cannot
   be obtained, the location placeholder remains. Directions still opens the
   existing navigation link.
6. Check the form on desktop and phone widths: GPS input first, full-width map
   below, then optional cover photo.

No temporary demo routes or generated test files are included. Changes remain
local until reviewed and pushed. Password/email-delivery work is outside this
change.
