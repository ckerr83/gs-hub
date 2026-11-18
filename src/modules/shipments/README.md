# Shipments

The Shipment Order Management module lives entirely in `src/modules/shipments`.
`src/app/shipments` and `src/app/api/shipments` are thin route entries. The existing
GS Hub header, actual supplied logo, language cookie, fonts, Supabase SSR client,
team access helpers and wine database are reused. No separate app or new auth
system is created. The separate PYF project is untouched.

## Setup — prepared SQL, not applied

1. In the same Supabase project used by GS Hub, open **SQL Editor → New query**.
2. Paste the entire `database/202611150001_shipments.sql` and **Run as postgres**.
   It requires the existing wine database schema and its `wine_can_read` /
   `wine_can_write` helpers. It creates shipment, pallet, wine-item, expense,
   immutable version, note and original-source-evidence tables, RLS and atomic
   version-checked RPCs. It does not enroll users or grant anonymous access.
3. To migrate the 12 original shipments, follow `database/import/README.md`.
   Run each `NNN-shipment.sql`, then its matching `NNN-source-evidence.sql`, in
   the listed order. Each complete file is below 48 KiB; use a new query for each.
   Shipment files create the working records. Source-evidence files preserve the
   unchanged original records separately for audit. Existing shipment IDs are
   skipped entirely; repeat imports cannot replace newer remote changes.
4. Run `database/verify.sql`. For a fresh import expect 12 shipments, 5 Active,
   7 Completed, 16 saved versions and 12 source-evidence records. Legitimate later
   edits and additions can change these counts; compare stable IDs rather than
   forcing the totals. Restore the same database backup if recovery is needed;
   do not delete/reseed live shipment IDs.
5. Sign in using the existing approved GS Hub team account, then open `/shipments`.
   Live Supabase saves and cross-device persistence still require this check.

The migration stays inside the module's existing SQL convention, as required by
AGENTS.md; it is not duplicated under a second root migrations directory.
No Supabase migration or production data write was executed by the agent.

## Recovered source and financial behavior

Local source found at `/Users/chriskerr/Projects/gs-import-review-app/public/`:
`engine.js`, `model.js`, the shipment UI and original tests. Related workbook
analysis is at `/Users/chriskerr/Projects/gs-import-costing-review/`. The deployed
site's current engine, prices, model, shipment archive and Excel module were also
read because they contain later Registered Price and workflow changes.

Source URL: https://gs-import-costing-review.ckerr83.chatgpt.site/#shipment

The shipment-only export is revision 1397, source updated 2026-11-14T09:09:07.473Z.
It contains 12 shipments and 16 saved versions. Catalogue and cash-flow payloads
were excluded from this export. The original JSON is migration evidence only;
it is never imported by the runtime UI or used as a fallback.

The recovered calculation engine is retained under `tests/source/` for differential
checks. No original costing function needed for this module was unavailable.
The original Excel workbook layout is reused in `data/shipment-excel.js`; its ZIP
packaging now uses the small local `data/zip.ts` implementation, with no dependency.
It exports the supplier order by pallet in the original purchase currency.

`calculations/shipment-costing.ts` ports the original operations and rounding
boundaries to exact rational arithmetic (`decimal.ts`):

- Goods: bottles / bottles per case × case price × (1 − discount), then supplier
  FX; round the shipment goods amount and apportion satang by net foreign value.
- Forecast excise: quantity × (Registered Price × value rate / 100 + bottle litres
  × ABV / 100 × alcohol rate). Local tax is rounded excise × local rate / 100.
- Funds: three separately rounded 2% portions and one separately rounded 1.5%
  portion of excise. Duty remains an explicit entered amount per wine line.
- Assessed mode uses explicit excise, local tax and funds, and requires the assessed
  quantity to match the current bottle quantity.
- The original per-wine VAT mode rounds 7% of goods + excise + local tax for each
  wine line. Recorded historical VAT retains its original mode and bottle-weight
  allocation. These are the original app's assumptions, not newly asserted tax law.
- Shared expenses use bottle counts within their selected pallet, or all pallets.
  Foreign-currency expenses and their recoverable VAT are converted using the
  expense's explicit FX, then allocated with the original largest-remainder method.
- Recoverable VAT is excluded from permanent landed cost and included in total
  funding. Registered Price and Sales Price are independent. Missing financial
  inputs block totals/confirmation; zero must be entered explicitly where known.

### Rounding audit

`docs/decimal-comparison.json` records every observed difference against the
original engine across 27 calculable current/saved records. One original draft,
Marlborist 27, lacks Registered Prices and remains incomplete. Exact decimal
rounding changes Lienert/Eisenstone's current tax/total/cash by THB +0.01, and
Golding / Hatch's current tax/total/cash by THB +0.01. A few line allocations
change by one or two satang when the old binary floating-point engine ordered
mathematically tied remainders differently. The allocation totals reconcile.
These are numeric rounding corrections, not changes in tax formulas or rates.

All imported saved versions retain calculated results from the original engine,
in addition to their original inputs. Historical forecast/comparison/version
views use those frozen results. New snapshots store the exact-decimal result.
Their original prices, FX, assumptions, quantities and results cannot be edited.

## Workflow

- New shipment: enter name, purchase currency, supplier and FX. Review the tax
  assumptions inherited from the original app. Save the draft, add wines from
  the shared wine database, assign pallets and enter explicit duty/expenses.
- Each shipment wine is a snapshot of purchase details at selection time; changing
  the wine database later does not rewrite the shipment. Missing/archived legacy
  product links remain as source IDs without recreating catalogue products.
- Pallet planning orders whole cases. Actual recording permits received bottle
  quantities, with explicit assessment-quantity review.
- Confirm order saves an immutable forecast and locks its working draft. Revise
  forecast creates an editable plan; a further confirmation appends another
  version while retaining the original comparison baseline.
- Open actual costs to enter invoices and assessments before or after arrival.
  Landing records an arrival date and moves the shipment to Completed immediately.
  The four lifecycle stages remain independent: a Completed shipment may still
  be in Record actuals. Compared does not imply physical arrival.
- Save partial actuals as invoices arrive. Complete comparison requires every
  expense to be Actual, assessed taxes, matching quantities and explicit user
  verification. Reopening actuals preserves every previous snapshot.
- Draft edits update the displayed calculations immediately. Save changes writes
  atomically with a version check. A failed save retains the draft. A stale save
  shows a conflict and offers a draft JSON backup before reloading. Notes append
  with the signed-in user's identity. No wine record is edited through this module.

## Verification

```sh
npm run lint
npm test
npm run build
```

Tests cover differential source calculations, rounding, pallet allocation, foreign
expense FX/VAT, nulls, assessed quantities, separate price semantics, frozen
forecasts, independent arrival/lifecycle, partial/completed actuals, optimistic
concurrency, repeated imports, newer-edit protection, anonymous/non-team rejection,
read-only team access and direct-table write rejection. SQL runs in local PGlite
with Auth helper stubs, not live Supabase.

To repeat local UI QA against a production server:

```sh
npm run start -- --port 3003 --hostname 127.0.0.1
node --import ./src/modules/shipments/tests/resolve.mjs src/modules/shipments/scripts/ui-fixture.mjs
```

Open `http://127.0.0.1:3111/shipments`. This explicit loopback-only harness uses
local PostgreSQL and the recovered data. Writes affect only that temporary local
DB, lost when the harness stops. Production never loads this fixture. Screenshots
under `docs/verification` are from this harness and do not establish live access.

After manual setup, repeat confirmation, landing, an invoice edit and reload in
an authenticated browser, then open the same shipment in a second authenticated
session. Check stale edits conflict and signed-out requests return 401/403. Those
live checks cannot be claimed from local fixture tests.

To regenerate import files (offline, without database writes):

```sh
npm run shipment:prepare-import -- src/modules/shipments/data/legacy-shipments.json src/modules/shipments/database/import
```
