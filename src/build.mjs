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
//    skipped (translations left out) }
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
	const guides = Object.values(runs).flatMap((r) => r.guides.map((g) => [`guides/${g.slug}.guide`, g.text]));
	const diags = [...JSON.parse(compiler.setPack(packJson(pack), null, manifest.iface)), ...JSON.parse(compiler.compile(JSON.stringify(guides)))];
	const errors = lintErrors(diags);
	if (errors.length) return { runs, errors, warnings: diags.length - errors.length };

	const translations = {}, translated = {};
	if (runs.rxp) for (const locale of locales) {
		say(`Translating RestedXP's texts into ${locale} …`);
		const r = await rxpTranslations({ read, paths, run: runs.rxp, locale, texts: JSON.parse(compiler.texts()), namesOf: await namesFrom(readData, locale) });
		translations[locale] = r.translations;
		translated[locale] = r;
	}
	const packed = JSON.parse(compiler.packFiles(JSON.stringify(translations)));
	return { runs, folder: compiler.folder(), files: packed.files, warnings: diags.length, translated, skipped: packed.warnings };
}
