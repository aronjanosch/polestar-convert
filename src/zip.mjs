// A ZIP archive of text files, stored without compression: the web page hands the
// pack over as one download. No dependencies; runs in Node and the browser.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

export function crc32(bytes) {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

// { "folder/name.txt": text } -> the ZIP's bytes. Names and texts as UTF-8 (flag bit 11).
export function zip(files) {
	const enc = new TextEncoder();
	const entries = Object.entries(files).map(([name, text]) => {
		const data = enc.encode(text);
		return { name: enc.encode(name), data, crc: crc32(data) };
	});
	const size = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length + 46 + e.name.length, 22);
	const out = new Uint8Array(size);
	const v = new DataView(out.buffer);
	let at = 0;
	// DOS date 1980-01-01: the pack's files carry no time of their own.
	const head = (sig, e) => {
		v.setUint32(at, sig, true);
		at += 4;
		if (sig === 0x02014b50) { v.setUint16(at, 20, true); at += 2; } // made by
		v.setUint16(at, 20, true); // version needed
		v.setUint16(at + 2, 0x0800, true); // UTF-8
		v.setUint16(at + 4, 0, true); // stored
		v.setUint16(at + 6, 0, true); // time
		v.setUint16(at + 8, 0x21, true); // date
		v.setUint32(at + 10, e.crc, true);
		v.setUint32(at + 14, e.data.length, true);
		v.setUint32(at + 18, e.data.length, true);
		v.setUint16(at + 22, e.name.length, true);
		v.setUint16(at + 24, 0, true); // extra
		at += 26;
	};
	for (const e of entries) {
		e.offset = at;
		head(0x04034b50, e);
		out.set(e.name, at); at += e.name.length;
		out.set(e.data, at); at += e.data.length;
	}
	const dir = at;
	for (const e of entries) {
		head(0x02014b50, e);
		v.setUint16(at, 0, true); // comment
		v.setUint16(at + 2, 0, true); // disk
		v.setUint16(at + 4, 0, true); // internal attributes
		v.setUint32(at + 6, 0, true); // external attributes
		v.setUint32(at + 10, e.offset, true);
		at += 14;
		out.set(e.name, at); at += e.name.length;
	}
	v.setUint32(at, 0x06054b50, true);
	v.setUint16(at + 8, entries.length, true);
	v.setUint16(at + 10, entries.length, true);
	v.setUint32(at + 12, at - dir, true);
	v.setUint32(at + 16, dir, true);
	return out;
}
