// The addon folders a compiled pack becomes on the web page: pack.json for a new pack,
// the files Polestar's compiler gives (packFiles), as the ZIP's entries, and the
// diagnostics that stop a pack. Runs in Node and the browser.

import { zip } from "./zip.mjs";

// The pack.json of a new pack: its id, title, author, version 0.1.0 and the licence
// `polestar new` writes by default (CC-BY-4.0), with the key order it writes.
export function packJson({ id, title, author }) {
	return JSON.stringify({ id, title, author, version: "0.1.0", license: "CC-BY-4.0" }, null, "\t") + "\n";
}

// A packFiles entry's content as ZIP data: its text, or the bytes of its base64 { b64 }.
export function fileBytes(content) {
	if (typeof content === "string") return content;
	return Uint8Array.from(atob(content.b64), (c) => c.charCodeAt(0));
}

// packFiles' entries [name, content] -> { "<folder>/<file>": data }. A name without "../" is
// a file of the pack's folder; "../<Other>/<file>" is a file of the sibling addon <Other>.
export function addonEntries(folder, outputs) {
	const entries = {};
	for (const [name, content] of outputs) {
		const path = name.startsWith("../") ? name.slice(3) : `${folder}/${name}`;
		entries[path] = fileBytes(content);
	}
	return entries;
}

// The ZIP of the addon folders, one top-level folder per addon, ready to unzip into Interface/AddOns.
export function addonZip(folder, outputs) {
	return zip(addonEntries(folder, outputs));
}

// The addon folders (top-level names) of a set of ZIP entry paths, in first-seen order.
export function topFolders(paths) {
	return [...new Set(paths.map((p) => p.split("/")[0]))];
}

// The diagnostics that stop a pack: severity "error". Warnings do not stop it.
export function lintErrors(diags) {
	return diags.filter((d) => d.severity === "error");
}
