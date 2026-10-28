//! Polestar's guide compiler (forge-guide) for the converter's web page: the converted
//! guides compiled into the addon folders the player copies into Interface/AddOns, and
//! the texts a translation fills, so no Node and no Polestar clone are needed. JSON
//! strings in, JSON strings out. (The tables binary, native, builds without it.)
#![cfg(target_arch = "wasm32")]

use forge_guide::data::Data;
use forge_guide::diag::{Diag, Diagnostics};
use forge_guide::format::default_folder;
use forge_guide::i18n_guides::{guide_texts, pack_texts, text_problems, Text};
use forge_guide::js::{parse_json, V};
use forge_guide::manifest::validate_manifest;
use forge_guide::project::{build_pack_files, compile_sources, CompileOpts, FileContent, Source};
use rustc_hash::FxHashMap;
use serde_json::{json, Map, Value};
use wasm_bindgen::prelude::*;

/// forge-guide tokens.rs's memo key for the spell names.
const SPELL_NAMES_MEMO: &str = "tokens.spellNames";

fn err(e: impl std::fmt::Display) -> JsValue {
	JsValue::from_str(&e.to_string())
}

fn parse(s: &str, what: &str) -> Result<V, JsValue> {
	if s.trim().is_empty() {
		Ok(V::Null)
	} else {
		parse_json(s).map_err(|e| err(format!("{what}: {e}")))
	}
}

fn diags(list: &[Diag]) -> Value {
	list.iter()
		.map(|d| {
			let mut o = json!({ "file": d.file, "line": d.line, "severity": d.severity, "message": d.message });
			if let Some(h) = &d.hint {
				o["hint"] = json!(h);
			}
			o
		})
		.collect()
}

// As guide_texts writes them: { text, where, tokens: [[token, English]], plurals: [[token, English]] }.
fn texts(list: &[Text]) -> Value {
	list.iter().map(|t| json!({ "text": t.text, "where": t.where_, "tokens": t.tokens, "plurals": t.plurals })).collect()
}

fn b64(b: &[u8]) -> String {
	const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	let mut s = String::with_capacity(b.len().div_ceil(3) * 4);
	for c in b.chunks(3) {
		let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
		for i in 0..4 {
			s.push(if i <= c.len() { T[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
		}
	}
	s
}

#[wasm_bindgen]
pub struct Compiler {
	data: Data,
	manifest: V,
	license: Option<String>,
	iface: String,
	guides: Vec<V>,
}

#[wasm_bindgen]
impl Compiler {
	/// `data`: JSON `{ "<file>": "<its JSON text>" }` of Polestar's reference data (quests, npcs, ...);
	/// `instances`, `areas`: the compiler's client tables as JSON texts ("" when absent).
	#[wasm_bindgen(constructor)]
	pub fn new(data: &str, instances: &str, areas: &str) -> Result<Compiler, JsValue> {
		let texts: FxHashMap<String, String> = serde_json::from_str(data).map_err(|e| err(format!("data: {e}")))?;
		let data = Data::from_texts(&texts, parse(instances, "instances.json")?, parse(areas, "areas.json")?, None).map_err(err)?;
		Ok(Compiler { data, manifest: V::obj(), license: None, iface: String::new(), guides: Vec::new() })
	}

	/// The client's spell names the compiler's texts read: JSON [[name, id], ...].
	#[wasm_bindgen(js_name = setSpellNames)]
	pub fn set_spell_names(&mut self, json: &str) -> Result<(), JsValue> {
		let v = parse(json, "spell names")?;
		self.data.memo.borrow_mut().insert(SPELL_NAMES_MEMO, v);
		Ok(())
	}

	/// The pack: its pack.json text, its LICENSE text (or none) and the core TOC's `## Interface:` value.
	/// -> JSON diagnostics of pack.json, checked and completed as `read_manifest` does (default folder).
	#[wasm_bindgen(js_name = setPack)]
	pub fn set_pack(&mut self, manifest: &str, license: Option<String>, iface: &str) -> Result<String, JsValue> {
		let m = parse(manifest, "pack.json")?;
		let d = validate_manifest(&m, "pack.json", false, Some(manifest));
		if !m.get("folder").truthy() {
			m.set("folder", default_folder(m.get("title").as_str(), m.get("id").as_str()));
		}
		self.manifest = m;
		self.license = license;
		self.iface = iface.to_string();
		Ok(diags(&d).to_string())
	}

	/// The pack's addon folder (pack.json's `folder`, else the default): `packFiles` names its files.
	pub fn folder(&self) -> String {
		self.manifest.get("folder").to_js_string()
	}

	/// Compile the pack's guides: JSON [[pack-relative path, text], ...] -> JSON diagnostics. The
	/// guides are kept for `texts` and `packFiles`.
	pub fn compile(&mut self, files: &str) -> Result<String, JsValue> {
		let files: Vec<(String, String)> = serde_json::from_str(files).map_err(|e| err(format!("files: {e}")))?;
		let sources: Vec<Source> = files.into_iter().map(|(source, text)| Source { file: source.clone(), source, text }).collect();
		let opts = CompileOpts {
			pack: self.manifest.get("id").as_str().map(str::to_string),
			author: self.manifest.get("author").as_str().map(str::to_string),
			context: None,
			pack_dir: None,
		};
		let mut diag = Diagnostics::new();
		self.guides = compile_sources(&sources, &self.data, &mut diag, &opts).guides;
		Ok(diags(&diag.sorted()).to_string())
	}

	/// The texts a translation fills, as `i18n guides sync` writes them: JSON
	/// `{ pack: [text], guides: { <guide id>: [text] } }`.
	pub fn texts(&self) -> String {
		let guides: Map<String, Value> = self.guides.iter().map(|g| (g.get("id").to_js_string(), texts(&guide_texts(g)))).collect();
		json!({ "pack": texts(&pack_texts(&self.manifest, &self.guides)), "guides": guides }).to_string()
	}

	/// The addon folders: `translations` JSON `{ <locale>: { pack: {..}, guides: { <guide id>: { english: translated } } } }`
	/// -> JSON `{ files: [[name, text | { b64 }]], warnings: [message] }`: the main folder's files and
	/// `../<addon>/<file>` for the others. A translation Polestar would refuse (a token lost, a broken
	/// format) is left out with a warning, as reading a pack's locale files does: the English shows.
	#[wasm_bindgen(js_name = packFiles)]
	pub fn pack_files(&self, translations: &str) -> Result<String, JsValue> {
		let translations = parse(translations, "translations")?;
		let translations = if translations.truthy() { translations } else { V::obj() };
		let mut warnings: Vec<String> = Vec::new();
		let checked = |locale: &str, what: &str, texts: &[Text], given: &V, warnings: &mut Vec<String>| -> V {
			let out = V::obj();
			for (k, v) in given.entries() {
				let v = v.to_js_string();
				let plurals: Vec<String> = texts.iter().find(|t| t.text == *k).map(|t| t.plurals.iter().map(|p| p.0.clone()).collect()).unwrap_or_default();
				let problems = text_problems(&k, &v, &plurals, &[]);
				if problems.is_empty() {
					out.set(&k, v);
				}
				for p in problems {
					warnings.push(format!("{locale} {what}: {k:?}: the translation {p}; it is left out, the English shows"));
				}
			}
			out
		};
		let ok = V::obj();
		for locale in translations.keys() {
			let t = translations.get(&locale);
			let guides = V::obj();
			for g in &self.guides {
				let id = g.get("id").to_js_string();
				let given = t.get("guides").get(&id);
				if given.truthy() {
					guides.set(&id, checked(&locale, &id, &guide_texts(g), &given, &mut warnings));
				}
			}
			let pack = checked(&locale, "pack", &pack_texts(&self.manifest, &self.guides), &t.get("pack"), &mut warnings);
			ok.set(&locale, V::obj());
			ok.get(&locale).set("pack", pack);
			ok.get(&locale).set("guides", guides);
		}
		let files = build_pack_files(&self.guides, &self.manifest, &self.data, self.license.as_deref(), &ok, &[], &self.iface, Vec::new());
		let out: Vec<Value> = files
			.into_iter()
			.map(|(name, c)| match c {
				FileContent::Text(t) => json!([name, t]),
				FileContent::Bytes(b) => json!([name, { "b64": b64(&b) }]),
			})
			.collect();
		Ok(json!({ "files": out, "warnings": warnings }).to_string())
	}
}
