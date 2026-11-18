// Generate independently runnable, byte-bounded SQL Editor transactions.
// No database connections or writes are made by this module.
export const SQL_EDITOR_PART_BYTES = 48 * 1024;
const tables = {
  wines: { keys: "id", immutable: false },
  wine_cost_references: {
    keys: "wine_id,reference_kind,source_revision",
    immutable: true,
  },
  wine_source_evidence: {
    keys: "wine_id,source_revision",
    immutable: true,
  },
};
function batchSql(table, rows, filename) {
  const definition = tables[table];
  if (!definition) throw new Error("Unknown import table");
  const payload = "'" + JSON.stringify(rows).replaceAll("'", "''") + "'::jsonb";
  return [
    `-- PREPARED ONLY: ${filename}. Run this entire file on its own as postgres.`,
    "-- Run schema.sql first, then SQL Editor parts in filename order. Safe to retry.",
    "begin;",
    // Stage each source payload once, keeping verification within the byte limit.
    `create temporary table wine_recovery_batch on commit drop as select * from jsonb_populate_recordset(null::public.${table}, ${payload});`,
    `insert into public.${table} select * from pg_temp.wine_recovery_batch on conflict (${definition.keys}) do nothing;`,
    ...(definition.immutable
      ? [
          `do $verify$ begin if exists (select 1 from pg_temp.wine_recovery_batch s join public.${table} t using (${definition.keys}) where to_jsonb(t) is distinct from to_jsonb(s)) then raise exception 'Conflicting historical evidence; this import part was not committed'; end if; end $verify$;`,
        ]
      : []),
    `select '${filename}'::text as completed_part, count(*)::integer as present_records from pg_temp.wine_recovery_batch s join public.${table} t using (${definition.keys});`,
    "commit;",
    "",
  ].join("\n\n");
}
export function createSqlEditorParts({ wines, references, evidence }) {
  const parts = [];
  for (const [table, sourceRows] of [
    ["wines", wines],
    ["wine_cost_references", references],
    ["wine_source_evidence", evidence],
  ]) {
    let batch = [];
    const filename = () =>
      `${String(parts.length + 1).padStart(3, "0")}-${table.replaceAll("_", "-")}.sql`;
    function flush() {
      if (!batch.length) return;
      const name = filename();
      const sql = batchSql(table, batch, name);
      parts.push({
        file: `sql-editor/${name}`,
        table,
        rows: batch.length,
        bytes: Buffer.byteLength(sql, "utf8"),
        sql,
      });
      batch = [];
    }
    for (const row of sourceRows) {
      const candidate = batchSql(table, [...batch, row], filename());
      if (Buffer.byteLength(candidate, "utf8") > SQL_EDITOR_PART_BYTES) flush();
      if (
        Buffer.byteLength(
          batchSql(table, [...batch, row], filename()),
          "utf8",
        ) > SQL_EDITOR_PART_BYTES
      )
        throw new Error(
          `An individual ${table} record exceeds the SQL Editor part limit; use the direct-connection import.`,
        );
      batch.push(row);
    }
    flush();
  }
  return parts;
}

// One read-only result per wine import part. No prices, user data or mutations.
export function createWineAudit(wines, parts) {
  let offset = 0;
  const expected = parts
    .filter((part) => part.table === "wines")
    .flatMap((part) => {
      const batch = wines.slice(offset, offset + part.rows);
      offset += part.rows;
      return batch.map(
        ({ id, name, producer }) => ({
          id,
          name,
          producer,
          import_part: part.file.split("/").at(-1),
        }),
      );
    });
  if (offset !== wines.length) throw new Error("Wine audit part counts do not match source");
  const payload = "'" + JSON.stringify(expected).replaceAll("'", "''") + "'::jsonb";
  return `-- PREPARED ONLY. Read-only: run in Supabase SQL Editor as postgres.
-- Missing means absent by stable ID; archived IDs must not be restored automatically.
-- Run any incomplete import parts separately; existing IDs/edits/archives are preserved.
with expected as (
  select * from jsonb_to_recordset(${payload})
    as s(id text, name text, producer text, import_part text)
)
select s.import_part,
  count(*)::integer as expected_wines,
  count(w.id) filter (where w.archived_at is null)::integer as active_wines,
  count(w.id) filter (where w.archived_at is not null)::integer as archived_wines,
  count(*) filter (where w.id is null)::integer as missing_wines,
  coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'producer',s.producer)
    order by s.producer,s.name) filter (where w.id is null),'[]'::jsonb) as missing_records,
  coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'producer',w.producer,'archived_at',w.archived_at)
    order by w.producer,w.name) filter (where w.archived_at is not null),'[]'::jsonb) as archived_records
from expected s left join public.wines w on w.id=s.id
group by s.import_part order by s.import_part;
`;
}
