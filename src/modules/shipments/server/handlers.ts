import { failure, json } from '@/modules/wine-database/server/handlers/records';
import { DatabaseError } from '@/modules/wine-database/server/repository';
import { commitShipment, loadShipments } from './repository';
export async function GET() { try {
    return json(await loadShipments());
}
catch (e) {
    return failure(e);
} }
async function body(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
        throw new DatabaseError('forbidden', 403);
    if (!request.headers.get('content-type')?.includes('application/json'))
        throw new DatabaseError('validation', 400);
    const raw = await request.text();
    if (raw.length > 4000000)
        throw new DatabaseError('validation', 413);
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new DatabaseError('validation', 400);
    }
}
export async function POST(request: Request) { try {
    return json(await commitShipment(await body(request)));
}
catch (e) {
    return failure(e);
} }
export async function PUT(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    return json(await commitShipment(await body(request), (await params).id));
}
catch (e) {
    return failure(e);
} }
