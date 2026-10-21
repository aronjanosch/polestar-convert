// Pair the texts of one guide rendered twice: English and translated.
// The two renders have the same shape; only the display words differ.

const QUOTED = /"((?:[^"\\]|\\.)*)"/g;
const FREE = /^(\s*)(title|folder|step|tip|note)(?: (?!")(.*))?$/;
const unescape = (s) => s.replace(/\\(.)/g, "$1");

// A line's shape (its text blanked) and its texts, from one pass.
function parseLine(line) {
	const m = FREE.exec(line);
	if (m) return { shape: `${m[1]}${m[2]}`, texts: m[3] === undefined ? [] : [m[3]] };
	const texts = [];
	let shape = line.replace(QUOTED, (_, t) => { texts.push(unescape(t)); return '""'; });
	const cut = shape.indexOf(" -- ");
	if (cut >= 0) { texts.push(shape.slice(cut + 4)); shape = shape.slice(0, cut + 4); }
	return { shape, texts };
}

const blocks = (text) => text.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l.trim() !== ""));

export function pairRendered(en, tr, report, pairs = new Map()) {
	const be = blocks(en), bt = blocks(tr);
	if (be.length !== bt.length) { report.count("locale: blocks differ"); return pairs; }
	for (let i = 0; i < be.length; i++) {
		if (be[i].length !== bt[i].length) { report.count("locale: block lines differ"); continue; }
		for (let j = 0; j < be[i].length; j++) {
			const a = parseLine(be[i][j]), b = parseLine(bt[i][j]);
			if (a.shape !== b.shape || a.texts.length !== b.texts.length) { report.count("locale: line shape differs"); continue; }
			a.texts.forEach((t, k) => {
				if (t === b.texts[k]) return;
				if (!pairs.has(t)) pairs.set(t, b.texts[k]);
				else if (pairs.get(t) !== b.texts[k]) report.count("locale: text with two translations");
			});
		}
	}
	return pairs;
}
