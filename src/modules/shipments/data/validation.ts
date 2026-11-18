import type { Shipment } from "../types.ts";
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 500) => typeof x === 'string' && x.length <= max;
const id = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const money = (x: unknown) => x === null || typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1e12;
const date = (x: unknown) => x === '' || typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T00:00:00Z')) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
export function validShipment(x: unknown): x is Shipment {
    if (!object(x) || !id(x.id) || !Number.isSafeInteger(x.version) || Number(x.version) < 0 || !text(x.name) || !String(x.name).trim() || !text(x.supplier) || !text(x.reference) || !text(x.incoterm) || typeof x.currency !== 'string' || !/^[A-Z]{3}$/.test(x.currency) || !money(x.fx) || !['proposed', 'ordered', 'actuals', 'closed'].includes(String(x.stage)) || ![x.arrivalDate, x.orderDate, x.expectedDate].every(date) || !['model', 'assessed'].includes(String(x.taxMode)) || !['sku-7', 'recorded'].includes(String(x.importVatMode)) || !money(x.importVat) || !object(x.rules) || !['valueRate', 'alcoholRate', 'localRate'].every(k => money(x.rules && object(x.rules) ? x.rules[k] : undefined)))
        return false;
    if (!Array.isArray(x.pallets) || !x.pallets.length || x.pallets.length > 100 || !x.pallets.every(p => text(p, 100) && p.trim() && p !== 'all') || new Set(x.pallets).size !== x.pallets.length)
        return false;
    const pallets = x.pallets;
    if (!Array.isArray(x.wines) || x.wines.length > 1000 || !x.wines.every(w => object(w) && id(w.id) && (w.productId === null || id(w.productId)) && ['name', 'producer', 'sku', 'vintage', 'variety', 'country'].every(k => text(w[k])) && pallets.includes(w.pallet) && Number.isSafeInteger(w.qty) && Number(w.qty) > 0 && Number(w.qty) <= 1e7 && ['caseSize', 'casePrice', 'discount', 'abv', 'ml', 'registeredPrice', 'salesPrice', 'duty', 'excise', 'local', 'funds', 'assessedQty'].every(k => money(w[k])) && (w.imageUrl === null || typeof w.imageUrl === 'string' && /^\/wine-database\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(w.imageUrl))))
        return false;
    if (new Set(x.wines.map(w => w.id)).size !== x.wines.length)
        return false;
    if (!Array.isArray(x.expenses) || x.expenses.length > 500 || !x.expenses.every(e => object(e) && id(e.id) && text(e.name) && String(e.name).trim() && text(e.category) && text(e.note, 5000) && ['estimate', 'actual'].includes(String(e.status)) && (e.pallet === 'all' || pallets.includes(e.pallet)) && typeof e.currency === 'string' && /^[A-Z]{3}$/.test(e.currency) && [e.amount, e.vat, e.fx].every(money)))
        return false;
    if (new Set(x.expenses.map(e => e.id)).size !== x.expenses.length)
        return false;
    return Array.isArray(x.snapshots) && x.snapshots.length <= 500 && Array.isArray(x.notes) && x.notes.length <= 1000;
}
