// The page: picks the AddOns folder, sends its guide files to the worker, hands the
// addon ZIP back (and installs it into the folder the player picks, where the browser
// allows). The files stay in the browser.

import { addonsPaths, findSources } from "./src/core.mjs";
import { packIdProblem } from "./src/pack.mjs";
import { rxpLocales } from "./src/rxp/translations.mjs";
import { topFolders } from "./src/addon.mjs";

const $ = (id) => document.getElementById(id);
const NAMES = { rxp: "RestedXP", journey: "Journey", zygor: "Zygor" };
// The languages of RestedXP's translations, by the locale names the page's data uses.
const LOCALE_NAMES = { deDE: "Deutsch", esES: "Español", frFR: "Français", ptBR: "Português (Brasil)", zhCN: "中文 (简体)" };
// The folders the converter reads from; the rest of the AddOns folder is not touched.
const READS = ["rxpguides/guides/", "rxpguides/lang/", "journey/data/guides/", ...["leveling", "dungeons", "professions", "reputations", "events"].map((f) => `zygorguidesviewerclassic/guides-classic/${f}/`)];

let picked = null; // { files: [[path, File]], sources }
let siteNames = []; // the locales the page has names for (manifest.json `names`)
let zipUrl = null;
let result = null; // the last conversion's worker message

async function dataInfo() {
	try {
		const m = await (await fetch("polestar-data/manifest.json")).json();
		siteNames = m.names || [];
		const commit = m.polestar.commit ? m.polestar.commit.slice(0, 8) : "unknown";
		$("data-info").textContent = `Game data from Polestar ${commit}, built ${String(m.builtAt).slice(0, 10)}, Forever client ${m.foreverBuild}${m.questie ? "" : ", without QuestieDB"}.`;
		if (!m.questie) {
			const w = $("data-warning");
			w.hidden = false;
			w.textContent = "This page's game data is built without QuestieDB: quests, NPCs and items only Forever has are missing, so many converted steps lose their target. For full guides use the command line with your own Polestar data build: npx github:aronjanosch/polestar-convert --path <WoW folder>.";
		}
	} catch {
		$("data-info").textContent = "The game data could not be loaded; converting will fail.";
	}
}

function show(sources, count) {
	// Step 2 shows what was found; here only a folder without any guide addon.
	const list = $("found");
	list.replaceChildren();
	if (!sources.length) {
		const li = document.createElement("li");
		li.className = "none";
		li.textContent = `No guide addon among ${count} files: pick the folder that holds RXPGuides, Journey or ZygorGuidesViewerClassic.`;
		list.append(li);
	}
	$("step-routes").setAttribute("aria-disabled", String(!sources.length));
	for (const box of document.querySelectorAll("input[name=source]")) {
		const on = sources.includes(box.value);
		box.disabled = !on;
		box.checked = on;
		$(`src-${box.value}`).textContent = on ? (box.value === "rxp" ? "found: the routes you tick below" : (box.value === "zygor" ? "found: its guides, or its free trial guides" : "found: its whole route")) : "not in this folder";
	}
	routesEnabled();
	$("step-pack").setAttribute("aria-disabled", String(!sources.length));
	check();
}

// The routes count only while RestedXP is found and ticked; the language only then too.
function routesEnabled() {
	const rxp = document.querySelector("input[name=source][value=rxp]");
	for (const box of document.querySelectorAll("input[name=route]")) box.disabled = rxp.disabled || !rxp.checked;
	languages();
}

// The languages to offer: those RestedXP ships in the picked folder and the page has names for.
function languages() {
	const rxp = document.querySelector("input[name=source][value=rxp]");
	const select = $("lang");
	const locales = picked ? rxpLocales(picked.files.map(([p]) => p)).filter((l) => siteNames.includes(l)) : [];
	const keep = select.value;
	select.replaceChildren(new Option("English (as RestedXP has them)", ""), ...locales.map((l) => new Option(LOCALE_NAMES[l] ?? l, l)));
	select.value = locales.includes(keep) ? keep : "";
	$("lang-field").hidden = rxp.disabled || !rxp.checked || !locales.length;
}

// The sources to convert: found, ticked, and for RestedXP with a route ticked.
function chosen() {
	const routes = [...document.querySelectorAll("input[name=route]:checked")].map((b) => b.value);
	const sources = [...document.querySelectorAll("input[name=source]:checked:not(:disabled)")].map((b) => b.value).filter((s) => s !== "rxp" || routes.length);
	return { sources, routes };
}

function check() {
	const id = $("pack-id").value.trim();
	const problem = packIdProblem(id);
	$("pack-id").setAttribute("aria-invalid", String(!!problem));
	$("pack-id-err").textContent = problem ? `Pack id: ${problem}.` : "";
	$("convert").disabled = !picked || !chosen().sources.length || !!problem || !$("rights").checked;
}

$("pick").addEventListener("click", () => $("folder").click());
$("folder").addEventListener("change", async () => {
	const all = [...$("folder").files];
	const paths = addonsPaths(all.map((f) => f.webkitRelativePath || f.name));
	const files = [...paths].filter(([p]) => READS.some((r) => p.startsWith(r))).map(([p, i]) => [p, all[i]]);
	const have = new Set(files.map(([p]) => p));
	const sources = await findSources(async (p) => (have.has(p.toLowerCase()) ? "" : null));
	picked = { files, sources };
	show(sources, all.length);
});
for (const el of document.querySelectorAll("#pack-id, #rights, input[name=route], input[name=source]")) el.addEventListener("input", () => { routesEnabled(); check(); });

$("form").addEventListener("submit", (ev) => {
	ev.preventDefault();
	if ($("convert").disabled) return;
	const pack = { id: $("pack-id").value.trim(), title: $("pack-title").value.trim() || "My Guides", author: $("pack-author").value.trim() || "Me" };
	const { sources, routes } = chosen();
	const locale = $("lang-field").hidden ? "" : $("lang").value;
	const log = $("log");
	log.textContent = "";
	$("convert").disabled = true;
	$("step-done").hidden = true;
	const started = performance.now();
	const worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
	worker.onmessage = ({ data: msg }) => {
		if (msg.type === "progress") { log.textContent += `${msg.text}\n`; return; }
		worker.terminate();
		$("convert").disabled = false;
		if (msg.type === "error") { log.textContent += `Failed: ${msg.message}\n`; return; }
		if (msg.type === "lint") {
			log.textContent += `Not made: Polestar's compiler found ${msg.errors.length} error${msg.errors.length === 1 ? "" : "s"} in the guides (${msg.warnings} warnings do not stop it):\n`;
			for (const e of msg.errors.slice(0, 50)) log.textContent += `  ${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}\n`;
			if (msg.errors.length > 50) log.textContent += `  … and ${msg.errors.length - 50} more\n`;
			return;
		}
		log.textContent += `Done in ${Math.round((performance.now() - started) / 1000)} s.\n`;
		done(msg, pack, locale);
	};
	worker.onerror = (e) => { log.textContent += `Failed: ${e.message || "the converter could not start"}\n`; $("convert").disabled = false; };
	worker.postMessage({ files: picked.files, pack, locale, opts: { sources, routes } });
});

function done(msg, pack, locale) {
	result = msg;
	if (zipUrl) URL.revokeObjectURL(zipUrl);
	zipUrl = URL.createObjectURL(new Blob([msg.zip], { type: "application/zip" }));
	const a = $("download");
	a.href = zipUrl;
	a.download = `${msg.folder}.zip`;
	const body = $("summary").querySelector("tbody");
	body.replaceChildren();
	for (const s of msg.summary) {
		const tr = document.createElement("tr");
		for (const [v, num] of [[s.source, false], [s.guides, true], [s.steps, true], [s.look, true]]) {
			const td = document.createElement("td");
			td.textContent = typeof v === "number" ? v.toLocaleString("en") : v;
			if (num) td.className = "num";
			tr.append(td);
		}
		body.append(tr);
	}
	const notes = [];
	if (locale && msg.translated) {
		const counts = msg.translated;
		const total = Object.values(counts).reduce((n, v) => n + v, 0);
		notes.push(`${(counts.translated || 0).toLocaleString("en")} of ${total.toLocaleString("en")} RestedXP texts translated into ${LOCALE_NAMES[locale] ?? locale}.`);
	}
	if (msg.skipped && msg.skipped.length) notes.push(`${msg.skipped.length} translations Polestar would refuse were left out (English stays).`);
	if (msg.warnings) notes.push(`${msg.warnings} compiler warnings: they do not stop the addon.`);
	$("lang-note").textContent = notes.join(" ");
	$("lang-note").hidden = !notes.length;
	$("install").hidden = !window.showDirectoryPicker;
	$("install-status").textContent = "";
	$("step-done").hidden = false;
	a.click();
	$("step-done").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Writes the addon folders into an AddOns folder the player picks. An existing folder of
// the same name is replaced only after a confirm.
async function install() {
	const status = $("install-status");
	try {
		const root = await window.showDirectoryPicker({ mode: "readwrite" });
		if (root.name !== "AddOns" && !confirm(`The folder "${root.name}" is not called AddOns. Install the addon there anyway?`)) return;
		const folders = topFolders(Object.keys(result.entries));
		const existing = [];
		for (const f of folders) if (await exists(root, f)) existing.push(f);
		if (existing.length && !confirm(`Replace the existing ${existing.join(", ")} folder in ${root.name}? Its files are deleted first.`)) {
			status.textContent = "Not installed: the existing folder was kept.";
			return;
		}
		for (const f of existing) await root.removeEntry(f, { recursive: true });
		for (const [path, data] of Object.entries(result.entries)) {
			const parts = path.split("/");
			let dir = root;
			for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
			const file = await dir.getFileHandle(parts.at(-1), { create: true });
			const writable = await file.createWritable();
			await writable.write(data);
			await writable.close();
		}
		status.textContent = `Installed ${folders.join(", ")} into ${root.name}. Restart the game completely.`;
	} catch (e) {
		status.textContent = e.name === "AbortError" ? "Not installed: no folder picked." : `Not installed: ${e.message || e}`;
	}
}

async function exists(dir, name) {
	try {
		await dir.getDirectoryHandle(name);
		return true;
	} catch {
		return false;
	}
}

$("install").addEventListener("click", install);
dataInfo();
