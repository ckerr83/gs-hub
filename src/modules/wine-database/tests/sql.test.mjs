import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
test("prepared SQL enforces authorization, optimistic updates and repeatable recovery in local PostgreSQL", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text); alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon; grant select on storage.objects to authenticated,anon;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('33333333-3333-3333-3333-333333333333');`);
  const schema = readFileSync(root + "database/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema);
  const sql = readFileSync(root + "database/import/import.sql", "utf8");
  const manifest = JSON.parse(
    readFileSync(root + "database/import/manifest.json", "utf8"),
  );
  const editorParts = manifest.sqlEditor.parts.map((part) => {
    const bytes = readFileSync(root + "database/import/" + part.file);
    assert.equal(bytes.length, part.bytes);
    assert.ok(bytes.length <= 48 * 1024, part.file);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      manifest.files[part.file],
    );
    return { ...part, sql: bytes.toString("utf8") };
  });
  async function runEditorParts() {
    for (const part of editorParts) await db.exec(part.sql);
  }
  const audit = readFileSync(root + "database/import/audit-wines.sql", "utf8");
  // Diagnose a partial editor import before any repair is attempted.
  await db.exec(editorParts[0].sql);
  const partialAudit = (await db.query(audit)).rows;
  assert.equal(partialAudit.reduce((n, row) => n + row.expected_wines, 0), 123);
  assert.equal(partialAudit.reduce((n, row) => n + row.active_wines, 0), 26);
  assert.equal(partialAudit.reduce((n, row) => n + row.missing_wines, 0), 97);
  assert.equal(partialAudit[0].import_part, "001-wines.sql");
  assert.deepEqual(partialAudit[0].missing_records, []);
  assert.equal(partialAudit[1].missing_records.length, 26);
  await runEditorParts();
  await runEditorParts();
  // Both direct-connection SQL and the editor parts must coexist safely.
  await db.exec(sql);
  const sourceEvidence = JSON.parse(
    readFileSync(root + "database/import/wine-source-evidence.json", "utf8"),
  );
  const actualEvidence = new Map(
    (
      await db.query(
        "select wine_id,workbook_rows,saved_breakdown from public.wine_source_evidence",
      )
    ).rows.map((row) => [row.wine_id, row]),
  );
  for (const row of sourceEvidence) {
    assert.deepEqual(
      actualEvidence.get(row.wine_id).workbook_rows,
      row.workbook_rows,
    );
    assert.deepEqual(
      actualEvidence.get(row.wine_id).saved_breakdown,
      row.saved_breakdown,
    );
  }
  // A conflict must roll back every insertion in that part, without overwriting
  // existing history. Earlier parts remain committed and resuming is supported.
  const evidencePart = editorParts.find(
    (part) => part.table === "wine_source_evidence",
  );
  const conflict = sourceEvidence[0],
    absent = sourceEvidence[1];
  await db.query(
    "update public.wine_source_evidence set saved_breakdown=$1 where wine_id=$2 and source_revision=$3",
    [{ qaConflict: true }, conflict.wine_id, conflict.source_revision],
  );
  await db.query(
    "delete from public.wine_source_evidence where wine_id=$1 and source_revision=$2",
    [absent.wine_id, absent.source_revision],
  );
  await assert.rejects(
    db.exec(evidencePart.sql),
    /Conflicting historical evidence/,
  );
  await db.exec("rollback;");
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.wine_source_evidence where wine_id=$1",
        [absent.wine_id],
      )
    ).rows[0].n,
    0,
  );
  assert.deepEqual(
    (
      await db.query(
        "select saved_breakdown from public.wine_source_evidence where wine_id=$1",
        [conflict.wine_id],
      )
    ).rows[0].saved_breakdown,
    { qaConflict: true },
  );
  await db.query(
    "update public.wine_source_evidence set saved_breakdown=$1 where wine_id=$2 and source_revision=$3",
    [conflict.saved_breakdown, conflict.wine_id, conflict.source_revision],
  );
  await db.exec(evidencePart.sql);
  assert.equal(
    (await db.query("select count(*)::int as n from public.wines")).rows[0].n,
    123,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.wine_cost_references",
      )
    ).rows[0].n,
    244,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.wine_source_evidence",
      )
    ).rows[0].n,
    123,
  );
  await db.exec(
    `insert into wine_private.team_access(user_id,can_write) values ('11111111-1111-1111-1111-111111111111',true),('22222222-2222-2222-2222-222222222222',false);`,
  );
  const patch = (
    await db.query(
      "select to_jsonb(w)-array['id','image_path','landed_reference','source_metadata','version','created_at','updated_at','archived_at'] as p from public.wines w where id='workbook-4'",
    )
  ).rows[0].p;
  async function identity(role, id = "") {
    await db.exec(`reset role; set role ${role};`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  async function rejected(sql, args, code) {
    await assert.rejects(db.query(sql, args), (error) => error.code === code);
  }
  await identity("anon");
  await rejected("select * from public.wines", [], "42501");
  await rejected("select public.wine_can_read()", [], "42501");
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-4", 1, patch, false],
    "42501",
  );
  await identity("authenticated", "33333333-3333-3333-3333-333333333333");
  assert.equal(
    (await db.query("select count(*)::int as n from public.wines")).rows[0].n,
    0,
  );
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-4", 1, patch, false],
    "42501",
  );
  await identity("authenticated", "22222222-2222-2222-2222-222222222222");
  assert.equal(
    (await db.query("select count(*)::int as n from public.wines")).rows[0].n,
    123,
  );
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-4", 1, patch, false],
    "42501",
  );
  await identity("authenticated", "11111111-1111-1111-1111-111111111111");
  await rejected(
    "update public.wines set sales_price=1 where id='workbook-4'",
    [],
    "42501",
  );
  await rejected("delete from public.wines where id='workbook-4'", [], "42501");
  await rejected(
    "update public.wine_source_evidence set saved_breakdown='{}'",
    [],
    "42501",
  );
  const changed = (
    await db.query("select public.wine_update($1,$2,$3,$4) as value", [
      "workbook-4",
      1,
      { ...patch, sales_price: 1234 },
      false,
    ])
  ).rows[0].value;
  assert.equal(changed.version, 2);
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-4", 1, patch, false],
    "40001",
  );
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-4", 2, { ...patch, source_metadata: {} }, false],
    "22023",
  );
  await db.query("select public.wine_update($1,$2,$3,$4)", [
    "workbook-5",
    1,
    {},
    true,
  ]);
  await rejected(
    "select public.wine_update($1,$2,$3,$4)",
    ["workbook-5", 2, patch, false],
    "40001",
  );
  await db.exec(
    "insert into public.wines(id,name,producer,source_currency,supplier_discount) values ('qa-new','Test','Producer','',null)",
  );
  assert.equal(
    (
      await db.query(
        "select supplier_discount from public.wines where id='qa-new'",
      )
    ).rows[0].supplier_discount,
    null,
  );
  await rejected(
    "insert into public.wines(id,name,producer,source_metadata) values ('qa-invalid','Test','Producer','{}')",
    [],
    "42501",
  );
  await identity("postgres");
  await runEditorParts();
  await db.exec(sql);
  const completedAudit = (await db.query(audit)).rows;
  assert.equal(completedAudit.reduce((n, row) => n + row.missing_wines, 0), 0);
  assert.equal(completedAudit.reduce((n, row) => n + row.active_wines, 0), 122);
  assert.equal(completedAudit.reduce((n, row) => n + row.archived_wines, 0), 1);
  assert.equal(completedAudit.flatMap((row) => row.archived_records)[0].id, "workbook-5");
  assert.equal(
    (
      await db.query(
        "select sales_price from public.wines where id='workbook-4'",
      )
    ).rows[0].sales_price * 1,
    1234,
  );
  assert.ok(
    (
      await db.query(
        "select archived_at from public.wines where id='workbook-5'",
      )
    ).rows[0].archived_at,
  );
  assert.equal(
    (await db.query("select version from public.wines where id='workbook-4'"))
      .rows[0].version,
    2,
  );
  // This emulates Supabase schemas locally. It is not live Supabase verification.
  await db.close();
});
