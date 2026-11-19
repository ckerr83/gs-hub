import type { Wine, WineChanges } from "../types";

export function wineStyle(wine: Wine) {
  const style = wine.wineType?.toLowerCase() || wine.variety?.toLowerCase();
  if (style === "red") return "Red";
  if (style === "white") return "White";
  if (["rose", "rosé"].includes(style)) return "Rosé";
  if (style === "sparkling") return "Sparkling";
  return "Other";
}

export function costBasis(wine: Wine) {
  const costs = wine.shipmentCosts;
  if (costs?.actual) return costs.actual.status === "complete" ? "Actual" : "Actual · partial";
  if (costs?.calculated) return "Calculated";
  if (costs?.history.length) return "No cost basis";
  return wine.importedCost?.cost != null ? "Landed reference" : "No cost basis";
}

// Recorded actuals supersede calculations, with partial versions labelled.
// Missing shipment inputs must not silently fall back to an old imported value.
export function cost(wine: Wine) {
  const basis = costBasis(wine);
  if (basis === "Actual" || basis === "Actual · partial") return wine.shipmentCosts!.actual!.cost;
  if (basis === "Calculated") return wine.shipmentCosts!.calculated!.cost;
  if (basis === "No cost basis") return null;
  return wine.importedCost?.cost ?? null;
}
export function metrics(wine: Wine) {
  const landed = cost(wine),
    sales = wine.sellingPrice;
  const profit = landed != null && sales != null ? sales - landed : null;
  return {
    profit,
    margin:
      profit != null && sales != null && sales > 0
        ? (profit / sales) * 100
        : null,
    markup:
      profit != null && landed != null && landed > 0
        ? (profit / landed) * 100
        : null,
  };
}

export function applyChanges(original: Wine[], changes: WineChanges | null) {
  if (!changes) return original;
  const deleted = new Set(changes.deleted),
    saved = new Map(changes.saved.map((wine) => [wine.id, wine]));
  const result = original
    .filter((wine) => !deleted.has(wine.id))
    .map((wine) => saved.get(wine.id) ?? wine);
  const originalIds = new Set(original.map((wine) => wine.id));
  return [
    ...result,
    ...changes.saved.filter(
      (wine) => !originalIds.has(wine.id) && !deleted.has(wine.id),
    ),
  ];
}

export function isWine(value: unknown): value is Wine {
  if (!value || typeof value !== "object") return false;
  const wine = value as Record<string, unknown>;
  if (
    ![
      "id",
      "name",
      "producer",
      "vintage",
      "variety",
      "wineType",
      "country",
      "sku",
      "currency",
    ].every((key) => typeof wine[key] === "string")
  )
    return false;
  if (!(wine.name as string).trim() || !(wine.producer as string).trim())
    return false;
  if (
    ![
      "abv",
      "ml",
      "sourceCost",
      "registeredPrice",
      "sellingPrice",
      "landedReference",
    ].every(
      (key) =>
        wine[key] === null ||
        (typeof wine[key] === "number" &&
          Number.isFinite(wine[key]) &&
          (wine[key] as number) >= 0),
    )
  )
    return false;
  if (
    wine.discount !== null &&
    (typeof wine.discount !== "number" ||
      !Number.isFinite(wine.discount) ||
      wine.discount < 0 ||
      wine.discount > 100)
  )
    return false;
  for (const key of ["rrp", "recommendationCost"]) {
    if (
      wine[key] != null &&
      (typeof wine[key] !== "number" ||
        !Number.isFinite(wine[key]) ||
        (wine[key] as number) < 0)
    )
      return false;
  }
  if (wine.abv != null && (wine.abv as number) > 100) return false;
  if (wine.ml != null && (wine.ml as number) <= 0) return false;
  if (
    wine.caseSize != null &&
    (!Number.isSafeInteger(wine.caseSize) || (wine.caseSize as number) < 1)
  )
    return false;
  if (
    wine.imageUrl !== null &&
    (typeof wine.imageUrl !== "string" ||
      !/^\/(?:wine-database|wine-library)\/images\/[a-f0-9-]{36}\.(webp|png|jpg)$/.test(
        wine.imageUrl,
      ))
  )
    return false;
  for (const key of ["importedCost", "historicalCost"]) {
    const ref = wine[key];
    if (
      ref !== null &&
      (!ref ||
        typeof ref !== "object" ||
        typeof (ref as Record<string, unknown>).basis !== "string" ||
        !(
          (ref as Record<string, unknown>).cost === null ||
          (typeof (ref as Record<string, unknown>).cost === "number" &&
            Number.isFinite((ref as Record<string, unknown>).cost))
        ))
    )
      return false;
  }
  return true;
}

export function parseChanges(raw: string | null): WineChanges | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as WineChanges;
  if (
    value.version !== 1 ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.saved) ||
    !value.saved.every(isWine) ||
    !Array.isArray(value.deleted) ||
    !value.deleted.every((id) => typeof id === "string")
  )
    throw new Error("The local wine database could not be read.");
  return value;
}
