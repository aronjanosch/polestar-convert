// The client tables a Polestar clone caches from wago.tools (data/sources/wago/<build>/*.csv),
// as text: the caller reads the file.

// Minimal CSV: quoted fields with "" escapes, no newlines inside fields.
function csvRows(text) {
	const rows = [];
	for (const line of text.split("\n")) {
		if (!line) continue;
		const out = [];
		let i = 0;
		while (i <= line.length) {
			if (line[i] === '"') {
				let v = "";
				i++;
				while (i < line.length) {
					if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; } else if (line[i] === '"') { i++; break; } else v += line[i++];
				}
				out.push(v);
				i++; // comma
			} else {
				const e = line.indexOf(",", i);
				out.push(line.slice(i, e < 0 ? line.length : e));
				i = e < 0 ? line.length + 1 : e + 1;
			}
		}
		rows.push(out);
	}
	return rows;
}

// id -> the row's `cols` as an object; empty when there is no text (the file is missing).
export function readTable(text, idCol, cols) {
	const map = new Map();
	if (text == null) return map;
	const rows = csvRows(text.replace(/\r/g, ""));
	const head = rows.shift();
	const id = head.indexOf(idCol);
	const at = cols.map((c) => head.indexOf(c));
	for (const r of rows) map.set(Number(r[id]), Object.fromEntries(cols.map((c, i) => [c, r[at[i]]])));
	return map;
}

// id -> one column's value.
export function table(text, idCol, nameCol) {
	const map = new Map();
	for (const [id, row] of readTable(text, idCol, [nameCol])) map.set(id, row[nameCol]);
	return map;
}
