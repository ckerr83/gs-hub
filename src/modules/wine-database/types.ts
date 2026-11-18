export type CostReference = {
  cost: number | null;
  basis: string;
  detail?: string;
  excise?: number | null;
  shipmentId?: string;
  versionId?: string;
  date?: string;
};

export type Wine = {
  version?: number;
  updatedAt?: string;
  archivedAt?: string | null;
  id: string;
  name: string;
  producer: string;
  vintage: string;
  variety: string;
  wineType: string;
  country: string;
  sku: string;
  abv: number | null;
  ml: number | null;
  caseSize?: number | null;
  sourceCost: number | null;
  currency: string;
  discount: number | null;
  registeredPrice: number | null;
  registeredPriceSource?: string;
  sellingPrice: number | null;
  landedReference: number | null;
  recommendationCost?: number | null;
  rrp?: number | null;
  sourceRow?: number;
  sourceNote?: string;
  imageKey?: string;
  imageUrl: string | null;
  importedCost: CostReference | null;
  historicalCost: CostReference | null;
};

export type WineChanges = {
  version: 1;
  updatedAt: string;
  saved: Wine[];
  deleted: string[];
};
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type WineEvidence = {
  workbookRows: JsonValue[];
  savedBreakdown: JsonValue;
};
