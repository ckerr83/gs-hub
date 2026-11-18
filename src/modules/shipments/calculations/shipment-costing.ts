import type { Calculation, ShipmentData } from "../types.ts";
import { D, allocate, sum } from "./decimal";
const valid = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const positive = (x: unknown): x is number => valid(x) && x > 0;
export function calculate(s: ShipmentData): Calculation {
    const errors: string[] = [];
    if (!s.wines.length)
        errors.push("Add at least one wine.");
    if (!positive(s.fx))
        errors.push("Enter the supplier exchange rate.");
    if (s.taxMode === 'model' && !Object.values(s.rules).every(valid))
        errors.push("Complete the tax assumptions.");
    if (s.importVatMode === 'recorded' && !valid(s.importVat))
        errors.push("Enter recorded import VAT.");
    for (const w of s.wines) {
        if (!w.name.trim() || !w.producer.trim() || !Number.isSafeInteger(w.qty) || w.qty < 1 || !positive(w.caseSize) || !Number.isSafeInteger(w.caseSize) || !valid(w.casePrice) || !valid(w.discount) || w.discount > 100 || !valid(w.abv) || w.abv > 100 || !positive(w.ml) || !valid(w.duty))
            errors.push("Complete wine quantities, purchase costs, duty, discounts, size and ABV.");
        if (!s.pallets.includes(w.pallet))
            errors.push("Choose an existing pallet.");
        if (s.stage === 'proposed' && w.caseSize && w.qty % w.caseSize !== 0)
            errors.push("Order whole cases when planning a pallet.");
        if (s.taxMode === 'model' && !valid(w.registeredPrice))
            errors.push("Registered Price is required for forecast taxes.");
        if (s.taxMode === 'assessed' && (![w.excise, w.local, w.funds].every(valid) || w.assessedQty !== w.qty))
            errors.push("Check assessed taxes against the current bottle quantity.");
    }
    for (const e of s.expenses) {
        if (!valid(e.amount) || !valid(e.vat) || !positive(e.fx) || !e.currency)
            errors.push("Complete expense amounts, VAT and exchange rates.");
        if (!s.wines.some(w => e.pallet === 'all' || w.pallet === e.pallet))
            errors.push("Expense coverage needs at least one wine.");
    }
    const base: Calculation = { errors: [...new Set(errors)], lines: [], allocations: [], quantity: s.wines.reduce((a, w) => a + w.qty, 0), goods: null, tax: null, expenses: null, importVat: null, serviceVat: null, vat: null, total: null, cash: null, source: null, estimated: s.expenses.filter(e => e.status === 'estimate').length };
    if (errors.length)
        return base;
    try {
        const net = s.wines.map(w => D(w.qty).div(D(w.caseSize!)).mul(D(w.casePrice!)).mul(D(1).sub(D(w.discount!).div(D(100)))));
        const goods = allocate(sum(net).mul(D(s.fx!)), net);
        const lines = s.wines.map((w, i) => {
            const excise = s.taxMode === 'assessed' ? D(w.excise!).money() : D(w.qty).mul(D(w.registeredPrice!).mul(D(s.rules.valueRate!)).div(D(100)).add(D(w.ml!).div(D(1000)).mul(D(w.abv!)).div(D(100)).mul(D(s.rules.alcoholRate!)))).money();
            const local = s.taxMode === 'assessed' ? D(w.local!).money() : D(excise).mul(D(s.rules.localRate!)).div(D(100)).money();
            const funds = s.taxMode === 'assessed' ? D(w.funds!).money() : D(D(excise).mul(D('0.02')).money()).mul(D(3)).add(D(D(excise).mul(D('0.015')).money())).money();
            const duty = D(w.duty!).money(), tax = sum([excise, local, funds, duty].map(D)).money();
            const vatBase = sum([goods[i], excise, local].map(D)).money();
            return { id: w.id, qty: w.qty, netForeign: net[i].number(), goods: goods[i], excise, local, funds, duty, tax, shared: 0, cost: 0, unit: 0, vatBase, importVat: D(vatBase).mul(D('0.07')).money() };
        });
        if (s.importVatMode === 'recorded') {
            const vat = allocate(D(s.importVat!), s.wines.map(w => D(w.qty)));
            lines.forEach((l, i) => { l.importVat = vat[i]; });
        }
        const allocations = s.expenses.map(e => {
            const amount = D(e.amount!).mul(D(e.fx!));
            const values = allocate(amount, s.wines.map(w => D(e.pallet === 'all' || w.pallet === e.pallet ? w.qty : 0)));
            values.forEach((v, i) => { lines[i].shared = D(lines[i].shared).add(D(v)).money(); });
            return { name: e.name, amount: amount.money(), values };
        });
        for (const l of lines) {
            l.cost = sum([l.goods, l.tax, l.shared].map(D)).money();
            l.unit = D(l.cost).div(D(l.qty)).number();
        }
        const total = sum(lines.map(l => D(l.cost))).money(), importVat = sum(lines.map(l => D(l.importVat))).money();
        const serviceVat = sum(s.expenses.map(e => D(D(e.vat!).mul(D(e.fx!)).money()))).money();
        return { ...base, lines, allocations, goods: sum(goods.map(D)).money(), tax: sum(lines.map(l => D(l.tax))).money(), expenses: sum(allocations.map(e => D(e.amount))).money(), source: sum(net).money(), importVat, serviceVat, vat: D(importVat).add(D(serviceVat)).money(), total, cash: sum([total, importVat, serviceVat].map(D)).money() };
    }
    catch {
        return { ...base, errors: ["Amounts exceed the supported calculation range."] };
    }
}
