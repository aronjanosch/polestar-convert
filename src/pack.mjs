// A new pack made without Polestar's `new` (the web page): its id and pack.json.

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const RESERVED_IDS = ["guides", "forever", "lookup", "draft", "polestar", "imported"];

// Why Polestar would refuse `id` as a pack id, or null.
export function packIdProblem(id) {
	if (!PACK_ID_RE.test(id)) return "2 to 32 lowercase letters, digits and dashes, starting with a letter or digit";
	if (RESERVED_IDS.includes(id)) return `"${id}" is reserved for Polestar`;
	return null;
}

// A new pack's pack.json, with the key order Polestar's `new` writes. The guides are
// their authors' work, so no open licence: for the player's own use.
export function packJson({ id, title, author }) {
	return JSON.stringify({ id, title, author, version: "0.1.0", license: "Personal use: converted from guides you own" }, null, "\t") + "\n";
}
