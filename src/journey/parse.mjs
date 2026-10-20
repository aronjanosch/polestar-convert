// Journey's guide files: `data/Guides/NNNN.html` and the catalog `guides.html`
// hold one base64 block of Lua table text in a <p>. This reads that block and
// the Lua table subset the files use into plain values; it carries no guide
// content of its own.

// The Lua text inside a Journey `.html` slot.
export function decodeSlot(html) {
	const m = String(html).match(/<p>([\s\S]*?)<\/p>/i);
	if (!m) return null;
	return Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8").replace(/\r/g, "");
}

// A Lua table becomes `{ arr: [...], kv: {...} }`: its array part in order and its
// keyed fields (`[123] = ...` keys as strings). A bare name used as a value
// (`merchant = SUPPLIES`, `= ACCEPTED`) becomes `{ name: "SUPPLIES" }`.
export function parseLua(text) {
	let i = 0;
	const s = String(text);
	const err = (what) => { throw new Error(`lua: ${what} at ${i}: ${JSON.stringify(s.slice(i, i + 40))}`); };
	const skip = () => {
		for (;;) {
			while (i < s.length && /\s/.test(s[i])) i++;
			if (s.startsWith("--[[", i)) { const e = s.indexOf("]]", i + 4); i = e < 0 ? s.length : e + 2; continue; }
			if (s.startsWith("--", i)) { const e = s.indexOf("\n", i); i = e < 0 ? s.length : e + 1; continue; }
			return;
		}
	};
	const str = () => {
		const q = s[i++];
		let out = "";
		while (i < s.length && s[i] !== q) {
			if (s[i] === "\\") {
				const c = s[i + 1];
				out += c === "n" ? "\n" : c === "t" ? "\t" : c;
				i += 2;
			} else out += s[i++];
		}
		if (s[i] !== q) err("unterminated string");
		i++;
		return out;
	};
	const value = () => {
		skip();
		const c = s[i];
		if (c === "{") return table();
		if (c === '"' || c === "'") return str();
		const num = s.slice(i).match(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
		if (num) { i += num[0].length; return Number(num[0]); }
		const id = s.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
		if (id) {
			i += id[0].length;
			if (id[0] === "true") return true;
			if (id[0] === "false") return false;
			if (id[0] === "nil") return null;
			return { name: id[0] };
		}
		return err("unexpected value");
	};
	const table = () => {
		i++; // {
		const t = { arr: [], kv: {} };
		for (;;) {
			skip();
			if (s[i] === "}") { i++; return t; }
			let key = null;
			if (s[i] === "[") {
				i++;
				key = value();
				skip();
				if (s[i] !== "]") err("expected ]");
				i++;
				skip();
				if (s[i] !== "=") err("expected =");
				i++;
			} else {
				const m = s.slice(i).match(/^([A-Za-z_][A-Za-z_0-9]*)\s*=(?!=)/);
				if (m) { key = m[1]; i += m[0].length; }
			}
			const v = value();
			if (key == null) t.arr.push(v);
			else t.kv[typeof key === "object" ? key.name : String(key)] = v;
			skip();
			if (s[i] === "," || s[i] === ";") i++;
			else if (s[i] !== "}") err("expected , or }");
		}
	};
	const out = value();
	skip();
	if (i < s.length) err("trailing text");
	return out;
}

// The catalog (`guides.html`): one entry per guide, with the slot its steps are in.
export function parseCatalog(luaText) {
	const t = parseLua(luaText);
	return t.arr.filter((e) => e && e.kv && e.kv.guideID).map((e) => ({ ...e.kv }));
}
