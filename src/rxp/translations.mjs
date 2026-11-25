// RXP's translated guides for one language, for a compiled pack: RXP keeps a language's
// copy of each guide file at RXPGuides/lang/Guides-<locale>/<path under Guides/>; its
// texts pair with the converted English ones and fill the compiler's texts (wasm/,
// `texts()`). Browser and Node alike: files come through `read`, paths are the AddOns
// folder's, lowercase.

import { extractGuides, parseGuide } from "./parse.mjs";
import { Report } from "../ir.mjs";
import { pairLanguage, lineMemory } from "./locale.mjs";
import { withPaired } from "../i18n/names.mjs";
import { fillTexts, shapesOfTexts } from "../i18n/fill.mjs";
import { OWN } from "../i18n/own.mjs";

const LANG = /^rxpguides\/lang\/guides-(\w+)\/guidelist-forever\.xml$/;
const langDir = (locale) => `RXPGuides/lang/Guides-${locale}/`;
// "Guides/forever/x.lua" or "forever\x.lua" -> "forever/x.lua"
const underGuides = (path) => path.replace(/\\/g, "/").replace(/^Guides\//i, "");
const guidesOf = (text) => extractGuides(text).map(parseGuide);

// The locales RXP ships a guide list in, from the AddOns paths.
export function rxpLocales(paths) {
	const found = new Set();
	for (const p of paths) {
		const m = LANG.exec(p);
		// RXP's folder spells the locale in mixed case; the reader finds it either way.
		if (m) found.add(m[1].slice(0, 2) + m[1].slice(2).toUpperCase());
	}
	return [...found].sort();
}

// English line text -> translated, from every guide file of the language that has an
// English one beside it (lineMemory).
async function memoryOf(read, paths, locale) {
	const memory = new Map();
	const prefix = langDir(locale).toLowerCase();
	for (const p of paths.filter((p) => p.startsWith(prefix) && p.endsWith(".lua")).sort()) {
		const rel = p.slice(prefix.length);
		const [en, tr] = await Promise.all([read(`RXPGuides/Guides/${rel}`), read(p)]);
		if (en != null && tr != null) lineMemory(guidesOf(en), guidesOf(tr), memory);
	}
	return memory;
}

// One locale: `run` is convertRxp's run with its files, `texts` the compiler's texts
// ({ pack, guides: { <guide id>: [text] } }), `namesOf` the language's names (namesFrom).
// -> { translations: { pack, guides: { <guide id>: { english: translated } } }, counts,
//      guides: { <guide id>: { counts, examples } }, pairing: Map<slug, Report> }
export async function rxpTranslations({ read, paths, run, locale, texts, namesOf }) {
	const dir = langDir(locale);
	// Only the files the language's own list loads.
	const listed = new Set([...String(await read(`${dir}GuideList-forever.xml`)).matchAll(/<Script file="([^"]+)"/g)].map((m) => underGuides(m[1]).toLowerCase()));
	const trByFile = await Promise.all(run.files.map(async (f) => {
		const rel = underGuides(f.path);
		const text = listed.has(rel.toLowerCase()) ? await read(dir + rel) : null;
		return text == null ? [] : guidesOf(text);
	}));
	const render = (guide, it) => run.convert(guide, new Report(), it.next, it.g).text;
	const paired = pairLanguage(run.rawByFile, trByFile, run.written, render, await memoryOf(read, paths, locale));
	const names = withPaired(namesOf, paired.names);

	// Twice: the first fill's translations teach the shapes the second fills by, so one
	// guide's line helps another's.
	const lists = [["pack", texts.pack], ...Object.entries(texts.guides)];
	const own = OWN[locale] ?? {};
	const first = lists.map(([, list]) => fillTexts(list, paired.pairs, names).translations);
	const shapes = shapesOfTexts(first, own.sentences);
	const counts = { translated: 0, "partly translated": 0, kept: 0, "no pair": 0, "name not found": 0 };
	const translations = { pack: {}, guides: {} }, guides = {};
	for (const [id, list] of lists) {
		const r = fillTexts(list, paired.pairs, names, { shapes, lang: own.lang });
		for (const k in r.counts) counts[k] += r.counts[k];
		const filled = Object.fromEntries(r.translations);
		if (id === "pack") translations.pack = filled;
		else {
			if (r.translations.size) translations.guides[id] = filled;
			guides[id] = { counts: r.counts, examples: r.examples };
		}
	}
	return { translations, counts, guides, pairing: paired.guides };
}
