# GS Hub

One modular Next.js application in this directory, with the supplied GS Import
logo in the shared header. Dashboard: `/`. Wine database:
`/wine-database`. `/wine-library` permanently redirects to the new route; legacy
image/evidence URLs and the old local-backup key remain compatible.

The wine database has one continuous table, search, producer/country/style filters,
a missing registered-price filter, sorting, details, export, and version-checked
shared create/edit/archive operations. English / ไทย is shared across pages and
persisted in a first-party cookie. Thai fonts are self-hosted with their license.
The existing TypeScript configuration is unchanged.

**Team email sign-in is implemented at `/sign-in`.** It requests links only for
existing invited Auth accounts and checks the approved roster before opening the
wine database. Configure Supabase Auth, invite `chris@gsimport.co.th`, and run the
small enrollment SQL using the [team-access setup instructions](src/modules/team-access/README.md).
No privileged key is used by the application.

The owner has reported completing the wine SQL import. Anonymous API requests now
return 401, as expected. Imported row counts, private photo uploads, successful
email delivery and real cross-browser persistence remain unverified. A read-only
Auth settings check found public sign-up still enabled at the provider; disable
it in Supabase as described in the setup instructions. Wine RLS remains restricted.

The recovered migration source is retained: 123 wines, 81 photos, 244 cost
references and 123 evidence records. The obsolete 416-row seed is not used.
Existing device-local changes remain untouched and can be exported and reviewed
through **Local reconciliation** on each original browser/origin.

Run locally:

```sh
npm ci
npm run dev
```

Checks:

```sh
npm run lint
npm test
npm run build
```

Tests include local PostgreSQL execution of the actual schema/import SQL, access
policies, version conflicts, archives and repeatable imports. These do not prove
live Supabase persistence. Browser layout checks use an isolated, loopback-only
fixture harness while authentication is unavailable.

See [the wine module setup and exact SQL Editor/import instructions](src/modules/wine-database/README.md).
