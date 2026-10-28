// Converts in the background so the page stays responsive: the guide addons are
// converted, compiled by Polestar's compiler (WebAssembly, web/forge/) into the addon
// folders, optionally translated, and zipped for the player's Interface/AddOns. The
// files come in as File objects from the folder the player picked and are read here, in
// the browser; only the game data is fetched, from this site's polestar-data/.

import { loadData } from "./src/data.mjs";
import { loadNames } from "./src/journey/names.mjs";
import { convertAddons } from "./src/core.mjs";
import { namesFrom } from "./src/i18n/names.mjs";
import { rxpTranslations } from "./src/rxp/translations.mjs";
import { packJson, addonZip, lintErrors, addonEntries } from "./src/addon.mjs";
import { COMPILER_NAMES } from "./src/data.mjs";
import init, { Compiler } from "./forge/polestar_convert_wasm.js";

const DATA = new URL("./polestar-data/", import.meta.url);
// As Node's readFileSync(…, "utf8") reads: a byte order mark stays.
const decode = (buffer) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(buffer);
const NAMES = { rxp: "RestedXP", journey: "Journey", zygor: "Zygor" };

self.onmessage = async ({ data: msg }) => {
	const say = (text) => self.postMessage({ type: "progress", text });
	try {
		const manifest = await (await fetch(new URL("manifest.json", DATA))).json();
		const have = new Set(manifest.files);
		const cache = new Map();
		const readData = (path) => {
			if (!have.has(path)) return Promise.resolve(null);
			if (!cache.has(path)) cache.set(path, fetch(new URL(path, DATA)).then(async (r) => (r.ok ? decode(await r.arrayBuffer()) : null)));
			return cache.get(path);
		};
		say("Loading Polestar's game data …");
		const data = await loadData(readData);
		const names = await loadNames(readData, data, manifest.levelXp);
		const files = new Map(msg.files);
		const read = async (path) => {
			const f = files.get(path.toLowerCase());
			return f ? decode(await f.arrayBuffer()) : null;
		};
		say("Converting …");
		const runs = await convertAddons(read, data, names, { ...msg.opts, packId: msg.pack.id, progress: (s) => say(`Converting ${NAMES[s]} …`) });

		// The compiler: its data and client tables, then the pack and its guides.
		say("Compiling the addon with Polestar's compiler …");
		await init({ module_or_path: new URL("./forge/polestar_convert_wasm_bg.wasm", import.meta.url) });
		const compilerData = {};
		for (const n of COMPILER_NAMES) {
			const text = await readData(`data/forever/${n}.json`);
			if (text != null) compilerData[n] = text;
		}
		const compiler = new Compiler(JSON.stringify(compilerData), await readData("tables/instances.json"), await readData("tables/areas.json"));
		compiler.setSpellNames(await readData("tables/spell-names.json"));
		const packDiags = JSON.parse(compiler.setPack(packJson(msg.pack), null, manifest.iface));
		const guides = Object.values(runs).flatMap((r) => r.guides.map((g) => [`guides/${g.slug}.guide`, g.text]));
		const diags = [...packDiags, ...JSON.parse(compiler.compile(JSON.stringify(guides)))];
		const errors = lintErrors(diags);
		const warnings = diags.length - errors.length;
		if (errors.length) {
			self.postMessage({ type: "lint", errors: errors.map(({ file, line, message }) => ({ file, line, message })), warnings });
			return;
		}

		// A language picked: RestedXP's translated texts, filled into the compiler's texts.
		const translations = {};
		let translated = null;
		if (msg.locale && runs.rxp) {
			say(`Translating RestedXP's texts into ${msg.locale} …`);
			const namesOf = await namesFrom(readData, msg.locale);
			const result = await rxpTranslations({ read, paths: [...files.keys()], run: runs.rxp, locale: msg.locale, texts: JSON.parse(compiler.texts()), namesOf });
			translations[msg.locale] = result.translations;
			translated = result.counts;
		}

		say("Packing the ZIP …");
		const packed = JSON.parse(compiler.packFiles(JSON.stringify(translations)));
		const folder = compiler.folder();
		const entries = addonEntries(folder, packed.files);
		const bytes = addonZip(folder, packed.files);
		const summary = Object.entries(runs).map(([source, r]) => ({
			source: NAMES[source], guides: r.guides.length, steps: r.guides.reduce((n, g) => n + g.stepsOut, 0),
			look: r.report.items.length, missing: (r.missing || []).length,
		}));
		self.postMessage({
			type: "done", zip: bytes, entries, folder, summary, warnings,
			translated, skipped: packed.warnings || [],
		}, [bytes.buffer]);
	} catch (e) {
		self.postMessage({ type: "error", message: e && e.message ? e.message : String(e) });
	}
};
