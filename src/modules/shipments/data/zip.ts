// Store-only ZIP container for the original OOXML export, no runtime dependency.
export function zipFiles(files: Record<string, string>): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = [];
    let offset = 0;
    const crc = (data: Uint8Array) => { let c = 0xffffffff; for (const byte of data) {
        c ^= byte;
        for (let i = 0; i < 8; i++)
            c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    } return (c ^ 0xffffffff) >>> 0; };
    const header = (size: number) => { const bytes = new Uint8Array(size); return { bytes, v: new DataView(bytes.buffer) }; };
    for (const [name, text] of Object.entries(files)) {
        const n = encoder.encode(name), data = encoder.encode(text), checksum = crc(data), h = header(30 + n.length);
        h.v.setUint32(0, 0x04034b50, true);
        h.v.setUint16(4, 20, true);
        h.v.setUint16(6, 0x800, true);
        h.v.setUint32(14, checksum, true);
        h.v.setUint32(18, data.length, true);
        h.v.setUint32(22, data.length, true);
        h.v.setUint16(26, n.length, true);
        h.bytes.set(n, 30);
        chunks.push(h.bytes, data);
        const c = header(46 + n.length);
        c.v.setUint32(0, 0x02014b50, true);
        c.v.setUint16(4, 20, true);
        c.v.setUint16(6, 20, true);
        c.v.setUint16(8, 0x800, true);
        c.v.setUint32(16, checksum, true);
        c.v.setUint32(20, data.length, true);
        c.v.setUint32(24, data.length, true);
        c.v.setUint16(28, n.length, true);
        c.v.setUint32(42, offset, true);
        c.bytes.set(n, 46);
        central.push(c.bytes);
        offset += h.bytes.length + data.length;
    }
    const centralSize = central.reduce((n, c) => n + c.length, 0), end = header(22);
    end.v.setUint32(0, 0x06054b50, true);
    end.v.setUint16(8, central.length, true);
    end.v.setUint16(10, central.length, true);
    end.v.setUint32(12, centralSize, true);
    end.v.setUint32(16, offset, true);
    const result = new Uint8Array(offset + centralSize + 22);
    let position = 0;
    for (const part of [...chunks, ...central, end.bytes]) {
        result.set(part, position);
        position += part.length;
    }
    return result;
}
