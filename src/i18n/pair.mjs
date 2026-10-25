// Pair the texts of one guide rendered twice: English and translated.
// The two renders have the same shape; only the display words differ.

const QUOTED = /"((?:[^"\\]|\\.)*)"/g;
const FREE = /^(\s*)(title|folder|step|tip|note)(?: (?!")(.*))?$/;
const unescape = (s) => s.replace(/\\(.)/g, "$1");

// A line's shape (its text blanked) and its texts, from one pass.
function parseLine(line) {
	const m = FREE.exec(line);
	if (m) return { shape: `${m[1]}${m[2]}`, texts: m[3] === undefined ? [] : [m[3]] };
	// The comment tail is raw text that may hold quotes: cut it at the first
	// ` -- ` outside a quoted string, and read quotes from the head only.
	let head = line, tail;
	for (const m of line.matchAll(/"(?:[^"\\]|\\.)*"| -- /g)) {
		if (m[0] === " -- ") { head = line.slice(0, m.index + 4); tail = line.slice(m.index + 4); break; }
	}
	const texts = [];
	const shape = head.replace(QUOTED, (_, t) => { texts.push(unescape(t)); return '""'; });
	if (tail !== undefined) texts.push(tail);
	return { shape, texts };
}

const blocks = (text) => text.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l.trim() !== ""));

const TIP = /^\s*tip\b/;

export function pairRendered(en, tr, report, pairs = new Map()) {
	// True when the texts are a real pair: translated.
	const add = (t, u) => {
		if (t === u) return false;
		if (!pairs.has(t)) pairs.set(t, u);
		else if (pairs.get(t) !== u) report.count("locale: text with two translations");
		return true;
	};
	const be = blocks(en), bt = blocks(tr);
	if (be.length !== bt.length) { report.count("locale: blocks differ"); return pairs; }
	for (let i = 0; i < be.length; i++) {
		if (be[i].length !== bt[i].length) { report.count("locale: block lines differ"); continue; }
		// Polestar joins a step's tip lines with \n into one text, the sync key.
		const tips = { en: [], tr: [], all: true };
		for (let j = 0; j < be[i].length; j++) {
			const a = parseLine(be[i][j]), b = parseLine(bt[i][j]);
			const tip = TIP.test(be[i][j]);
			if (a.shape !== b.shape || a.texts.length !== b.texts.length) {
				report.count("locale: line shape differs");
				if (tip) tips.all = false;
				continue;
			}
			const real = a.texts.map((t, k) => add(t, b.texts[k]));
			// Joined, an English tip would make the text a partial translation.
			if (tip) { if (!real[0]) tips.all = false; tips.en.push(a.texts[0]); tips.tr.push(b.texts[0]); }
		}
		if (tips.all && tips.en.length > 1) add(tips.en.join("\n"), tips.tr.join("\n"));
	}
	return pairs;
}
