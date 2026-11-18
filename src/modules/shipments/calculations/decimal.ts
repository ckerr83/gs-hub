// Exact rational arithmetic. Monetary rounding is half-up at the source engine's
// existing boundaries; largest-remainder allocation keeps every satang.
const zero = BigInt(0), one = BigInt(1), ten = BigInt(10), hundred = BigInt(100);
function gcd(a: bigint, b: bigint): bigint { while (b !== zero)
    [a, b] = [b, a % b]; return a < zero ? -a : a; }
export class Decimal {
    n: bigint;
    d: bigint;
    constructor(n: bigint, d = one) { if (d === zero)
        throw Error("division"); const g = gcd(n, d); this.n = n / g; this.d = d / g; if (this.d < zero) {
        this.n = -this.n;
        this.d = -this.d;
    } }
    static of(value: number | string): Decimal {
        if (!Number.isFinite(Number(value)))
            throw Error("decimal");
        const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
        const [whole, fraction = ""] = mantissa.split(".");
        const scale = fraction.length - Number(exponent);
        const n = BigInt(whole + fraction);
        return scale >= 0 ? new Decimal(n, ten ** BigInt(scale)) : new Decimal(n * ten ** BigInt(-scale));
    }
    add(b: Decimal): Decimal { return new Decimal(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b: Decimal): Decimal { return this.add(new Decimal(-b.n, b.d)); }
    mul(b: Decimal): Decimal { return new Decimal(this.n * b.n, this.d * b.d); }
    div(b: Decimal): Decimal { return new Decimal(this.n * b.d, this.d * b.n); }
    cmp(b: Decimal): number { const x = this.n * b.d - b.n * this.d; return x < zero ? -1 : x > zero ? 1 : 0; }
    cents(): bigint { const n = this.n * hundred; return n >= zero ? (n * BigInt(2) + this.d) / (this.d * BigInt(2)) : -((-n * BigInt(2) + this.d) / (this.d * BigInt(2))); }
    money(): number { const cents = this.cents(); if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER))
        throw Error("overflow"); return Number(cents) / 100; }
    number(): number { return Number(this.n) / Number(this.d); }
}
export const D = Decimal.of;
export const sum = (values: Decimal[]) => values.reduce((a, b) => a.add(b), D(0));
export function allocate(amount: Decimal, weights: Decimal[]): number[] {
    const total = sum(weights), cents = amount.cents();
    if (total.cmp(D(0)) === 0)
        return weights.map(() => 0);
    const exact = weights.map(w => new Decimal(cents).mul(w).div(total));
    const parts = exact.map(x => x.n / x.d);
    const order = exact.map((x, i) => ({ i, remainder: x.sub(new Decimal(parts[i])) })).sort((a, b) => b.remainder.cmp(a.remainder) || a.i - b.i);
    let remaining = cents - parts.reduce((a, b) => a + b, zero);
    for (let i = 0; remaining > zero; i++, remaining--)
        parts[order[i % order.length].i]++;
    return parts.map(c => Number(c) / 100);
}
