import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import {
  applyChanges,
  isWine,
  metrics,
  parseChanges,
  wineStyle,
} from "../lib/model.ts";

const catalogue = JSON.parse(
  readFileSync(new URL("../data/catalogue.json", import.meta.url)),
);
const evidence = JSON.parse(
  readFileSync(new URL("../data/evidence.json", import.meta.url)),
);
const wines = catalogue.wines;
const change = (updates) => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  saved: [],
  deleted: [],
  ...updates,
});

test("migration retains the live 123-wine catalogue, stable IDs, photos and evidence", () => {
  assert.equal(wines.length, 123);
  assert.equal(new Set(wines.map((wine) => wine.id)).size, 123);
  assert.equal(new Set(wines.map((wine) => wine.producer)).size, 22);
  assert.equal(catalogue.source.revision, 1392);
  for (const wine of wines) {
    assert.ok(isWine(wine), wine.id);
    assert.ok(Object.hasOwn(evidence, wine.id), wine.id);
    if (wine.imageUrl)
      assert.ok(
        existsSync(
          new URL(`../assets/images/${wine.imageKey}`, import.meta.url),
        ),
        wine.id,
      );
  }
  assert.equal(wines.filter((wine) => wine.imageUrl).length, 81);
});

test("local edits retain original IDs and frozen cost evidence without changing the source", () => {
  const source = structuredClone(wines);
  const edited = { ...wines[0], sellingPrice: 1234, registeredPrice: 750 };
  const result = applyChanges(wines, change({ saved: [edited] }));
  assert.equal(result.length, wines.length);
  assert.equal(result[0].id, wines[0].id);
  assert.equal(result[0].sellingPrice, 1234);
  assert.deepEqual(result[0].importedCost, source[0].importedCost);
  assert.deepEqual(wines, source);
});

test("an entirely deleted library stays empty on reload and never reseeds itself", () => {
  const raw = JSON.stringify(change({ deleted: wines.map((wine) => wine.id) }));
  assert.deepEqual(applyChanges(wines, parseChanges(raw)), []);
});

test("adding and deleting a local record does not affect imported source records", () => {
  const added = { ...wines[0], id: "new-wine", name: "Test wine" };
  assert.equal(applyChanges(wines, change({ saved: [added] })).length, 124);
  assert.equal(
    applyChanges(wines, change({ saved: [added], deleted: [added.id] })).length,
    123,
  );
});

test("unknown costs remain unknown while valid zero prices are preserved", () => {
  assert.deepEqual(
    metrics({ ...wines[0], importedCost: null, sellingPrice: 100 }),
    { profit: null, margin: null, markup: null },
  );
  assert.deepEqual(
    metrics({
      ...wines[0],
      importedCost: { cost: 50, basis: "Test" },
      sellingPrice: 0,
    }),
    { profit: -50, margin: null, markup: -100 },
  );
  const result = metrics({
    ...wines[0],
    importedCost: { cost: 100, basis: "Test" },
    sellingPrice: 150,
  });
  assert.equal(result.profit, 50);
  assert.equal(result.markup, 50);
  assert.ok(Math.abs(result.margin - 100 / 3) < 1e-10);
});

test("display styles normalize legacy spelling without rewriting imported records", () => {
  assert.equal(wineStyle({ ...wines[0], wineType: "red" }), "Red");
  assert.equal(wineStyle({ ...wines[0], wineType: "Rose" }), "Rosé");
  assert.equal(
    wineStyle({ ...wines[0], wineType: "", variety: "Unknown" }),
    "Other",
  );
});

test("invalid browser data is rejected rather than silently overwriting the library", () => {
  assert.throws(() => parseChanges("broken JSON"));
  assert.throws(() =>
    parseChanges(
      JSON.stringify(change({ saved: [{ ...wines[0], abv: 101 }] })),
    ),
  );
  assert.throws(() =>
    parseChanges(
      JSON.stringify(
        change({
          saved: [
            { ...wines[0], imageUrl: "https://example.com/tracking.png" },
          ],
        }),
      ),
    ),
  );
  assert.throws(() =>
    parseChanges(
      JSON.stringify(change({ saved: [{ ...wines[0], discount: -1 }] })),
    ),
  );
  assert.throws(() =>
    parseChanges(
      JSON.stringify(change({ saved: [{ ...wines[0], caseSize: 1.5 }] })),
    ),
  );
});
