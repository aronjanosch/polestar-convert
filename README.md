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

Nothing leaves your machine. The converter runs locally, with Node or in
your browser, has no dependencies, and reports everything it dropped, softened or could not place,
so you know what to look at.

## Quick start

You need World of Warcraft: Forever and at least one of the
[supported guide addons](#quick-start) in its `Interface/AddOns` folder.
Converted packs need Polestar 0.3.0: until it is released, play Polestar's
`next` branch, installed from a clone (needs **Node 24+** and **Git**).

**1. Polestar with its game data (once).**

```sh
git clone -b next https://github.com/fitzforge/polestar
cd polestar
node tools/polestar.js data build        # add --questie "<WoW>/Interface/AddOns" if it does not find QuestieDB
node tools/polestar.js profession build  # profession ranks and recipes, for the training steps
node tools/polestar.js install           # puts this Polestar into the game
cd ..
```

**2. Convert your guides.** Either way gives the same pack.

*In your browser:* open **[aronjanosch.github.io/polestar-convert](https://aronjanosch.github.io/polestar-convert/)**,
pick your `Interface/AddOns` folder, tick the RestedXP routes you want and
download the pack as a ZIP. The page reads your guide files in the browser;
nothing is uploaded. Unzip the pack next to the `polestar` folder, then:

```sh
cd my-guides
node ../polestar/tools/polestar.js lint      # checks every guide against the game's data
node ../polestar/tools/polestar.js install   # builds the pack and puts it into the game
```

*Or with one command:* `<WoW>` is your World of Warcraft folder, such as
`C:\Program Files (x86)\World of Warcraft` (the `_forever_` folder in it or its
`Interface/AddOns` work too).

```sh
npx polestar-convert --path "<WoW>" --install
```

Run it in the folder that holds the `polestar` clone, or name the clone with
`--polestar <folder>`.

It finds RestedXP, Journey and Zygor, asks which RestedXP routes you want
(Main, Dungeon, Survival, class; `--routes main` skips the
question), makes the pack `polestar-guides`, converts every guide with
RestedXP's translations, lints and installs it. Leave out `--install` to look
first.

Restart the game completely. Your guides show in Polestar's hub
(`/polestar guides`) under Community guides.

Lint reports warnings (an elite to group up for, a target with no known
spawn); those are expected. Only errors stop `install`.

**No game at hand?** `node ../polestar/tools/polestar.js play` (inside the
pack) opens Polestar in your browser: the real addon with your pack loaded,
against a simulated world. Pick a guide in the hub and click through its steps
as you would in game.

| | Browser | `npx polestar-convert --path` |
|---|---|---|
| Needs | a browser | Node 24+ |
| Game data | Polestar's, hosted with the page ([GPLv3](#licence)) | your own clone's `data build` |
| RestedXP translations | no (English texts, names in your client's language) | yes |
| Lint and install | you run them | done for you |

### One addon at a time

The single commands convert one addon into a pack you made with
`node polestar/tools/polestar.js new my-pack --id my-pack --yes`, with more
options (below):

```sh
npx polestar-convert rxp --list "<WoW>/_forever_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml" --polestar polestar --pack my-pack
npx polestar-convert journey --dir "<WoW>/_forever_/Interface/AddOns/Journey" --polestar polestar --pack my-pack
npx polestar-convert zygor --dir "<WoW>/_forever_/Interface/AddOns/ZygorGuidesViewerClassic" --polestar polestar --pack my-pack
```

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
carries their text into the pack on the command line (`--locales all`, the
default, or `--locales zhCN,deDE`); the browser page leaves them out. Journey's and Zygor's own words stay English. More in
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
- **After a guide abandons a quest you already worked on** (RestedXP drops
  an escort quest in the class route), Polestar 0.3.0 can send you back
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
Only where the guide's licence allows it. The guides are their authors' work,
guides included: this tool exists so you can play what you already own
with Polestar.

**Does it send anything anywhere?**
No guide content leaves your machine, on the command line or in the browser:
the page reads the folder you pick inside the browser and only downloads
Polestar's game data from its own site. With translations on, the first
command-line run per language downloads the client's public place and spell
names from wago.tools.

**A step is skipped, doubled or missing. Is that a bug?**
Look at the run's report and the pack's `reports/` first: many differences are
deliberate (above). If it is still wrong, open an
[issue](https://github.com/aronjanosch/polestar-convert/issues) with the
guide's name, the step and what the original does.

**Is there a version without Node and Git?**
Converting, yes: the [browser page](https://aronjanosch.github.io/polestar-convert/).
Installing the pack still runs Polestar's tools from its clone until Polestar
0.3.0 is released.

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

The converter is [MIT](LICENSE). It contains no guide content and no Polestar
code; the guides you convert keep their own licence. The game data the browser
page loads is a copy of Polestar's data build, published separately under
GPLv3 because it holds QuestieDB facts ([notice](https://aronjanosch.github.io/polestar-convert/polestar-data/NOTICE.md)). RestedXP, Journey, Zygor
and Polestar are named to say what the tool reads and writes; no trademark
rights are claimed.
