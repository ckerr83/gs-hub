import type { Shipment } from "../types";

type RecordVersion = { id: string; version: number };
const CONCURRENCY = 4;

// Keep shipment_get's complete histories and permission checks. Bound active
// requests so a large list cannot flood Supabase with one request per record.
export async function readShipmentDocuments(
  rows: RecordVersion[],
  read: (id: string) => Promise<Shipment>,
): Promise<Shipment[]> {
  const shipments: Shipment[] = [];
  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    const batch = await Promise.all(rows.slice(index, index + CONCURRENCY).map(async row => {
      const shipment = await read(row.id);
      if (shipment.id !== row.id || shipment.version !== row.version)
        throw new Error("conflict");
      return shipment;
    }));
    shipments.push(...batch);
  }
  return shipments;
}
