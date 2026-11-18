# Prepared shipment import — not applied

Run the module's 202611150001_shipments.sql first. In Supabase SQL Editor, open a new query, paste one ENTIRE file below and run as postgres. Continue in this order. Do not combine files. Existing shipment IDs are skipped in full. No catalogue rows are created or changed.

- [001-shipment.sql](001-shipment.sql) — Estampa · Chile (28160 bytes)
- [001-source-evidence.sql](001-source-evidence.sql) — Estampa · Chile (40719 bytes)
- [002-shipment.sql](002-shipment.sql) — Borsao (10910 bytes)
- [002-source-evidence.sql](002-source-evidence.sql) — Borsao (14811 bytes)
- [003-shipment.sql](003-shipment.sql) — Lienert/Eisenstone (6375 bytes)
- [003-source-evidence.sql](003-source-evidence.sql) — Lienert/Eisenstone (10557 bytes)
- [004-shipment.sql](004-shipment.sql) — Golding / Hatch (11144 bytes)
- [004-source-evidence.sql](004-source-evidence.sql) — Golding / Hatch (19427 bytes)
- [005-shipment.sql](005-shipment.sql) — Marlborist 27 (4444 bytes)
- [005-source-evidence.sql](005-source-evidence.sql) — Marlborist 27 (6965 bytes)
- [006-shipment.sql](006-shipment.sql) — Spada August 26 (10171 bytes)
- [006-source-evidence.sql](006-source-evidence.sql) — Spada August 26 (13483 bytes)
- [007-shipment.sql](007-shipment.sql) — CMP BiB (6923 bytes)
- [007-source-evidence.sql](007-source-evidence.sql) — CMP BiB (9255 bytes)
- [008-shipment.sql](008-shipment.sql) — La Nascosta Jan 26 (17204 bytes)
- [008-source-evidence.sql](008-source-evidence.sql) — La Nascosta Jan 26 (22217 bytes)
- [009-shipment.sql](009-shipment.sql) — Aaldering #1 (23691 bytes)
- [009-source-evidence.sql](009-source-evidence.sql) — Aaldering #1 (30865 bytes)
- [010-shipment.sql](010-shipment.sql) — Vaglio 2026 (23628 bytes)
- [010-source-evidence.sql](010-source-evidence.sql) — Vaglio 2026 (31561 bytes)
- [011-shipment.sql](011-shipment.sql) — Chateau Carbonneau 2026 (18927 bytes)
- [011-source-evidence.sql](011-source-evidence.sql) — Chateau Carbonneau 2026 (25817 bytes)
- [012-shipment.sql](012-shipment.sql) — Fetherston 26 (24060 bytes)
- [012-source-evidence.sql](012-source-evidence.sql) — Fetherston 26 (32615 bytes)

Run ../verify.sql afterward. These files were generated from source revision 1397; they are not evidence of a live import.
