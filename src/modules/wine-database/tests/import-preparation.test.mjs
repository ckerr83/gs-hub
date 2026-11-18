import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  createSqlEditorParts,
  SQL_EDITOR_PART_BYTES,
} from "../scripts/sql-editor-import.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
test("offline import regenerates complete byte-bounded editor parts deterministically", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "gs-wine-import-"));
  try {
    const run = () =>
      execFileSync(
        process.execPath,
        [path.join(root, "scripts/prepare-import.mjs"), "--out", directory],
        { encoding: "utf8" },
      );
    assert.equal(JSON.parse(run()).writesToSupabase, 0);
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.sqlEditor.maxPartBytes, 48 * 1024);
    assert.deepEqual(
      manifest,
      JSON.parse(
        readFileSync(path.join(root, "database/import/manifest.json"), "utf8"),
      ),
    );
    const counts = {
      wines: 0,
      wine_cost_references: 0,
      wine_source_evidence: 0,
    };
    for (const part of manifest.sqlEditor.parts) {
      const bytes = readFileSync(path.join(directory, part.file));
      assert.ok(bytes.length <= SQL_EDITOR_PART_BYTES, part.file);
      assert.equal(bytes.length, part.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        manifest.files[part.file],
      );
      counts[part.table] += part.rows;
    }
    assert.deepEqual(counts, {
      wines: 123,
      wine_cost_references: 244,
      wine_source_evidence: 123,
    });
    writeFileSync(
      path.join(directory, "sql-editor/999-wines.sql"),
      "obsolete generated part",
    );
    run();
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")),
      manifest,
    );
    assert.throws(
      () => readFileSync(path.join(directory, "sql-editor/999-wines.sql")),
      { code: "ENOENT" },
    );
    assert.throws(
      () =>
        createSqlEditorParts({
          wines: [{ id: "large", name: "ก".repeat(SQL_EDITOR_PART_BYTES) }],
          references: [],
          evidence: [],
        }),
      /individual wines record exceeds/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
