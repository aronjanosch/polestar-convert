// A new pack's own files, for a pack made without Polestar's `new` (the web page):
// the pack.json Polestar checks (tools/lib/pack/manifest.js) and a README.

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const RESERVED_IDS = ["guides", "forever", "lookup", "draft", "polestar", "imported"];

// Why Polestar would refuse `id` as a pack id, or null.
export function packIdProblem(id) {
	if (!PACK_ID_RE.test(id)) return "2 to 32 lowercase letters, digits and dashes, starting with a letter or digit";
	if (RESERVED_IDS.includes(id)) return `"${id}" is reserved for Polestar`;
	return null;
}

export function newPack({ id, title, author }) {
	const manifest = { id, title, author, version: "0.1.0", license: "Personal use: converted from guides you own" };
	const readme = `# ${title}

Guides converted with polestar-convert (https://github.com/aronjanosch/polestar-convert)
from the guide addons in your own game install. The guides are their authors'
work: keep this pack to yourself.

Check it and put it into the game from your Polestar clone:

    cd ${id}
    node <polestar>/tools/polestar.js lint      # warnings are expected; only errors stop install
    node <polestar>/tools/polestar.js install   # builds the pack and puts it into the game

Then restart the game completely. The guides show in Polestar's hub
(/polestar guides) under Community guides. reports/ lists what each guide
addon's steps could not carry.
`;
	return { "pack.json": JSON.stringify(manifest, null, "\t") + "\n", "README.md": readme };
}
