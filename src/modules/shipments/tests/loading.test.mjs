import "./resolve.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readShipmentDocuments } from "../server/read-documents.ts";

test("shipment loading bounds concurrent requests and preserves full documents in list order", async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: `shipment-${index}`, version: 3 }));
  let active = 0, maxActive = 0, calls = 0;
  const result = await readShipmentDocuments(rows, async id => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { id, version: 3, snapshots: Array.from({ length: 1100 }, (_, n) => ({ id: `history-${n}` })), notes: [{ text: "Preserve this history" }], wines: [{ id: "wine" }] };
  });
  assert.deepEqual(result.map(shipment => shipment.id), rows.map(row => row.id));
  assert.equal(calls, 12); assert.equal(maxActive, 4);
  assert.equal(result[0].snapshots.length, 1100);
  assert.deepEqual(result[0].notes, [{ text: "Preserve this history" }]);
});
test("changed versions, wrong IDs and failed reads reject the entire shipment load", async () => {
  const rows = [{ id: "a", version: 2 }];
  await assert.rejects(readShipmentDocuments(rows, async () => ({ id: "a", version: 3 })), /conflict/);
  await assert.rejects(readShipmentDocuments(rows, async () => ({ id: "b", version: 2 })), /conflict/);
  await assert.rejects(readShipmentDocuments(rows, async () => { throw new Error("offline"); }), /offline/);
  assert.deepEqual(await readShipmentDocuments([], async () => assert.fail("Empty lists do not request documents")), []);
});
