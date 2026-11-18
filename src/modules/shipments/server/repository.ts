import 'server-only';
import { authorizedClient, DatabaseError } from '@/modules/wine-database/server/repository';
import { collectAll } from '@/modules/wine-database/lib/records';
import { applyAction, type Action } from '../data/model';
import { validShipment } from '../data/validation';
import type { Shipment } from '../types';
import { readShipmentDocuments } from './read-documents';
export async function loadShipments() {
    const client = await authorizedClient();
    async function revision() {
        const result = await client.from('shipments').select('updated_at')
            .order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (result.error) throw new DatabaseError('unavailable');
        return result.data?.updated_at ?? null;
    }
    const [access, baseline, total] = await Promise.all([
        client.rpc('wine_can_write'),
        revision(),
        client.from('shipments').select('id', { count: 'exact', head: true }),
    ]);
    if (access.error) throw new DatabaseError('unavailable');
    if (total.error || total.count === null) throw new DatabaseError('shipment-setup');
    let shipments: Shipment[];
    try {
        const rows = await collectAll<{ id: string; version: number }>(async (after) => {
            let query = client.from('shipments').select('id,version').order('id').limit(200);
            if (after !== null) query = query.gt('id', after);
            const result = await query;
            if (result.error || !result.data) throw new DatabaseError('shipment-setup');
            return { count: total.count!, rows: result.data };
        });
        shipments = await readShipmentDocuments(rows, async id => {
            const result = await client.rpc('shipment_get', { shipment_id: id });
            if (result.error || !result.data) throw new DatabaseError('unavailable');
            return result.data as Shipment;
        });
    } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError('conflict', 409);
    }
    // Reject a mixed revision if another session edited or inserted a shipment
    // while the pages were loading. Editing still uses the same version checks.
    if (await revision() !== baseline) throw new DatabaseError('conflict', 409);
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
