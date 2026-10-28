<div align="center">

**English** · [简体中文](docs/readme/README.zh-CN.md)

# polestar-convert

### Your RestedXP, Journey and Zygor guides, running in Polestar.

**Convert the leveling guides you already own into a guide pack for [Polestar](https://github.com/fitzforge/polestar), on your own machine.**

[![MIT licence](https://img.shields.io/badge/licence-MIT-e6ba66?style=flat-square&labelColor=232a3f)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white&labelColor=232a3f)](https://nodejs.org/)
[![Polestar 0.3.0+](https://img.shields.io/badge/Polestar-0.3.0%2B-94c9ff?style=flat-square&labelColor=232a3f)](https://github.com/fitzforge/polestar)
[![WoW: Forever](https://img.shields.io/badge/WoW-Forever-fabf4d?style=flat-square&labelColor=232a3f)](#quick-start)
[![Sources: RestedXP, Journey, Zygor](https://img.shields.io/badge/sources-RestedXP_·_Journey_·_Zygor-f16436?style=flat-square&labelColor=232a3f)](#quick-start)

[Quick start](#quick-start) · [How it differs](#how-it-differs-from-the-original) · [Translations](#translations) · [Known gaps](#known-gaps) · [FAQ](#faq) · [Documentation](#documentation)

</div>

> [!IMPORTANT]
> **Unofficial.** polestar-convert is not made, endorsed or supported by
> RestedXP, Journey, Zygor or Polestar. Report problems with a converted guide
> [here](https://github.com/aronjanosch/polestar-convert/issues), not to them.
>
> **It ships no guide content.** It reads the guide addon *you* have installed
> and writes the result into a pack on *your* machine. The guides are their
> authors' work: keep the converted pack to yourself.
>
> **Convert only guides you have the right to use:** free guides, or guides
> whose licence allows it. The tool cannot tell; what you convert is your
> responsibility.

---

You like the route of a guide addon you have installed, but you want to
play it with Polestar's arrow, quest automation, travel planner and hub.
polestar-convert reads that addon's guide files, writes every step in
Polestar's `.guide` format with ids, names and coordinates from Polestar's own
game data, and builds them with Polestar's own compiler into an addon you copy
into the game.

Your guides never leave your machine. The converter runs locally, in your
browser or with Node, and reports everything it dropped, softened or could not
place, so you know what to look at.

## Quick start

You need World of Warcraft: Forever, **Polestar 0.3.0 or newer** in its
`Interface/AddOns` folder (until 0.3.0 is released, Polestar's `next` branch,
installed as its README says) and at least one guide addon there: RestedXP,
Journey or Zygor. Nothing else: no clone, no game data to build.

**In your browser:** open **[aronjanosch.github.io/polestar-convert](https://aronjanosch.github.io/polestar-convert/)**,
pick your `Interface/AddOns` folder, choose the guide addons and RestedXP
routes you want and, for RestedXP, a language, confirm that you convert only
guides you have the right to use, and download the ZIP. Unzip it into
`World of Warcraft/_forever_/Interface/AddOns`. Where the browser allows it
(Chrome, Edge), the page puts the folders there itself. The page reads your
guide files in the browser; nothing is uploaded.

**Or with one command** (needs **Node 24+**): `<WoW>` is your World of Warcraft
folder, such as `C:\Program Files (x86)\World of Warcraft` (the `_forever_`
folder in it or its `Interface/AddOns` work too).

```sh
npx github:aronjanosch/polestar-convert --path "<WoW>" --install
```

It finds RestedXP, Journey and Zygor (its leveling, dungeon, profession,
reputation and event guides; for a faction whose full guides are not
installed, the free trial guides the viewer ships), asks which RestedXP routes
you want (`--routes main,dungeon,survival` skips the question; routes your
guides do not have are left out), converts every guide with all of RestedXP's
languages (`--locales zhCN` for one, `none` for none) and puts the addon into
the game. Without `--install` it writes the folders into `./polestar-addon` to
look at first. `--name "My Guides"` names the addon.

Both ways make the same addon: Polestar's own compiler, run as WebAssembly,
builds it from the converted guides, with the game data the page hosts
([GPLv3](#licence)). Compiler warnings (an elite to group up for, a target with
no known spawn) are expected; only errors stop it. Restart the game
completely: your guides show in Polestar's hub (`/polestar guides`) under
Community guides.

### Working on the converter

The single commands write `.guide` files into a pack made with Polestar's
`new`, for its `lint`, `playtest` and `play` (a Polestar clone with its data
built), with more options such as `--only "<guide name>"`:

```sh
npx github:aronjanosch/polestar-convert rxp --list "<WoW>/_forever_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml" --polestar polestar --pack my-pack
npx github:aronjanosch/polestar-convert journey --dir "<WoW>/_forever_/Interface/AddOns/Journey" --polestar polestar --pack my-pack
npx github:aronjanosch/polestar-convert zygor --dir "<WoW>/_forever_/Interface/AddOns/ZygorGuidesViewerClassic" --polestar polestar --pack my-pack
```

> [!TIP]
> `--only "<guide name>"` converts a single guide, which is much faster while
> you try things out. Each run prints a report: what was dropped, what became
> a task or a note, and what needs a human look.

## Coverage

How much of each original carries over, measured on 2026-10-23 against
Polestar `next` 772b2065:

| Source | Version | Carried without a recorded loss |
|---|---|---|
| RestedXP | 4.11.26 | **97 %** |
| Zygor | 8.1 | **97 %** |
| Journey | 4.00.02 | **71 %** |

A step counts when the run's reports note nothing for it (steps the original
shows to no one aside). Zygor counts all its families: leveling, dungeons,
professions, reputations and events. Most notes are softenings, not losses: a condition
Polestar cannot express (a Zygor buff check), one of Journey's per-step variants
read as the normal case, a goal to tick by hand. The reports differ in detail
(Journey and Zygor list every softening per step, RestedXP less), so the
numbers are a first measure, not a ranking; a hand audit of RestedXP guides
found about 95 % of steps right. Every lint passes with 0 errors.

RestedXP's words in Chinese (zhCN), measured on 2026-10-25 with the same
versions and all three routes: **63 %** of the texts translated in full,
4 % more in part. The rest are words RXP has translated in none of its guides;
game names show in Chinese everywhere.

## How it differs from the original

The route, the quests and the text are the original's; how a step runs is
Polestar's. The rule behind every choice: **a step the original shows holds in
Polestar until it is done, ticked or skipped. Nothing passes unseen.**

- **The play style is fixed.** The original picks steps live for solo or
  group, softcore or hardcore, self-found or not. The converter writes one
  style: softcore, auction house allowed. Group quests stay, and Polestar asks
  you per quest in game.
- **Objectives beside the route** (RestedXP's `#completewith`, Zygor's sticky
  steps) go to Polestar's *Along the way* list where Polestar can tick them,
  and become a step of their own or a task you tick where it cannot.
- **Commands Polestar has no goal for** (equip an item, a death skip, the
  bank) become tasks you tick yourself.
- **Waypoints** of farming and fighting are left out: Polestar finds the spots
  itself (*Next spot*). Ways between places stay.
- **Ids, names and coordinates come from Polestar's data**, never from memory.
  Quest objectives are matched by name, since the sources number them
  differently.

The details per source: [RestedXP](docs/rxp.md), [Zygor](docs/zygor.md),
[Journey](docs/journey/polestar-gaps.md).

## Translations

Polestar shows game names (NPCs, quests, items, places, spells) in your
client's language for every source. RestedXP also ships translated guides
(German, Spanish, French, Brazilian Portuguese, Chinese): their text goes into
the addon as a language addon beside it (`<addon>_zhCN`), which Polestar loads
on a client in that language. The page adds the language picked on it, the
command line every one RestedXP ships (`--locales zhCN,deDE` for some).
Journey's and Zygor's own words stay English. More in
[docs/translations.md](docs/translations.md).

## Known gaps

- **Step numbers** count every class's steps ("3 / 72"); RestedXP counts only
  yours. A Polestar change.
- **Some conditions have no Polestar form** (Zygor's buffs, reputation and
  `equipped` checks; RestedXP's `#requires` and bank contents). The step is kept without
  the condition, and the report names it.
- **A step with no title** shows its first goal as its heading, so a one-task
  step reads twice.
- **Riding** is no profession in Polestar and is ignored.
- **After a guide abandons a quest you already worked on**, Polestar 0.3.0 can send you back
  to that quest's earlier step. Skip it. A fix is proposed to Polestar.
- **Elite quests** stay in the route as RestedXP and Zygor show them, with a
  tip to group up. Skip the step to leave one.

The full lists: [RestedXP](docs/rxp.md#known-gaps),
[Journey](docs/journey/polestar-gaps.md), [Zygor](docs/zygor/polestar-gaps.md).

## FAQ

**Is this official?**
No. It is a community tool, not made or supported by RestedXP, Journey, Zygor
or Polestar.

**Can I share the converted pack?**
Only where the guide's licence allows it. The guides are their authors' work:
this tool exists so you can play guides you have the right to use with
Polestar.

**Does it send anything anywhere?**
No guide content leaves your machine, on the command line or in the browser:
the page reads the folder you pick inside the browser, and both only download
the game data and Polestar's compiler from this project's site (the command
line keeps them in its cache).

**A step is skipped, doubled or missing. Is that a bug?**
Look at the run's report and the pack's `reports/` first: many differences are
deliberate (above). If it is still wrong, open an
[issue](https://github.com/aronjanosch/polestar-convert/issues) with the
guide's name, the step and what the original does.

**Do I need Node, Git or a Polestar clone?**
No: the [browser page](https://aronjanosch.github.io/polestar-convert/) gives
the finished addon. The command line needs Node only. Polestar itself must be
in the game's AddOns folder.

## Documentation

| Page | What it covers |
|---|---|
| [docs/rxp.md](docs/rxp.md) | How RestedXP's lines become Polestar goals, and RestedXP's known gaps |
| [docs/zygor.md](docs/zygor.md) | How Zygor's steps become Polestar steps |
| [docs/journey/](docs/journey/format.md) | Journey's format, the converter's workarounds, what Polestar lacks |
| [docs/translations.md](docs/translations.md) | RestedXP's translated guides in the pack |
| [docs/web.md](docs/web.md) | The browser page: how it works, its game data, publishing it |
| [docs/development.md](docs/development.md) | Code layout, tests, checking a pack, adding a source |
| [CHANGELOG.md](CHANGELOG.md) | What each release brings |

## Licence

The converter is [MIT](LICENSE) and contains no guide content; the guides you
convert keep their own licence. Its compiler (`wasm/`) is Polestar's,
`forge-guide`, built to WebAssembly, and is GPL-3.0 like Polestar. The game
data the page and the command line load is a copy of Polestar's data build
without values taken from websites, published under GPLv3 because it holds
QuestieDB facts ([notice](https://aronjanosch.github.io/polestar-convert/polestar-data/NOTICE.md)). RestedXP, Journey, Zygor
and Polestar are named to say what the tool reads and writes; no trademark
rights are claimed.
