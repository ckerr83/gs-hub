import type { CostReference, Wine } from "../types.ts";
// Keep nullable database fields nullable. Historical payloads are never form inputs.
export type WineRow = {
  id: string;
  name: string;
  producer: string;
  vintage: string;
  variety: string;
  wine_type: string;
  country: string;
  sku: string;
  abv: number | null;
  bottle_ml: number | null;
  bottles_per_case: number | null;
  source_cost: number | null;
  source_currency: string;
  supplier_discount: number | null;
  registered_price: number | null;
  registered_price_source: string | null;
  sales_price: number | null;
  image_path: string | null;
  landed_reference: number | null;
  recommendation_cost: number | null;
  rrp: number | null;
  source_metadata: { originalRecord?: Partial<Wine> };
  version: number;
  updated_at: string;
  archived_at: string | null;
  wine_cost_references?: {
    reference_kind: string;
    source_revision: number;
    source_payload: CostReference;
  }[];
};
export function fromRow(row: WineRow): Wine {
  const references = [...(row.wine_cost_references ?? [])].sort(
    (a, b) => b.source_revision - a.source_revision,
  );
  const original = row.source_metadata?.originalRecord;
  return {
    id: row.id,
    name: row.name,
    producer: row.producer,
    vintage: row.vintage,
    variety: row.variety,
    wineType: row.wine_type,
    country: row.country,
    sku: row.sku,
    abv: row.abv,
    ml: row.bottle_ml,
    caseSize: row.bottles_per_case,
    sourceCost: row.source_cost,
    currency: row.source_currency,
    discount: row.supplier_discount,
    registeredPrice: row.registered_price,
    registeredPriceSource: row.registered_price_source ?? undefined,
    sellingPrice: row.sales_price,
    landedReference: row.landed_reference,
    recommendationCost: row.recommendation_cost,
    rrp: row.rrp,
    imageKey: row.image_path ?? undefined,
    imageUrl: row.image_path
      ? `/wine-database/images/${encodeURIComponent(row.image_path)}`
      : null,
    importedCost:
      references.find((r) => r.reference_kind === "displayed")
        ?.source_payload ?? null,
    historicalCost:
      references.find((r) => r.reference_kind === "historical")
        ?.source_payload ?? null,
    sourceRow: original?.sourceRow,
    sourceNote: original?.sourceNote,
    version: row.version,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}
// Explicit allowlist: clients cannot edit IDs, timestamps, version, image paths or evidence.
export function editableRow(wine: Wine) {
  return {
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
    rrp: wine.rrp ?? null,
    recommendation_cost: wine.recommendationCost ?? null,
  };
}
export async function collectAll<T extends { id: string }>(
  fetchPage: (after: string | null) => Promise<{ rows: T[]; count: number }>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let after: string | null = null,
    expected: number | null = null;
  for (;;) {
    const page = await fetchPage(after);
    if (expected !== null && page.count !== expected)
      throw new Error("incomplete");
    expected = page.count;
    if (!page.rows.length) break;
    for (const row of page.rows) {
      if (seen.has(row.id)) throw new Error("incomplete");
      seen.add(row.id);
      after = row.id;
      rows.push(row);
    }
    if (rows.length > expected) throw new Error("incomplete");
    // The exact count tells us when the final record arrived. Short pages can
    // still be capped by PostgREST, so keep following the cursor until then.
    if (rows.length === expected) break;
  }
  if (rows.length !== expected) throw new Error("incomplete");
  return rows;
}
