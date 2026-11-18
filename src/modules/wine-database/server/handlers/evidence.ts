import { getWineEvidence } from "../repository";
import { failure, json } from "./records";
export { PUT, DELETE } from "./records";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const evidence = await getWineEvidence(id);
    return evidence ? json(evidence) : new Response(null, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
