# SQL Editor import — prepared, not applied

The combined import.sql is too large for Supabase SQL Editor. Use these numbered parts instead.

1. If not already applied successfully, run ../../schema.sql in SQL Editor as postgres first.
2. Open a NEW query (or select all and replace the old query). Paste the ENTIRE contents of ONE numbered file below. Run as postgres.
3. Wait for success, then run the next file in a separate query. Do not concatenate these files or append them to the rejected large query.
4. Run ../../verify.sql after every part has succeeded. Then continue with the private photo upload and team sign-in setup in the module README.

Every part is a separate transaction, at most 48 KiB. Existing wine IDs, newer edits and archives are left untouched. Historical evidence conflicts roll back that part for review. If interrupted, rerun completed parts or resume at the first unfinished one; both are safe. Stop on errors. If the editor reports an aborted transaction, run ROLLBACK; by itself before retrying the part.

If wines appear missing, run ../audit-wines.sql as postgres in a new SQL Editor query. This read-only query reports expected, active, archived and missing wines for each wine import part, including exact missing IDs/names. Rerun incomplete parts in order; do not unarchive records automatically. This audit is prepared SQL, not a live database result.

Totals: 123 wines, 244 cost references, 123 evidence records. Photos are uploaded separately (81).

| Order | File | Source records | Query bytes |
| --- | --- | ---: | ---: |
| 1 | [001-wines.sql](001-wines.sql) | 26 | 47621 |
| 2 | [002-wines.sql](002-wines.sql) | 26 | 48276 |
| 3 | [003-wines.sql](003-wines.sql) | 26 | 49074 |
| 4 | [004-wines.sql](004-wines.sql) | 27 | 48152 |
| 5 | [005-wines.sql](005-wines.sql) | 18 | 31606 |
| 6 | [006-wine-cost-references.sql](006-wine-cost-references.sql) | 116 | 48767 |
| 7 | [007-wine-cost-references.sql](007-wine-cost-references.sql) | 107 | 48930 |
| 8 | [008-wine-cost-references.sql](008-wine-cost-references.sql) | 21 | 10149 |
| 9 | [009-wine-source-evidence.sql](009-wine-source-evidence.sql) | 12 | 46915 |
| 10 | [010-wine-source-evidence.sql](010-wine-source-evidence.sql) | 11 | 48017 |
| 11 | [011-wine-source-evidence.sql](011-wine-source-evidence.sql) | 11 | 49032 |
| 12 | [012-wine-source-evidence.sql](012-wine-source-evidence.sql) | 10 | 45891 |
| 13 | [013-wine-source-evidence.sql](013-wine-source-evidence.sql) | 14 | 48807 |
| 14 | [014-wine-source-evidence.sql](014-wine-source-evidence.sql) | 16 | 49041 |
| 15 | [015-wine-source-evidence.sql](015-wine-source-evidence.sql) | 12 | 48385 |
| 16 | [016-wine-source-evidence.sql](016-wine-source-evidence.sql) | 14 | 46620 |
| 17 | [017-wine-source-evidence.sql](017-wine-source-evidence.sql) | 19 | 48792 |
| 18 | [018-wine-source-evidence.sql](018-wine-source-evidence.sql) | 4 | 5274 |
