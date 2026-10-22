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

---

You like the route of a guide addon you bought or installed, but you want to
play it with Polestar's arrow, quest automation, travel planner and hub.
polestar-convert reads that addon's guide files, writes every step in
Polestar's `.guide` format with ids, names and coordinates from Polestar's own
game data, and leaves you a community pack that Polestar's tools check, play
through in a simulator and install into the game.

Nothing leaves your machine. The converter runs locally with Node, has no
dependencies, and reports everything it dropped, softened or could not place,
so you know what to look at.

## Quick start

You need **Node 24+**, **Git**, World of Warcraft: Forever, and at least one
of the [supported guide addons](#quick-start) in its `Interface/AddOns`
folder.

**1. Get Polestar with its game data, and this converter.** Converted packs
need Polestar 0.3.0: until it is released, take Polestar's `next` branch and
install it into the game from the clone.

```sh
git clone -b next https://github.com/fitzforge/polestar
git clone https://github.com/aronjanosch/polestar-convert
cd polestar
node tools/polestar.js data build    # add --questie "<WoW>/Interface/AddOns" if it does not find QuestieDB
node tools/polestar.js install       # puts this Polestar into the game
cd ..
```

**2. Make a pack and convert your guides into it.** `<WoW>` is your client
folder, such as `C:\Program Files (x86)\World of Warcraft\_forever_`. Run the
line for the addon you have, or several into the same pack:

```sh
node polestar/tools/polestar.js new my-pack --id my-pack --yes

# RestedXP: every guide of the install
node polestar-convert/bin/polestar-convert.mjs rxp --list "<WoW>/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml" --polestar polestar --pack my-pack
# Journey
node polestar-convert/bin/polestar-convert.mjs journey --dir "<WoW>/Interface/AddOns/Journey" --polestar polestar --pack my-pack
# Zygor
node polestar-convert/bin/polestar-convert.mjs zygor --dir "<WoW>/Interface/AddOns/ZygorGuidesViewerClassic" --polestar polestar --pack my-pack
```

**3. Check it and install it.**

```sh
cd my-pack
node ../polestar/tools/polestar.js lint       # checks every guide against the game's data
node ../polestar/tools/polestar.js playtest   # plays every guide to the end (optional, slow)
node ../polestar/tools/polestar.js install    # builds the pack and puts it into the game
```

Restart the game completely. Your guides show in Polestar's hub
(`/polestar guides`) under Community guides.

> [!TIP]
> `--only "<guide name>"` converts a single guide, which is much faster while
> you try things out. Each run prints a report: what was dropped, what became
> a task or a note, and what needs a human look.


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
(German, Spanish, French, Brazilian Portuguese, Chinese), and the `rxp` run
carries their text into the pack (`--locales all`, the default, or
`--locales zhCN,deDE`). Journey's and Zygor's own words stay English. More in
[docs/translations.md](docs/translations.md).

## Known gaps

- **Step numbers** count every class's steps ("3 / 72"); RestedXP counts only
  yours. A Polestar change.
- **Some conditions have no Polestar form** (Zygor's `walking`, `indoors` and
  buffs; RestedXP's `#requires` and bank contents). The step is kept without
  the condition, and the report names it.
- **A step with no title** shows its first goal as its heading, so a one-task
  step reads twice.
- **Riding** is no profession in Polestar and is ignored.

The full lists: [RestedXP](docs/rxp.md#known-gaps),
[Journey](docs/journey/polestar-gaps.md), [Zygor](docs/zygor/polestar-gaps.md).

## FAQ

**Is this official?**
No. It is a community tool, not made or supported by RestedXP, Journey, Zygor
or Polestar.

**Can I share the converted pack?**
Only where the guide's licence allows it. The guides are their authors' work,
guides included: this tool exists so you can play what you already own
with Polestar.

**Does it send anything anywhere?**
No guide content leaves your machine. With translations on, the first run per
language downloads the client's public place and spell names from wago.tools.

**A step is skipped, doubled or missing. Is that a bug?**
Look at the run's report and the pack's `reports/` first: many differences are
deliberate (above). If it is still wrong, open an
[issue](https://github.com/aronjanosch/polestar-convert/issues) with the
guide's name, the step and what the original does.

**Is there a version without Node and Git?**
Not yet. A one-command CLI and a browser version are planned.

## Documentation

| Page | What it covers |
|---|---|
| [docs/rxp.md](docs/rxp.md) | How RestedXP's lines become Polestar goals, and RestedXP's known gaps |
| [docs/zygor.md](docs/zygor.md) | How Zygor's steps become Polestar steps |
| [docs/journey/](docs/journey/format.md) | Journey's format, the converter's workarounds, what Polestar lacks |
| [docs/translations.md](docs/translations.md) | RestedXP's translated guides in the pack |
| [docs/development.md](docs/development.md) | Code layout, tests, checking a pack, adding a source |

## Licence

The converter is [MIT](LICENSE). It contains no guide content and no Polestar
code; the guides you convert keep their own licence. RestedXP, Journey, Zygor
and Polestar are named to say what the tool reads and writes; no trademark
rights are claimed.
