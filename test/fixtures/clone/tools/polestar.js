// Stand-in for the clone's tools/polestar.js: `sync` writes one locale file, `check` says ok.
const fs = require("node:fs");
const path = require("node:path");
const [, , , , cmd, ...rest] = process.argv;
const pack = rest[rest.indexOf("--pack") + 1];
if (cmd === "sync") {
	const dir = path.join(pack, "locales", rest[0], "guides");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "x.lua"), '\t["Hello"] = "",\n');
}
console.log(cmd === "check" ? "ok" : "synced");
