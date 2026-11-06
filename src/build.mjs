// From the guide addons to the addon folders Polestar loads, for the web page's worker
// and the command line alike: convert, compile with Polestar's compiler (wasm/, as
// WebAssembly), fill RestedXP's translations, lay out the folders. Files come through
// `read` (the AddOns folder) and `readData` (the hosted game data, polestar-data/).

import { loadData, COMPILER_NAMES } from "./data.mjs";
import { loadNames } from "./journey/names.mjs";
import { convertAddons } from "./core.mjs";
import { namesFrom } from "./i18n/names.mjs";
import { rxpTranslations } from "./rxp/translations.mjs";
import { packJson } from "./pack.mjs";
import { lintErrors } from "./addon.mjs";

const NAMES = { rxp: "RestedXP", journey: "Journey", zygor: "Zygor" };

// `paths`: the AddOns folder's paths, lowercase; `manifest`: polestar-data/manifest.json;
// `Compiler`: the wasm module's class, initialised; `pack`: { id, title, author };
// `opts`: convertAddons' ({ sources, routes, ... }); `locales`: RestedXP's languages to fill.
// -> { runs, errors, warnings } when the compiler refuses the pack, else { runs, folder, files
//    (packFiles' [name, content]), warnings, translated: { <locale>: counts and per guide },
//    skipped (translations left out), dropped (the guides the compiler refused, left out:
//    [{ source, slug, file, errors }]) }
export async function buildAddons({ read, paths, readData, manifest, Compiler, pack, opts, locales = [], say = () => {} }) {
	say("Loading Polestar's game data …");
	const data = await loadData(readData);
	const names = await loadNames(readData, data, manifest.levelXp);
	const runs = await convertAddons(read, data, names, { ...opts, packId: pack.id, progress: (s) => say(`Converting ${NAMES[s]} …`) });

	say("Compiling the addon with Polestar's compiler …");
	const texts = {};
	for (const n of COMPILER_NAMES) {
		const text = await readData(`data/forever/${n}.json`);
		if (text != null) texts[n] = text;
	}
	const compiler = new Compiler(JSON.stringify(texts), (await readData("tables/instances.json")) ?? "", (await readData("tables/areas.json")) ?? "");
	compiler.setSpellNames((await readData("tables/spell-names.json")) ?? "[]");
	const packDiags = JSON.parse(compiler.setPack(packJson(pack), null, manifest.iface));
	const packErrors = lintErrors(packDiags);
	if (packErrors.length) return { runs, errors: packErrors, warnings: packDiags.length - packErrors.length };
	const fileOf = (g) => `guides/${g.slug}.guide`;
	const guides = Object.values(runs).flatMap((r) => r.guides.map((g) => [fileOf(g), g.text]));
	const c = compileKeeping(compiler, guides);
	if (c.errors.length) return { runs, errors: c.errors, warnings: c.warnings };
	// What was left out is out of the runs too: no translation, no count for it.
	const out = new Set(c.dropped.map((d) => d.file));
	const dropped = [];
	for (const [source, run] of Object.entries(runs)) {
		for (const g of run.guides) if (out.has(fileOf(g))) dropped.push({ source, slug: g.slug, ...c.dropped.find((d) => d.file === fileOf(g)) });
		run.guides = run.guides.filter((g) => !out.has(fileOf(g)));
	}
	const warnings = packDiags.length + c.warnings;

	const translations = {}, translated = {};
	if (runs.rxp) for (const locale of locales) {
		say(`Translating RestedXP's texts into ${locale} …`);
		const r = await rxpTranslations({ read, paths, run: runs.rxp, locale, texts: JSON.parse(compiler.texts()), namesOf: await namesFrom(readData, locale) });
		translations[locale] = r.translations;
		translated[locale] = r;
	}
	const packed = JSON.parse(compiler.packFiles(JSON.stringify(translations)));
	return { runs, folder: compiler.folder(), files: packed.files, warnings, translated, skipped: packed.warnings, dropped };
}

// Compiles `guides` ([[path, text]]), leaving out every guide the compiler finds an error
// in and compiling the rest again, until none is left with one: a guide may fail only
// without one left out (a chain it continues). A `next` to a guide left out goes, so the
// guides before it stay. An error in no guide stops it.
// -> { kept, dropped: [{ file, errors }], errors (those that stop it), warnings }
export function compileKeeping(compiler, guides) {
	let kept = guides;
	const dropped = [];
	for (;;) {
		const diags = JSON.parse(compiler.compile(JSON.stringify(kept)));
		const errors = lintErrors(diags);
		const warnings = diags.length - errors.length;
		if (!errors.length) return { kept, dropped, errors, warnings };
		const files = new Set(kept.map(([p]) => p));
		if (errors.some((e) => !files.has(e.file))) return { kept, dropped, errors: errors.filter((e) => !files.has(e.file)), warnings };
		const bad = new Set(errors.map((e) => e.file));
		for (const [p] of kept) if (bad.has(p)) dropped.push({ file: p, errors: errors.filter((e) => e.file === p) });
		const gone = new Set(dropped.map((d) => d.file.replace(/^guides\/|\.guide$/g, "")));
		kept = kept.filter(([p]) => !bad.has(p)).map(([p, text]) => [p, text.replace(/^next \S+\/(\S+)[^\n]*\n?/gm, (line, slug) => (gone.has(slug) ? "" : line))]);
	}
}
