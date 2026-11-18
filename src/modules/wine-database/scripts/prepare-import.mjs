// Offline preparation only. This script never connects to Supabase or modifies it.
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSqlEditorParts,
  createWineAudit,
  SQL_EDITOR_PART_BYTES,
} from "./sql-editor-import.mjs";

const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
const { wines, source } = JSON.parse(
  await readFile(path.join(moduleRoot, "data/catalogue.json"), "utf8"),
);
const evidence = JSON.parse(
  await readFile(path.join(moduleRoot, "data/evidence.json"), "utf8"),
);
if (new Set(wines.map((wine) => wine.id)).size !== wines.length)
  throw new Error("Duplicate wine IDs in the source snapshot.");
const rows = [],
  references = [],
  evidenceRows = [],
  images = [];
for (const wine of wines) {
  rows.push({
    id: wine.id,
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    variety: wine.variety,
    wine_type: wine.wineType,
    country: wine.country,
    sku: wine.sku,
    abv: wine.abv,
    bottle_ml: wine.ml,
    bottles_per_case: wine.caseSize ?? null,
    source_cost: wine.sourceCost,
    source_currency: wine.currency,
    supplier_discount: wine.discount,
    registered_price: wine.registeredPrice,
    registered_price_source: wine.registeredPriceSource ?? null,
    sales_price: wine.sellingPrice,
    landed_reference: wine.landedReference,
    recommendation_cost: wine.recommendationCost ?? null,
    rrp: wine.rrp ?? null,
    image_path: wine.imageKey ?? null,
    source_metadata: { originalRecord: wine, ...source },
  });
  for (const [reference_kind, ref] of [
    ["displayed", wine.importedCost],
    ["historical", wine.historicalCost],
  ]) {
    if (ref)
      references.push({
        wine_id: wine.id,
        reference_kind,
        source_revision: source.revision,
        cost: ref.cost,
        basis: ref.basis,
        detail: ref.detail ?? null,
        captured_at: source.updatedAt,
        source_payload: ref,
      });
  }
  const record = evidence[wine.id];
  if (!record) throw new Error(`Missing evidence record for ${wine.id}.`);
  evidenceRows.push({
    wine_id: wine.id,
    source_revision: source.revision,
    captured_at: source.updatedAt,
    workbook_rows: record.workbookRows,
    saved_breakdown: record.savedBreakdown,
  });
  if (
    wine.imageKey &&
    !images.some((image) => image.storage_path === wine.imageKey)
  ) {
    if (!/^[a-f0-9-]{36}\.(webp|png|jpg)$/.test(wine.imageKey))
      throw new Error("Invalid bottle image key.");
    const local = `src/modules/wine-database/assets/images/${wine.imageKey}`;
    const bytes = await readFile(
      path.join(moduleRoot, "assets/images", wine.imageKey),
    );
    images.push({
      local_path: local,
      storage_bucket: "wine-bottles",
      storage_path: wine.imageKey,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
if (wines.length !== 123 || images.length !== 81 || evidenceRows.length !== 123)
  throw new Error(
    "Recovered catalogue counts changed; review the source before migrating.",
  );
const quote = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
if (process.argv.length > 2) {
  if (
    process.argv[2] !== "--out" ||
    !process.argv[3] ||
    process.argv.length !== 4
  )
    throw new Error(
      "Usage: node src/modules/wine-database/scripts/prepare-import.mjs [--out directory]",
    );
  const destination = path.resolve(process.argv[3]);
  await mkdir(destination, { recursive: true });
  for (const [name, values] of [
    ["wines", rows],
    ["wine-cost-references", references],
    ["wine-source-evidence", evidenceRows],
    ["images", images],
  ]) {
    await writeFile(
      path.join(destination, `${name}.json`),
      JSON.stringify(values, null, 2) + "\n",
    );
  }
  const statements = [
    "-- PREPARED ONLY. DIRECT POSTGRES CONNECTION ONLY; too large for SQL Editor. Run after schema.sql as postgres.",
    "-- For SQL Editor, run the numbered files in sql-editor/ separately. See sql-editor/README.md.",
    "-- Repeatable insert-only recovery. Existing IDs (including archives) are never updated.",
    "begin;",
    `insert into public.wines select * from jsonb_populate_recordset(null::public.wines, ${quote(rows.map((row) => ({ ...row, version: 1, created_at: source.updatedAt, updated_at: source.updatedAt, archived_at: null })))}) on conflict (id) do nothing;`,
    `insert into public.wine_cost_references select * from jsonb_populate_recordset(null::public.wine_cost_references, ${quote(references)}) on conflict (wine_id,reference_kind,source_revision) do nothing;`,
    `insert into public.wine_source_evidence select * from jsonb_populate_recordset(null::public.wine_source_evidence, ${quote(evidenceRows)}) on conflict (wine_id,source_revision) do nothing;`,
    // Abort rather than pretending an incompatible historical payload was imported.
    `do $verify$ begin if exists (select 1 from jsonb_populate_recordset(null::public.wine_cost_references, ${quote(references)}) s join public.wine_cost_references t using(wine_id,reference_kind,source_revision) where t.source_payload is distinct from s.source_payload or t.cost is distinct from s.cost or t.basis is distinct from s.basis or t.detail is distinct from s.detail or t.captured_at is distinct from s.captured_at) then raise exception 'Conflicting historical cost reference; no import committed'; end if; end $verify$;`,
    `do $verify$ begin if exists (select 1 from jsonb_populate_recordset(null::public.wine_source_evidence, ${quote(evidenceRows)}) s join public.wine_source_evidence t using(wine_id,source_revision) where t.workbook_rows is distinct from s.workbook_rows or t.saved_breakdown is distinct from s.saved_breakdown or t.captured_at is distinct from s.captured_at) then raise exception 'Conflicting source evidence; no import committed'; end if; end $verify$;`,
    "commit;",
  ];
  await writeFile(
    path.join(destination, "import.sql"),
    statements.join("\n\n") + "\n",
  );
  const parts = createSqlEditorParts({
    wines: rows.map((row) => ({
      ...row,
      version: 1,
      created_at: source.updatedAt,
      updated_at: source.updatedAt,
      archived_at: null,
    })),
    references,
    evidence: evidenceRows,
  });
  const editorDirectory = path.join(destination, "sql-editor");
  await mkdir(editorDirectory, { recursive: true });
  // Remove only our previous generated parts so a changed part count cannot
  // leave obsolete queries in the documented run sequence.
  for (const name of await readdir(editorDirectory)) {
    if (
      /^\d+-wines\.sql$|^\d+-wine-(cost-references|source-evidence)\.sql$/.test(
        name,
      )
    )
      await unlink(path.join(editorDirectory, name));
  }
  for (const part of parts)
    await writeFile(path.join(destination, part.file), part.sql);
  await writeFile(path.join(destination, "audit-wines.sql"), createWineAudit(rows, parts));
  const editorReadme = [
    "# SQL Editor import — prepared, not applied",
    "",
    "The combined import.sql is too large for Supabase SQL Editor. Use these numbered parts instead.",
    "",
    "1. If not already applied successfully, run ../../schema.sql in SQL Editor as postgres first.",
    "2. Open a NEW query (or select all and replace the old query). Paste the ENTIRE contents of ONE numbered file below. Run as postgres.",
    "3. Wait for success, then run the next file in a separate query. Do not concatenate these files or append them to the rejected large query.",
    "4. Run ../../verify.sql after every part has succeeded. Then continue with the private photo upload and team sign-in setup in the module README.",
    "",
    "Every part is a separate transaction, at most 48 KiB. Existing wine IDs, newer edits and archives are left untouched. Historical evidence conflicts roll back that part for review. If interrupted, rerun completed parts or resume at the first unfinished one; both are safe. Stop on errors. If the editor reports an aborted transaction, run ROLLBACK; by itself before retrying the part.",
    "",
    "If wines appear missing, run ../audit-wines.sql as postgres in a new SQL Editor query. This read-only query reports expected, active, archived and missing wines for each wine import part, including exact missing IDs/names. Rerun incomplete parts in order; do not unarchive records automatically. This audit is prepared SQL, not a live database result.",
    "",
    `Totals: ${rows.length} wines, ${references.length} cost references, ${evidenceRows.length} evidence records. Photos are uploaded separately (${images.length}).`,
    "",
    "| Order | File | Source records | Query bytes |",
    "| --- | --- | ---: | ---: |",
    ...parts.map(
      (part, index) =>
        `| ${index + 1} | [${path.basename(part.file)}](${path.basename(part.file)}) | ${part.rows} | ${part.bytes} |`,
    ),
    "",
  ].join("\n");
  await writeFile(path.join(editorDirectory, "README.md"), editorReadme);
  const manifest = {
    sourceRevision: source.revision,
    wines: rows.length,
    costReferences: references.length,
    evidenceRecords: evidenceRows.length,
    images: images.length,
    mode: "prepared-only",
    conflictPolicy: "insert-only; never update or unarchive",
    sqlEditor: {
      maxPartBytes: SQL_EDITOR_PART_BYTES,
      parts: parts.map(({ file, table, rows, bytes }) => ({
        file,
        table,
        rows,
        bytes,
      })),
    },
    files: {},
  };
  for (const name of [
    "wines.json",
    "wine-cost-references.json",
    "wine-source-evidence.json",
    "images.json",
    "import.sql",
    "audit-wines.sql",
    "sql-editor/README.md",
    ...parts.map((part) => part.file),
  ])
    manifest.files[name] = createHash("sha256")
      .update(await readFile(path.join(destination, name)))
      .digest("hex");
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      mode: "offline-only",
      sourceRevision: source.revision,
      wines: rows.length,
      costReferences: references.length,
      evidenceRecords: evidenceRows.length,
      images: images.length,
      writesToSupabase: 0,
    },
    null,
    2,
  ),
);
