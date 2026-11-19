import { isWine, parseChanges } from "./model";
import type { Wine, WineChanges } from "../types.ts";
export function readBackup(raw: string): WineChanges {
  const value = JSON.parse(raw);
  if (typeof value.legacyRaw === "string") return readBackup(value.legacyRaw);
  if (Array.isArray(value.wines) && value.wines.every(isWine))
    return {
      version: 1,
      updatedAt: value.exportedAt ?? "",
      saved: value.wines,
      deleted: [],
    };
  const changes = parseChanges(raw);
  if (!changes) throw new Error("invalid");
  return changes;
}
export function reconcileWine(local: Wine, remote?: Wine): Wine {
  return {
    ...local,
    version: remote?.version,
    updatedAt: remote?.updatedAt,
    importedCost: remote?.importedCost ?? null,
    historicalCost: remote?.historicalCost ?? null,
    shipmentCosts: remote?.shipmentCosts,
    landedReference: remote?.landedReference ?? null,
    sourceNote: remote?.sourceNote,
    imageUrl: remote?.imageUrl ?? null,
    imageKey: remote?.imageKey,
  };
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
