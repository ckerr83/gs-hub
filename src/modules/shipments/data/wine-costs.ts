import type { Calculation, Shipment, ShipmentData, Snapshot } from "../types";
import { calculate } from "../calculations/shipment-costing";
import { D, sum } from "../calculations/decimal";

export type WineShipmentCost = {
  shipmentId: string;
  shipmentName: string;
  versionId: string | null;
  versionName: string;
  date: string | null;
  kind: "calculated" | "actual";
  status: "draft" | "forecast" | "partial" | "complete";
  currency: "THB";
  vatBasis: "ex-vat";
  bottles: number;
  total: number | null;
  cost: number | null;
};
export type WineShipmentCosts = {
  calculated: WineShipmentCost | null;
  actual: WineShipmentCost | null;
  history: WineShipmentCost[];
};

// A read-only projection of persisted shipment documents. Never copy costs back
// into editable wine fields or replace the original imported evidence.
export function shipmentWineCosts(shipments: Shipment[]): Map<string, WineShipmentCosts> {
  const histories = new Map<string, WineShipmentCost[]>();
  function add(shipment: Shipment, data: ShipmentData, calculation: Calculation, snapshot?: Snapshot) {
    const groups = new Map<string, typeof data.wines>();
    for (const wine of data.wines) {
      if (!wine.productId) continue; // Names and SKUs are not identity keys.
      const group = groups.get(wine.productId) ?? [];
      group.push(wine);
      groups.set(wine.productId, group);
    }
    const lines = new Map(calculation.lines.map(line => [line.id, line]));
    for (const [wineId, wines] of groups) {
      const bottles = wines.reduce((n, wine) => n + wine.qty, 0);
      const valid = !calculation.errors.length && bottles > 0 && wines.every(wine => {
        const line = lines.get(wine.id);
        return line && line.qty === wine.qty && Number.isFinite(line.cost) && line.cost >= 0;
      });
      const total = valid ? sum(wines.map(wine => D(lines.get(wine.id)!.cost))).money() : null;
      const actual = snapshot && snapshot.kind !== "Forecast";
      const entry: WineShipmentCost = {
        shipmentId: shipment.id, shipmentName: shipment.name,
        versionId: snapshot?.id ?? null, versionName: snapshot?.name ?? "",
        date: snapshot?.created || shipment.updatedAt,
        kind: actual ? "actual" : "calculated",
        status: !snapshot ? "draft" : !actual ? "forecast" : snapshot.kind === "Actual (complete)" ? "complete" : "partial",
        currency: "THB", vatBasis: "ex-vat", bottles, total,
        // Weight repeated wines across pallets by bottles, not rounded unit costs.
        cost: total === null ? null : D(total).div(D(bottles)).money(),
      };
      const history = histories.get(wineId) ?? [];
      history.push(entry);
      histories.set(wineId, history);
    }
  }
  for (const shipment of shipments) {
    for (const snapshot of shipment.snapshots) {
      // Imported saved results retain their original arithmetic and allocations.
      add(shipment, snapshot.data, snapshot.calculation ?? calculate(snapshot.data), snapshot);
    }
    // An actuals draft may still contain estimates. Only an explicitly recorded
    // actual version supplies the actual column; arrival alone is not evidence.
    if (shipment.stage === "proposed") add(shipment, shipment, calculate(shipment));
  }
  return new Map([...histories].map(([wineId, history]) => {
    history.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") ||
      b.shipmentId.localeCompare(a.shipmentId) || (b.versionId ?? "").localeCompare(a.versionId ?? ""));
    return [wineId, {
      calculated: history.find(entry => entry.kind === "calculated") ?? null,
      actual: history.find(entry => entry.kind === "actual") ?? null,
      history,
    }];
  }));
}

export function withShipmentCosts<T extends { id: string }>(wines: T[], shipments: Shipment[]) {
  const costs = shipmentWineCosts(shipments);
  return wines.map(wine => ({ ...wine, shipmentCosts: costs.get(wine.id) ?? {
    calculated: null, actual: null, history: [],
  } }));
}
