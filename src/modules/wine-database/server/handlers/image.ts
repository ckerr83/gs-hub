import { authorizedClient } from "../repository";
import { failure } from "./records";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const client = await authorizedClient();
    const { filename } = await params;
    if (!/^[a-f0-9-]{36}\.(webp|png|jpg)$/.test(filename))
      return new Response(null, { status: 404 });
    const result = await client.storage.from("wine-bottles").download(filename);
    if (result.error || !result.data)
      return new Response(null, { status: 404 });
    return new Response(result.data, {
      headers: {
        "Content-Type": result.data.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
