# Verification — 13 November 2026

## Passed locally

- `npm run lint`.
- `npm test`: 14 tests, including execution of the actual schema and generated
  import SQL in local PostgreSQL (PGlite). Schema/import repeatability, 123 wines,
  244 references, 123 evidence records, anonymous/non-team denial, reader access,
  write restrictions, version conflicts, server-maintained versions, nullable
  inputs, immutable evidence, and no overwriting newer edits or unarchiving IDs.
- `npx tsc --noEmit`; original `tsconfig.json` unchanged.
- `npm run build`: Next.js 16.4.6 production build completed successfully.
- Import preparation: 123 wines, 244 cost references, 123 evidence records,
  81 photos, all stable IDs and photo hashes validated. No obsolete seed imported.
- Production HTTP checks (without a session): catalogue GET, evidence GET, bottle
  GET, create POST, edit PUT and archive DELETE all returned **401**. The old route
  returned **308** to `/wine-database`. Thai cookie produced `lang="th"` and the
  Thai page heading in the server-rendered HTML.

## Browser checks against the production UI with isolated API fixtures

The loopback-only harness served recovered records and original photos/evidence
while proxying the actual production app. Its writes always returned a conflict.
These checks do not demonstrate Supabase persistence.

- Desktop: 1280 × 720 and 1440 × 1000. Mobile: 390 × 844.
- All **123** matching wines existed in the same table DOM, with no pagination or
  grid controls. Missing registered-price filter returned **36** rows.
- Producer `Hatch` returned **4** rows; combined Hatch / White / Australia returned
  **2** rows. Search `EDEN VALLEY FLAXMAN` returned one original product. An
  unmatched query displayed the translated empty state; clear restored 123 rows.
- Descending sales-price sort placed **THB 3,330.00** first.
- Header remained sticky after the table's vertical scroll reached 2,000 px:
  header and scroll-region top both measured 386.5 px.
- Mobile document width and scroll width were both **390 px** while the table was
  1,520 px wide, so overflow remained inside the table region. Horizontal-scroll
  guidance was visible; the country filter remained available.
- Thai navigation, headings, filters, headers, add form, validation and conflict
  message were checked. Empty required name/producer showed Thai validation.
  A failed create retained entered form values and showed a conflict, with no
  success message.
- Thai selection survived navigation to Dashboard and reload, including HTML
  `lang` and translated metadata. Switching back to English restored English
  labels and metadata. Original wine names, producers, SKUs and evidence remained
  unchanged. English detail/edit forms and source evidence were inspected.
- Previews: `english-desktop-fixture.png`, `thai-mobile-fixture.png`.

## Not verified / setup outstanding

No SQL was applied and no data/photos were uploaded to Supabase by this update.
Read-only probes of the configured Supabase project returned `PGRST205` for the
three wine tables and `PGRST202` for `wine_can_read`. There is no team sign-in or
approved roster. The bucket's live configuration has not been verified.

Consequently, successful real database saves across reloads/devices, live RLS
and private Storage behavior, and live photo hashes remain **unverified**. Local
PostgreSQL and local HTTP authorization checks do not substitute for those checks.
Follow the module README's exact SQL Editor/import instructions, establish team
sign-in, approve access, then run the listed two-browser acceptance checks.

## SQL Editor size-limit correction — 13 November 2026

The combined import was rejected by Supabase SQL Editor as too large. Import
preparation now also generates 18 independently runnable SQL files, each at most
48 KiB, and an ordered checklist at `../../database/import/sql-editor/README.md`.
The combined file is labeled for direct PostgreSQL connections only.

Lint and all 15 tests pass. Tests regenerate the artifacts deterministically,
verify each part's UTF-8 size and hash, execute the complete editor sequence twice
in local PostgreSQL, check every source evidence payload, confirm a conflicting
batch rolls back completely, and preserve newer wine edits/archives on rerun.
These new parts have not been executed against Supabase by this update.

## Compact layout and supplied logo — 14 November 2026

This revision supersedes the earlier sticky-header/height-limited table layout.
The overview strip and review tabs are removed. Matching count, missing-price
checkbox and sorting share a compact toolbar. Recovery tools are below the
catalogue. Vertical scrolling moves the navigation, controls and column headers
out of view; the table no longer has an internal vertical scrolling viewport.

The original GS Import round logo is now bundled unchanged at
`src/assets/gs-import-logo.png` and rendered by the shared header on every page.
The generated GS mark is removed. Desktop and mobile checks confirmed the logo
loads on the wine database, Dashboard and sign-in page.

Checks passed: lint, all 24 existing tests, TypeScript and the production build.
Browser checks used the existing isolated recovered-data fixture, not a change to
Supabase access or live records. At 1280 px width the first wine row begins at
246.5 px; at 390 px width it begins at 351 px in English and 335 px in Thai. All
123 rows remain in the table. The missing-price checkbox returns 36 rows.
Document width equals viewport width at both sizes, containing horizontal scroll.

After scrolling within the table area on mobile, document scroll reached 1,688
px while table scrollTop remained zero. Navigation, heading and column headers
were all above the viewport. This verifies normal page scroll and no frozen top
area. The table region's clientHeight equals its scrollHeight, with max-height
`none` and static column headers.

Previews: `compact-desktop-fixture.png`, `compact-thai-mobile-fixture.png`,
`compact-scrolled-mobile-fixture.png`. Port 3002 was restarted with the final
production build and left running; the separate fixture harness was stopped.
