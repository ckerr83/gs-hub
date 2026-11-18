import "server-only";
import { createClient } from "@/lib/supabase/server";
import { collectAll, editableRow, fromRow, type WineRow } from "../lib/records";
import { isWine } from "../lib/model";
import type { Wine, WineEvidence } from "../types";
export class DatabaseError extends Error {
  constructor(
    public code: string,
    public status = 503,
  ) {
    super(code);
  }
}
export async function authorizedClient(write = false) {
  let client;
  try {
    client = await createClient();
  } catch {
    throw new DatabaseError("setup");
  }
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new DatabaseError("auth", 401);
  const access = await client.rpc(write ? "wine_can_write" : "wine_can_read");
  if (access.error) throw new DatabaseError("setup");
  if (access.data !== true) throw new DatabaseError("forbidden", 403);
  return client;
}
const selection = "*, wine_cost_references(*)";
export async function getWineDatabase() {
  const client = await authorizedClient();
  async function revision() {
    // Include archived rows: an archive during loading must invalidate the load.
    const result = await client
      .from("wines")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new DatabaseError("unavailable");
    return result.data?.updated_at ?? null;
  }
  try {
    // These independent checks share one network wait. Keep the permission
    // and revision checks request-local; never cache another user's wine data.
    const [permission, baseline, total] = await Promise.all([
      client.rpc("wine_can_write"),
      revision(),
      client.from("wines").select("id", { count: "exact", head: true }).is("archived_at", null),
    ]);
    if (permission.error || total.error || total.count === null)
      throw new DatabaseError("unavailable");
    const count = total.count;
    const rows = await collectAll<WineRow>(async (after) => {
      let query = client
        .from("wines")
        .select(selection)
        .order("source_revision", {
          referencedTable: "wine_cost_references",
          ascending: false,
        })
        .is("archived_at", null)
        .order("id")
        .limit(500);
      if (after !== null) query = query.gt("id", after);
      const page = await query;
      if (page.error || !page.data)
        throw new DatabaseError("unavailable");
      return { rows: page.data as WineRow[], count };
    });
    if ((await revision()) !== baseline) throw new DatabaseError("incomplete");
    return { wines: rows.map(fromRow), canWrite: permission.data === true };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("incomplete");
  }
}
export async function saveWine(value: unknown, id?: string) {
  const client = await authorizedClient(true);
  if (
    !isWine(value) ||
    value.id.length > 160 ||
    !value.id.trim() ||
    (id && value.id !== id)
  )
    throw new DatabaseError("validation", 400);
  const wine: Wine = value;
  if (id) {
    if (!Number.isSafeInteger(wine.version) || (wine.version ?? 0) < 1)
      throw new DatabaseError("conflict", 409);
    const result = await client.rpc("wine_update", {
      wine_id: id,
      expected_version: wine.version,
      patch: editableRow(wine),
      archive: false,
    });
    if (result.error)
      throw new DatabaseError(
        result.error.code === "40001" ? "conflict" : "write",
        result.error.code === "40001" ? 409 : 500,
      );
    if (!result.data) throw new DatabaseError("write", 500);
    return fromRow(result.data as WineRow);
  } else {
    const result = await client
      .from("wines")
      .insert({ id: wine.id, ...editableRow(wine) })
      .select(selection)
      .single();
    if (result.error)
      throw new DatabaseError(
        result.error.code === "23505" ? "conflict" : "write",
        result.error.code === "23505" ? 409 : 500,
      );
    if (!result.data) throw new DatabaseError("write", 500);
    return fromRow(result.data as WineRow);
  }
}
export async function archiveWine(id: string, version: unknown) {
  const client = await authorizedClient(true);
  if (!Number.isSafeInteger(version) || Number(version) < 1)
    throw new DatabaseError("validation", 400);
  const result = await client.rpc("wine_update", {
    wine_id: id,
    expected_version: version,
    patch: {},
    archive: true,
  });
  if (result.error)
    throw new DatabaseError(
      result.error.code === "40001" ? "conflict" : "write",
      result.error.code === "40001" ? 409 : 500,
    );
}
export async function getWineEvidence(
  id: string,
): Promise<WineEvidence | null> {
  const client = await authorizedClient();
  const result = await client
    .from("wine_source_evidence")
    .select("workbook_rows,saved_breakdown")
    .eq("wine_id", id)
    .order("source_revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new DatabaseError("unavailable");
  return result.data
    ? {
        workbookRows: result.data.workbook_rows,
        savedBreakdown: result.data.saved_breakdown,
      }
    : null;
}
