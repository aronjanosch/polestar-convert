// Converts in the background so the page stays responsive. The guide files come in
// as File objects from the folder the player picked and are read here, in the
// browser; only the game data is fetched, from this site's polestar-data/.

import { loadData } from "./src/data.mjs";
import { loadNames } from "./src/journey/names.mjs";
import { convertAddons, packZip } from "./src/core.mjs";

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
		const runs = await convertAddons(read, data, names, { ...msg.opts, packId: msg.pack.id, progress: (s) => say(`Converting ${NAMES[s]} …`) });
		say("Packing the ZIP …");
		const bytes = packZip(runs, msg.pack);
		const summary = Object.entries(runs).map(([source, r]) => ({
			source: NAMES[source], guides: r.guides.length, steps: r.guides.reduce((n, g) => n + g.stepsOut, 0),
			look: r.report.items.length, missing: (r.missing || []).length,
		}));
		self.postMessage({ type: "done", zip: bytes, summary }, [bytes.buffer]);
	} catch (e) {
		self.postMessage({ type: "error", message: e && e.message ? e.message : String(e) });
	}
};
