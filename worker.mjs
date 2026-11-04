// Converts in the background so the page stays responsive: src/build.mjs makes the
// addon folders (converted, compiled by Polestar's compiler as WebAssembly, optionally
// translated), zipped here for the player's Interface/AddOns. The guide files come in
// as File objects from the folder the player picked and are read here, in the browser;
// only the game data is fetched, from this site's polestar-data/.

import { buildAddons } from "./src/build.mjs";
import { addonZip, addonEntries } from "./src/addon.mjs";
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
		const files = new Map(msg.files);
		const read = async (path) => {
			const f = files.get(path.toLowerCase());
			return f ? decode(await f.arrayBuffer()) : null;
		};
		await init({ module_or_path: new URL("./forge/polestar_convert_wasm_bg.wasm", import.meta.url) });
		const r = await buildAddons({ read, paths: [...files.keys()], readData, manifest, Compiler, pack: msg.pack, opts: msg.opts, locales: msg.locale ? [msg.locale] : [], say });
		if (r.errors) {
			self.postMessage({ type: "lint", errors: r.errors.map(({ file, line, message }) => ({ file, line, message })), warnings: r.warnings });
			return;
		}
		say("Packing the ZIP …");
		const bytes = addonZip(r.folder, r.files);
		const summary = Object.entries(r.runs).map(([source, run]) => ({
			source: NAMES[source], guides: run.guides.length, steps: run.guides.reduce((n, g) => n + g.stepsOut, 0),
			look: run.report.items.length, missing: (run.missing || []).length,
		}));
		self.postMessage({
			type: "done", zip: bytes, entries: addonEntries(r.folder, r.files), folder: r.folder, summary, warnings: r.warnings,
			translated: msg.locale ? r.translated[msg.locale]?.counts ?? null : null, skipped: r.skipped || [],
		}, [bytes.buffer]);
	} catch (e) {
		self.postMessage({ type: "error", message: e && e.message ? e.message : String(e) });
	}
};
