# AGENTS.md — polestar-convert

Converts the leveling guides a player has installed (RestedXP, Journey, Zygor) into a
Polestar guide pack, locally, from the command line or the browser page. Layout, adapters,
and how to compare or playtest a change: `docs/development.md`. Per-source formats and
known gaps: `docs/rxp.md`, `docs/zygor.md`, `docs/journey/`.

## Content rule

The guides are their authors' commercial work; this repo ships none of it. Everything
committed (code comments, docs, tests, fixtures, CHANGELOG, issues) uses hand-written
example lines and describes behaviour in our own words: no guide text quoted, no guide files
copied in. Converted packs and reports from a real install stay local
(`polestar-convert-reports/`, `out/` are gitignored).

## Architecture rules

- **Zero dependencies.** Node 24+ standard library only; `package.json` has no
  `dependencies` and keeps it that way.
- **One core for CLI and page.** Code under `src/` takes every input through `read(path)` and
  never touches files or the process; only `src/node/` and the `*/cli.mjs` files do. For the
  same addons and data the page's ZIP equals `--path` output byte for byte (`docs/web.md`).
- **Adapters fill the intermediate form** (`src/ir.mjs`); `emit.mjs` and Polestar's own
  compiler (`wasm/`) do the rest. A new source or construct is adapter work, not emitter work.
- **Polestar's data is the authority** for ids, names and coordinates (`src/data.mjs`); a
  source's own ids are matched against it, not trusted.
- Everything dropped, softened or unplaceable is counted in the report the player sees.

## Verify

```sh
npm test                                              # node --test test/
node tools/compare.mjs main --list <GuideList-forever.xml>   # needs a local guide install
```

There is no CI: run `npm test` before every PR. `tools/compare.mjs` and
`tools/playtest-parallel.sh` need guide addons and a Polestar clone that only the human has;
when a change alters converted output, say which comparison the human should run.

## Docs that move with a change

- `CHANGELOG.md` → `## Unreleased` gets a player-facing line for every behaviour change,
  naming the source (`**RestedXP:** …`).
- `README.md` changes are mirrored in `docs/readme/README.zh-CN.md`.
- A change to how a source is read updates its doc (`docs/rxp.md`, `docs/zygor.md`,
  `docs/journey/`), including its known-gaps list.

## Git workflow

- One branch per topic, named after it and its issue (`rxp-warnings-28`), merged via PR.
- Commit subjects are a plain sentence naming the source and the behaviour
  (`RestedXP: along reminders, use tools and hearths that check off`); the body explains
  which guides it affects and why.
- Commits and PR bodies end without AI attribution trailers.
