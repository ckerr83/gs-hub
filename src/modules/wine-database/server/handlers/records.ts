import {
  archiveWine,
  DatabaseError,
  getWineDatabase,
  saveWine,
} from "../repository";
import { loadShipments } from "@/modules/shipments/server/repository";
import { withShipmentCosts } from "@/modules/shipments/data/wine-costs";
export function failure(error: unknown) {
  return Response.json(
    { error: error instanceof DatabaseError ? error.code : "unavailable" },
    {
      status: error instanceof DatabaseError ? error.status : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export function json(value: unknown) {
  return Response.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET() {
  try {
    const [database, { shipments }] = await Promise.all([getWineDatabase(), loadShipments()]);
    return json({ ...database, wines: withShipmentCosts(database.wines, shipments) });
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "conflict")
      return failure(new DatabaseError("incomplete", 409));
    return failure(error);
  }
}
function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new DatabaseError("forbidden", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new DatabaseError("validation", 400);
}
async function body(request: Request) {
  checkOrigin(request);
  const raw = await request.text();
  if (raw.length > 100_000) throw new DatabaseError("validation", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new DatabaseError("validation", 400);
  }
}
export async function POST(request: Request) {
  try {
    return json(await saveWine(await body(request)));
  } catch (error) {
    return failure(error);
  }
}
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return json(await saveWine(await body(request), id));
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { version } = await body(request);
    await archiveWine(id, version);
    return json({ archived: true });
  } catch (error) {
    return failure(error);
  }
}
