# Wine database

The module owns components, styles, domain/data mapping, handlers, SQL, recovery
source, photos, import tooling, tests and documentation. `src/app` wine routes only
re-export module entry points. Shared header, translation infrastructure, fonts,
app styles and Supabase browser/server/SSR-cookie clients remain outside modules.
One application and the original TypeScript configuration are preserved.

## Current status and prerequisite

The owner reported completing the schema and the 18-part SQL import in this
chat. Subsequent anonymous API checks returned **401** for the wine tables and
membership helper, consistent with restricted access. Counts and live saves have
not yet been verified through an authenticated session. Private photo uploads
also remain unverified.

Team email sign-in is now implemented in `src/modules/team-access` after the owner
explicitly expanded the scope to include authentication pages. Follow the
[team-access setup instructions](../team-access/README.md) to configure Auth email
settings, invite `chris@gsimport.co.th`, and apply its small enrollment SQL. The
existing private `wine_private.team_access` roster remains the authorization
boundary. No public sign-up, automatic membership or privileged app endpoint was
added. The Auth provider still had public sign-up enabled at the last read-only
check; disable that provider option before treating account creation as invite-only.

The migration requested at `supabase/migrations/202611120001_wine_library.sql`
was absent at the start of this update. Its prepared definition already lived at
`src/modules/wine-database/database/schema.sql`. That canonical module file has
been completed; a duplicate migration tree has not been introduced. If the older
prepared schema was applied elsewhere, the schema adds the missing fields and
updates nullable discount handling. Review existing policies before adopting it.

## Exact Supabase SQL Editor and import instructions

All commands below run from `/Users/chriskerr/Documents/Projects/gs-hub`.

1. Back up any existing Supabase data. Check the project URL against
   `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`. The application needs only that URL
   and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never put secret/service-role keys
   in public environment variables, source code or the app runtime.
2. In that project's Supabase Dashboard, open **SQL Editor → New query**. Paste
   the complete contents of `src/modules/wine-database/database/schema.sql` and
   click **Run** as the database administrator (`postgres`). This creates the
   three wine tables, empty private allowlist, restricted helpers/RPC, triggers,
   grants/RLS and private `wine-bottles` bucket. It does not import records or
   grant any user access. Running the supplied schema twice is supported. Audit
   pre-existing policies; permissive policies from other migrations can combine
   with these policies.
3. Regenerate the deterministic import artifacts if necessary:

   ```sh
   npm run wine:prepare-import -- --out src/modules/wine-database/database/import
   ```

   Inspect `database/import/manifest.json`: **123 wines, 244 cost references,
   123 evidence records and 81 photos**, source revision **1392**. Hashes cover
   generated files and each original image. This command is offline and never
   contacts Supabase.

4. **Do not paste `database/import/import.sql` into SQL Editor**: that combined
   file exceeds the editor's query-size limit. Instead, open
   `database/import/sql-editor/README.md` for the ordered checklist of **18 files**.
   In **SQL Editor → New query**, paste the complete contents of
   `sql-editor/001-wines.sql` and run as `postgres`. Wait for success, then open a
   new query for `002-wines.sql`, continuing in filename order through
   `018-wine-source-evidence.sql`. Run **one complete file at a time**; do not
   combine files or append them to the previously rejected query. Each file is
   at most **48 KiB** and is its own transaction. The manifest records file sizes,
   row counts and checksums. All 123 wines, 244 cost references and 123 evidence
   records are included across these parts.

   Each part inserts missing stable IDs/evidence keys with `ON CONFLICT DO NOTHING`.
   Existing wines, newer edits and archived IDs are never overwritten or
   resurrected. Conflicting historical evidence rolls back that part for review.
   Stop on an error; if SQL Editor reports an aborted transaction, run `ROLLBACK;`
   by itself before retrying. You can rerun completed parts or resume at the first
   unfinished file safely. Use `database/verify.sql` after all parts succeed.
   The combined `import.sql` remains available for a direct PostgreSQL connection
   with `psql -v ON_ERROR_STOP=1 -f ...`; it is not an SQL Editor query. Do not use
   CSV upserts or the obsolete 416-row seed.

5. In **Storage → wine-bottles**, confirm the bucket is **private**. Upload the
   81 PNGs from `src/modules/wine-database/assets/images/` to the bucket root,
   preserving filenames. If a name already exists, skip it; do not overwrite.
   `database/import/images.json` lists every expected path and SHA-256.
6. For repeatable upload/hash verification, use the offline administrator tool
   instead of manually comparing files. In a temporary **zsh** terminal, enter
   a migration-only secret/service-role key at the hidden prompt:

   ```sh
   read -s 'SUPABASE_MIGRATION_KEY?Temporary migration key: '
   export SUPABASE_MIGRATION_KEY
   node --env-file=.env.local src/modules/wine-database/scripts/photos.mjs --upload --from src/modules/wine-database/database/import
   node --env-file=.env.local src/modules/wine-database/scripts/photos.mjs --verify --from src/modules/wine-database/database/import
   unset SUPABASE_MIGRATION_KEY
   ```

   `--upload` uploads only missing paths with `upsert: false`, then downloads
   and verifies each hash. Existing mismatched photos stop the run; they are
   never overwritten. `--verify` only downloads/hashes. The key is used solely
   by this local CLI, is not stored in a file, and is never returned to the UI.
   A missing bucket or access/network error fails the run.

7. Run `src/modules/wine-database/database/verify.sql` in SQL Editor. On a fresh
   recovery expect 123 wines, 244 revision-1392 cost references, 123 evidence
   records and 81 objects. Active counts may be lower if legitimate remote
   archives exist; totals may be higher if the team has added records. Check
   manifest IDs/provenance instead of reseeding to force an active count of 123.
   All anonymous table/helper privileges and direct authenticated update/delete
   privileges in the verification output must be false. Review _all_ existing
   Storage/table policies for any older broad grants.
8. Configure the implemented invite-only email flow using
   `src/modules/team-access/README.md`. Invite the owner-approved Auth account
   `chris@gsimport.co.th`, then apply
   `src/modules/team-access/database/approve-chris.sql` as `postgres` to enroll
   that exact user with read/write access. For additional approved users,
   `database/approve-team.example.sql` remains a commented template; do not
   permit self-enrollment. The app never uses a service-role client for login.
9. Run the live acceptance checks below. Record who applied each SQL file and
   when in your normal deployment/migration history. These instructions and the
   generated manifest do **not** mean the migration has been applied.

## Active data and concurrency

If wines appear missing, open **SQL Editor → New query** in the configured Supabase
project, paste the entire `database/import/audit-wines.sql` and run as `postgres`.
This prepared, read-only query reports the expected, active, archived and missing
records for each of the five wine import files, with the exact missing IDs/names.
It distinguishes an incomplete import from intentional soft archives. Rerun any
incomplete numbered parts in filename order using the instructions above; do not
restore archived IDs automatically. If all 123 recovered IDs are present and
active, clear the page's search/filters (including missing registered price), then
trace a specific missing wine. The audit never edits records or changes access.

The original costing site's revision 1397 (14 November 2026) was checked read-only:
its catalogue still contained the same 123 IDs as the recovered revision 1392.
That comparison does not verify which records are present in Supabase.

`server/repository.ts` uses the existing request-scoped Supabase SSR client and
verified `auth.getUser()`, followed by a database membership helper. HTTP routes
never use a privileged client. JSON errors expose stable error codes and are
translated by shared dictionaries. Responses and private images use `no-store`.

The catalogue query uses stable ID cursors, keeps requesting after short API
responses (even if the configured cap is below 500), and checks complete counts.
A failed/inconsistent batch rejects the entire load. There is no snapshot or
sample fallback. Table UI renders all filtered records without grid mode,
pagination or page-size controls. The table uses the normal page scroll; its
heading, filters and column headers scroll away rather than occupying a fixed
area. A keyboard-focusable region contains horizontal overflow on mobile.

Current editable columns are explicitly allowlisted. Stable text IDs, image paths,
source metadata and frozen legacy landed reference cannot be overwritten by
forms. Create uses constrained column grants/RLS. Every update/archive goes
through `wine_update` with an expected version; direct authenticated table UPDATE
and DELETE privileges are revoked. The RPC checks membership before updating,
refuses stale/missing/archived rows, and the trigger maintains version/timestamps.
Archive is a soft deletion; no UI operation hard-deletes evidence. Cost references
and original workbook/saved-calculation evidence are read-only to all team users.

Supplier cost/currency, registered price (tax input), commercial sales price,
displayed frozen landed reference, legacy landed reference, margin, markup and
profit are distinct. Unknown amounts/discount/case size remain null; zero remains
zero. Missing inputs do not receive invented defaults. Current inputs do not
recalculate or rewrite historical evidence. Financial calculations exclude VAT.

## Existing local edits and deletions

The old key `gs-hub:wine-library:v1` and event name remain intact. The temporary
write adapter is removed; the remaining hook is **read-only recovery**. No local
value is merged into the active database, cleared, renamed or automatically
imported. Each browser, origin (including port), device and profile may have its
own copy. Open each original browser/origin and export its backup before retiring
that origin. A different origin cannot read another origin's localStorage.

On the wine page:

1. Expand **Local reconciliation**, then **Export local backup**. Even malformed
   values can be exported intact. If storage itself is unavailable, reopen the
   original browser/profile with storage access before continuing.
2. Once team access and the initial recovery are complete, use **Review local
   changes** or **Import backup file**. Accepted formats are the original v1
   `{saved, deleted}` adapter value, its raw-value backup wrapper, and older
   `{wines}` exports. Full exports have no deletion intent; review them record by
   record. Keep the original export, which contains every local field/evidence.
3. Expand a record to compare local and current remote JSON. **Review local
   record** opens the populated form. A save uses the displayed remote version,
   preserves current remote historical references and image/provenance, and
   writes only editable fields. Review the price/source differences explicitly;
   this is not automatic last-write-wins reconciliation. Missing IDs are treated
   as creates; an existing archived ID conflicts on the primary key, so it cannot
   be resurrected. A local create with no remote historical evidence does not
   promote untrusted local evidence into the shared historical tables.
4. Review **Local deletions** individually. **Apply local deletion** opens an
   archive confirmation using the displayed remote version. Missing/already
   archived IDs are left unchanged. Saved local entries marked deleted are not
   offered as creates.
5. Refresh and inspect remote data after each import. Originals remain in browser
   storage and the backup even after successful reconciliation. This permits
   recovery and another review without silently losing earlier work.

## Language and verification

Shared dictionaries live at `src/lib/i18n/dictionaries.ts`. The first-party
`gs-hub-language` cookie applies to `/`, persists for one year, and controls SSR
`<html lang>`, headings/metadata, shared navigation, forms, dialogs, validation,
errors and status text. The visible English / ไทย switch also refreshes server
metadata. Noto Sans Thai is hosted locally with its OFL license. Number/date
formatting uses `en-GB` or `th-TH` with explicit supplier currency and THB labels.
Wine/producer names, SKUs, provenance basis and source evidence remain original.

```sh
npm run lint
npm test
npm run build
```

Tests execute the real schema twice and repeated imports in PGlite (local
PostgreSQL with minimal Auth/Storage schema stubs), check anonymous/non-team denial,
reader restrictions, protected evidence, version conflicts, soft archives, server
versions, nullable inputs and no resurrection/newer-edit overwrites. Unit tests
also simulate a 37-row API cap over 1,307 records and check that partial loads
fail. This is local SQL coverage, not live Supabase or live Storage verification.

For repeatable visual checks without relaxing production authorization:

```sh
npm run start -- --port 3002
# In another terminal, explicit loopback-only UI fixture; all writes fail:
WINE_QA_TARGET=http://127.0.0.1:3002 node src/modules/wine-database/scripts/ui-fixture.mjs
```

Open `http://127.0.0.1:3101/wine-database` only for UI testing. This harness proxies
the real app and supplies the recovered records/evidence/photos solely on its
own local port. It is never imported by production. Its write responses always
return a conflict so failure messages can be verified. Stop it after testing.

Live acceptance checks after setup:

- Sign in as a writer in browser A. Add a clearly identified test wine, reload,
  then sign in independently in browser B and confirm that same ID/values appear.
- Edit one wine in both browsers. Save A, then save B's older form: B must show a
  conflict and retain its form; refresh/reopen before deciding which values to
  retain. Repeat for archive vs stale edit. Remove test data by soft archive.
- Confirm reader accounts cannot create/edit/archive; signed-out/non-team requests
  to `/api/wine-database`, evidence and bottle routes must return 401/403. Confirm
  direct REST table mutations/RPCs and private Storage are also denied to anon.
- Confirm search/filters/sorting, all matching DOM rows, normal page scrolling, horizontal
  scrolling, forms, translated errors/status and English/Thai reload/navigation
  persistence at desktop and mobile widths.
- Verify all photo hashes, nullable values and evidence against the manifest.

The original recovery was revision 1392, updated 10 November 2026 at
18:34:57.124 UTC, source commit `42bca1f783e5095785d34a835c471f305c412ad5`.
The retained source consists of 123 wines from 22 producers and 81 photos; original
shipments and cash-flow modules remain on the older site.

Primary references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[range limits](https://supabase.com/docs/reference/javascript/range),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Compact layout and supplied logo

The overview/count strip and duplicate review tabs are removed. The matching
count is a small inline label; missing registered prices use a checkbox beside
sorting. Search and producer/style/country filters remain available. The heading,
actions and table rows are tighter, and local reconciliation remains available
below the table. The table has no viewport height limit or sticky column headers:
vertical scrolling moves the entire page, including all top controls, away.

The shared header uses the supplied GS Import round PNG from
`src/assets/gs-import-logo.png` on every route. It replaces the generated GS mark.
The original logo file is copied unchanged and is bundled with the application.
