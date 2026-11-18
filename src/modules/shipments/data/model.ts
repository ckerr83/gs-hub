import type { Wine } from "../../wine-database/types.ts";
import type { Shipment, ShipmentData, ShipmentWine, Snapshot } from "../types.ts";
import { calculate } from "../calculations/shipment-costing";
import { D } from "../calculations/decimal";
export const completed = (s: ShipmentData) => Boolean(s.arrivalDate);
export const editable = (s: ShipmentData) => s.stage === 'proposed' || s.stage === 'actuals';
export type Action = "save" | "confirm" | "revise" | "actuals" | "land" | "partial" | "complete" | "note";
export function newShipment(): Shipment {
    return { id: crypto.randomUUID(), version: 0, updatedAt: null, name: '', supplier: '', reference: '', currency: '', fx: null, incoterm: '', stage: 'proposed', arrivalDate: '', orderDate: '', expectedDate: '', taxMode: 'model', importVatMode: 'sku-7', importVat: null, rules: { valueRate: 5, alcoholRate: 1000, localRate: 10 }, pallets: ['Pallet 1'], wines: [], expenses: [], forecastId: null, actualConfirmed: false, snapshots: [], notes: [] };
}
export function duplicateShipment(s: Shipment): Shipment {
    return { ...structuredClone(s), id: crypto.randomUUID(), name: `${s.name} (copy)`, version: 0, updatedAt: null, stage: 'proposed', arrivalDate: '', orderDate: '', expectedDate: '', forecastId: null, actualConfirmed: false, snapshots: [], notes: [], taxMode: 'model', wines: s.wines.map(w => ({ ...structuredClone(w), id: crypto.randomUUID(), excise: null, local: null, funds: null, assessedQty: null })), expenses: s.expenses.map(e => ({ ...e, id: crypto.randomUUID(), status: 'estimate' })) };
}
export function productIssue(s: ShipmentData, w: Wine, pallet: string): string | null {
    if (s.wines.some(x => x.productId === w.id && x.pallet === pallet))
        return "Already on this pallet.";
    if (!s.currency || w.currency !== s.currency)
        return "Supplier currency must match the shipment.";
    if (!w.caseSize || w.sourceCost == null || w.ml == null || w.abv == null || w.discount == null)
        return "Complete purchase cost, case size, discount, size and ABV in the wine database.";
    return null;
}
export function productLine(w: Wine, pallet: string): ShipmentWine {
    return { id: crypto.randomUUID(), productId: w.id, name: w.name, producer: w.producer, vintage: w.vintage, sku: w.sku, country: w.country, variety: w.variety, imageUrl: w.imageUrl, pallet, qty: w.caseSize!, caseSize: w.caseSize!, casePrice: D(w.sourceCost!).mul(D(w.caseSize!)).number(), discount: w.discount, abv: w.abv, ml: w.ml, registeredPrice: w.registeredPrice, salesPrice: w.sellingPrice, duty: null, excise: null, local: null, funds: null, assessedQty: null };
}
export function snapshotData(s: Shipment): ShipmentData {
    const { version, updatedAt, snapshots, notes, ...data } = structuredClone(s);
    void version;
    void updatedAt;
    void snapshots;
    void notes;
    return data;
}
export function applyAction(stored: Shipment | null, input: Shipment, action: Action, extra: {
    date?: string;
    note?: string;
    author?: string;
} = {}): Shipment {
    if (!stored && action !== 'save')
        throw Error('Save the shipment first.');
    if (stored && input.version !== stored.version)
        throw Error('conflict');
    if (stored && !editable(stored) && action === 'save')
        throw Error('Open an editable draft first.');
    const s = action === 'save' || action === 'confirm' || action === 'partial' || action === 'complete' ? structuredClone(input) : structuredClone(stored!);
    if (stored) {
        Object.assign(s, { stage: stored.stage, forecastId: stored.forecastId, arrivalDate: stored.arrivalDate, orderDate: stored.orderDate, actualConfirmed: stored.actualConfirmed, snapshots: structuredClone(stored.snapshots), notes: structuredClone(stored.notes) });
    }
    else if (s.stage !== 'proposed' || s.snapshots.length || s.notes.length || s.forecastId || s.arrivalDate)
        throw Error('validation');
    const now = new Date().toISOString();
    if (['confirm', 'partial', 'complete'].includes(action)) {
        if (action === 'confirm' && s.stage !== 'proposed' || action !== 'confirm' && s.stage !== 'actuals')
            throw Error('Open an editable draft first.');
        const c = calculate(s);
        if (c.errors.length)
            throw Error(c.errors[0]);
        if (action === 'complete' && (s.taxMode !== 'assessed' || c.estimated || !input.actualConfirmed))
            throw Error('Verify all invoices, quantities, assessed taxes and VAT before completing.');
        const kind: Snapshot['kind'] = action === 'confirm' ? 'Forecast' : action === 'complete' ? 'Actual (complete)' : 'Actual (partial)';
        const v: Snapshot = { id: crypto.randomUUID(), name: `${kind} ${s.snapshots.filter(x => x.kind === kind).length + 1}`, kind, created: now, note: extra.note?.trim() || '', data: snapshotData(s), calculation: c };
        s.snapshots.push(v);
        if (action === 'confirm') {
            s.forecastId ||= v.id;
            s.stage = 'ordered';
            s.orderDate ||= now.slice(0, 10);
        }
        if (action === 'complete') {
            s.stage = 'closed';
            s.actualConfirmed = true;
        }
    }
    if (action === 'actuals') {
        if (!s.forecastId || !['ordered', 'closed'].includes(s.stage))
            throw Error('Confirm the order forecast first.');
        s.stage = 'actuals';
        s.actualConfirmed = false;
    }
    if (action === 'revise') {
        if (s.stage !== 'ordered' || completed(s))
            throw Error('Open actual costs for a landed shipment.');
        s.stage = 'proposed';
    }
    if (action === 'land') {
        if (!s.forecastId || s.arrivalDate || !extra.date || !/^\d{4}-\d{2}-\d{2}$/.test(extra.date) || !Number.isFinite(Date.parse(extra.date)))
            throw Error('Enter an arrival date after confirming the forecast.');
        s.arrivalDate = extra.date;
        if (s.stage !== 'closed')
            s.stage = 'actuals';
    }
    if (action === 'note') {
        if (!extra.note?.trim() || extra.note.length > 5000)
            throw Error('Enter a note.');
        s.notes.push({ id: crypto.randomUUID(), text: extra.note.trim(), author: extra.author || '', created: now });
    }
    return s;
}
