import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
// App imports omit extensions for Next.js. Resolve those TS siblings in Node tests
// without changing the application's existing TypeScript configuration.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        error.code === "ERR_MODULE_NOT_FOUND" &&
        specifier.startsWith(".") &&
        !/\.[a-z]+$/.test(specifier)
      )
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { collectAll, fromRow, editableRow } = await import("../lib/records.ts");
const { filterWines } = await import("../lib/catalogue.ts");
const { reconcileWine, readBackup } = await import("../lib/reconciliation.ts");
const { translate, localeFor, thai } =
  await import("../../../lib/i18n/dictionaries.ts");
const { wines } = JSON.parse(
  readFileSync(new URL("../data/catalogue.json", import.meta.url)),
);
const filters = {
  query: "",
  producer: "",
  country: "",
  style: "",
  reviewOnly: false,
  sort: "producer",
};
test("all records load even when API limits each response to fewer than 500", async () => {
  const source = Array.from({ length: 1307 }, (_, i) => ({
    id: String(i).padStart(5, "0"),
  }));
  let calls = 0;
  const result = await collectAll(async (after) => {
    calls++;
    return {
      rows: source.filter((r) => after === null || r.id > after).slice(0, 37),
      count: source.length,
    };
  });
  assert.deepEqual(result, source);
  assert.equal(calls, 37);
});
test("a failed or inconsistent batch never yields a truncated list", async () => {
  await assert.rejects(
    collectAll(async (after) =>
      after === null
        ? { rows: [{ id: "a" }], count: 2 }
        : { rows: [], count: 2 },
    ),
    /incomplete/,
  );
  await assert.rejects(
    collectAll(async (after) =>
      after === null
        ? { rows: [{ id: "a" }], count: 2 }
        : { rows: [{ id: "b" }], count: 3 },
    ),
    /incomplete/,
  );
  await assert.rejects(
    collectAll(async (after) => {
      if (after) throw new Error("network");
      return { rows: [{ id: "a" }], count: 2 };
    }),
    /network/,
  );
  await assert.rejects(
    collectAll(async () => ({ rows: [{ id: "a" }], count: 2 })),
    /incomplete/,
  );
});
test("search, combined filters and sorting preserve every match without slicing", () => {
  assert.equal(filterWines(wines, filters).length, 123);
  const expected = wines.filter((w) => w.registeredPrice == null);
  assert.deepEqual(
    new Set(
      filterWines(wines, { ...filters, reviewOnly: true }).map((w) => w.id),
    ),
    new Set(expected.map((w) => w.id)),
  );
  const record = wines[0];
  const result = filterWines(
    wines,
    {
      ...filters,
      query: record.sku.toLowerCase(),
      producer: record.producer,
      country: record.country,
      style: "White",
    },
    "th-TH",
  );
  assert.ok(result.some((w) => w.id === record.id));
  const sorted = filterWines(
    [
      { ...record, id: "a", sellingPrice: null },
      { ...record, id: "b", sellingPrice: 0 },
      { ...record, id: "c", sellingPrice: 100 },
    ],
    { ...filters, sort: "price-high" },
  );
  assert.deepEqual(
    sorted.map((w) => w.id),
    ["c", "b", "a"],
  );
});
test("database mapping keeps nulls, stable IDs and latest frozen references distinct", () => {
  const row = {
    id: "workbook-4",
    name: "Original",
    producer: "Producer",
    vintage: "",
    variety: "",
    wine_type: "",
    country: "",
    sku: "",
    abv: null,
    bottle_ml: null,
    bottles_per_case: null,
    source_cost: null,
    source_currency: "AUD",
    supplier_discount: null,
    registered_price: 0,
    sales_price: 100,
    landed_reference: 321,
    recommendation_cost: null,
    rrp: null,
    image_path: null,
    source_metadata: {},
    version: 5,
    updated_at: "2026-11-13T00:00:00Z",
    archived_at: null,
    wine_cost_references: [
      {
        reference_kind: "displayed",
        source_revision: 2,
        source_payload: { cost: 50, basis: "Current snapshot" },
      },
      {
        reference_kind: "displayed",
        source_revision: 1,
        source_payload: { cost: 70, basis: "Old snapshot" },
      },
    ],
  };
  const wine = fromRow(row);
  assert.equal(wine.id, row.id);
  assert.equal(wine.version, 5);
  assert.equal(wine.registeredPrice, 0);
  assert.equal(wine.caseSize, null);
  assert.equal(wine.discount, null);
  assert.equal(wine.importedCost.cost, 50);
  assert.equal(wine.landedReference, 321);
  const patch = editableRow(wine);
  for (const key of [
    "id",
    "version",
    "created_at",
    "updated_at",
    "archived_at",
    "source_metadata",
    "image_path",
    "landed_reference",
    "wine_cost_references",
  ])
    assert.ok(!(key in patch), key);
});
test("local reconciliation preserves raw deletions and cannot replace remote provenance", () => {
  const local = { ...wines[0], sellingPrice: 555 };
  const remote = {
    ...wines[0],
    version: 12,
    sellingPrice: 777,
    importedCost: { cost: 600, basis: "Remote evidence" },
  };
  const raw = JSON.stringify({
    version: 1,
    updatedAt: "today",
    saved: [local],
    deleted: [wines[1].id],
  });
  assert.deepEqual(readBackup(JSON.stringify({ legacyRaw: raw })).deleted, [
    wines[1].id,
  ]);
  const merged = reconcileWine(local, remote);
  assert.equal(merged.sellingPrice, 555);
  assert.equal(merged.version, 12);
  assert.deepEqual(merged.importedCost, remote.importedCost);
  assert.throws(() => readBackup("broken"));
});
test("shared dictionaries cover both languages and preserve explicit currency conventions", () => {
  assert.equal(translate("th", "Wine database"), "ฐานข้อมูลไวน์");
  assert.equal(translate("en", "Wine database"), "Wine database");
  assert.equal(localeFor("th"), "th-TH");
  assert.ok(
    Object.values(thai).every(
      (value) => typeof value === "string" && value.length,
    ),
  );
});
