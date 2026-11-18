import 'server-only';
import { authorizedClient, DatabaseError } from '@/modules/wine-database/server/repository';
import { collectAll } from '@/modules/wine-database/lib/records';
import { applyAction, type Action } from '../data/model';
import { validShipment } from '../data/validation';
import type { Shipment } from '../types';
export async function loadShipments() {
    const client = await authorizedClient();
    const access = await client.rpc('wine_can_write');
    if (access.error)
        throw new DatabaseError('unavailable');
    const rows = await collectAll<{
        id: string;
        version: number;
    }>(async (after) => {
        const total = await client.from('shipments').select('id', { count: 'exact', head: true });
        let query = client.from('shipments').select('id,version').order('id').limit(200);
        if (after)
            query = query.gt('id', after);
        const result = await query;
        if (total.error || result.error || !result.data || total.count === null)
            throw new DatabaseError('shipment-setup');
        return { count: total.count, rows: result.data };
    });
    const shipments: Shipment[] = [];
    for (const row of rows) {
        const result = await client.rpc('shipment_get', { shipment_id: row.id });
        if (result.error || !result.data)
            throw new DatabaseError('unavailable');
        if (result.data.version !== row.version)
            throw new DatabaseError('conflict', 409);
        shipments.push(result.data as Shipment);
    }
    return { shipments, canWrite: access.data === true };
}
export async function commitShipment(value: unknown, id?: string) {
    const client = await authorizedClient(true);
    if (!value || typeof value !== 'object')
        throw new DatabaseError('validation', 400);
    const { shipment, action = 'save', date, note } = value as {
        shipment: unknown;
        action: Action;
        date?: string;
        note?: string;
    };
    if (!validShipment(shipment) || (id && shipment.id !== id) || !['save', 'confirm', 'revise', 'actuals', 'land', 'partial', 'complete', 'note'].includes(action))
        throw new DatabaseError('validation', 400);
    let stored: Shipment | null = null;
    if (id) {
        const result = await client.rpc('shipment_get', { shipment_id: id });
        if (result.error)
            throw new DatabaseError('unavailable');
        if (!result.data)
            throw new DatabaseError('conflict', 409);
        stored = result.data as Shipment;
    }
    else if (shipment.version !== 0)
        throw new DatabaseError('conflict', 409);
    const { data: { user } } = await client.auth.getUser();
    let next: Shipment;
    try {
        next = applyAction(stored, shipment, action, { date, note, author: user?.email });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'validation';
        throw new DatabaseError(message, message === 'conflict' ? 409 : 400);
    }
    const result = await client.rpc('shipment_commit', { document: next, expected_version: stored?.version ?? 0 });
    if (result.error)
        throw new DatabaseError(result.error.code === '40001' || result.error.code === '23505' ? 'conflict' : result.error.code === '42501' ? 'forbidden' : 'write', result.error.code === '40001' || result.error.code === '23505' ? 409 : 500);
    if (!result.data)
        throw new DatabaseError('write', 500);
    return result.data as Shipment;
}
