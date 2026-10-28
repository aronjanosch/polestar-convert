//! `tables <Polestar clone> <out dir>`: the compiler's client tables, which forge-guide reads from a
//! clone's files only, as the JSON the page hands to `Compiler`: instances.json, areas.json and
//! spell-names.json. tools/pages.mjs runs it.

use forge_guide::js::stringify;
use std::path::Path;

fn main() {
	let args: Vec<String> = std::env::args().skip(1).collect();
	let [clone, out] = args.as_slice() else {
		eprintln!("usage: tables <Polestar clone> <out dir>");
		std::process::exit(2);
	};
	if let Err(e) = run(Path::new(clone), Path::new(out)) {
		eprintln!("tables: {e}");
		std::process::exit(1);
	}
}

fn run(clone: &Path, out: &Path) -> Result<(), String> {
	let sources = clone.join("data/sources");
	let data = forge_guide::data::load_data(&clone.join("data/forever"))?;
	let spells: Vec<serde_json::Value> = forge_guide::tokens::read_spell_names(&data).into_iter().map(|(n, id)| serde_json::json!([n, id])).collect();
	std::fs::create_dir_all(out).map_err(|e| format!("{}: {e}", out.display()))?;
	let write = |name: &str, text: String| std::fs::write(out.join(name), text).map_err(|e| format!("{name}: {e}"));
	write("instances.json", stringify(&forge_guide::solo::load_instances(&sources), None))?;
	write("areas.json", stringify(&forge_guide::areas::load_areas(&sources), None))?;
	write("spell-names.json", serde_json::Value::Array(spells).to_string())
}
