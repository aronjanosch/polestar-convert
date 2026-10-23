// The page: picks the AddOns folder, sends its guide files to the worker, hands the
// ZIP back. The files stay in the browser.

import { addonsPaths, findSources } from "./src/core.mjs";
import { packIdProblem } from "./src/pack.mjs";

const $ = (id) => document.getElementById(id);
const NAMES = { rxp: "RestedXP", journey: "Journey", zygor: "Zygor" };
// The folders the converter reads from; the rest of the AddOns folder is not touched.
const READS = ["rxpguides/guides/", "journey/data/guides/", "zygorguidesviewerclassic/guides-classic/leveling/"];

let picked = null; // { files: [[path, File]], sources }
let zipUrl = null;

async function dataInfo() {
	try {
		const m = await (await fetch("polestar-data/manifest.json")).json();
		const commit = m.polestar.commit ? m.polestar.commit.slice(0, 8) : "unknown";
		$("data-info").textContent = `Game data from Polestar ${commit}, built ${String(m.builtAt).slice(0, 10)}, Forever client ${m.foreverBuild}${m.questie ? "" : ", without QuestieDB"}.`;
		if (!m.questie) {
			const w = $("data-warning");
			w.hidden = false;
			w.textContent = "This page's game data is built without QuestieDB: quests, NPCs and items only Forever has are missing, so many converted steps lose their target. For full guides use the command line with your own Polestar data build: npx polestar-convert --path <WoW folder>.";
		}
	} catch {
		$("data-info").textContent = "The game data could not be loaded; converting will fail.";
	}
}

function show(sources, count) {
	const list = $("found");
	list.replaceChildren();
	for (const s of Object.keys(NAMES)) {
		const li = document.createElement("li");
		const on = sources.includes(s);
		li.className = on ? "" : "none";
		li.textContent = on ? `${NAMES[s]} found` : `${NAMES[s]}: not in this folder`;
		list.append(li);
	}
	if (!sources.length) {
		const li = document.createElement("li");
		li.className = "none";
		li.textContent = `No guide addon among ${count} files: pick the folder that holds RXPGuides, Journey or ZygorGuidesViewerClassic.`;
		list.append(li);
	}
	$("step-routes").setAttribute("aria-disabled", String(!sources.includes("rxp")));
	for (const box of document.querySelectorAll("input[name=route]")) box.disabled = !sources.includes("rxp");
	$("step-pack").setAttribute("aria-disabled", String(!sources.length));
	check();
}

function check() {
	const id = $("pack-id").value.trim();
	const problem = packIdProblem(id);
	$("pack-id").setAttribute("aria-invalid", String(!!problem));
	$("pack-id-err").textContent = problem ? `Pack id: ${problem}.` : "";
	const routes = [...document.querySelectorAll("input[name=route]:checked")].map((b) => b.value);
	const onlyRxp = picked && picked.sources.length === 1 && picked.sources[0] === "rxp";
	$("convert").disabled = !picked || !picked.sources.length || !!problem || (onlyRxp && !routes.length);
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
for (const el of document.querySelectorAll("#pack-id, input[name=route]")) el.addEventListener("input", check);

$("form").addEventListener("submit", (ev) => {
	ev.preventDefault();
	if ($("convert").disabled) return;
	const pack = { id: $("pack-id").value.trim(), title: $("pack-title").value.trim() || "My Guides", author: $("pack-author").value.trim() || "Me" };
	const routes = [...document.querySelectorAll("input[name=route]:checked")].map((b) => b.value);
	const sources = picked.sources.filter((s) => s !== "rxp" || routes.length);
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
		log.textContent += `Done in ${Math.round((performance.now() - started) / 1000)} s.\n`;
		done(msg, pack);
	};
	worker.onerror = (e) => { log.textContent += `Failed: ${e.message || "the converter could not start"}\n`; $("convert").disabled = false; };
	worker.postMessage({ files: picked.files, pack, opts: { sources, routes } });
});

function done(msg, pack) {
	if (zipUrl) URL.revokeObjectURL(zipUrl);
	zipUrl = URL.createObjectURL(new Blob([msg.zip], { type: "application/zip" }));
	const a = $("download");
	a.href = zipUrl;
	a.download = `${pack.id}.zip`;
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
	$("cmds").textContent = `cd ${pack.id}\nnode ../polestar/tools/polestar.js lint      # checks every guide against the game data\nnode ../polestar/tools/polestar.js install   # builds the pack and puts it into the game`;
	$("step-done").hidden = false;
	a.click();
	$("step-done").scrollIntoView({ behavior: "smooth", block: "start" });
}

dataInfo();
