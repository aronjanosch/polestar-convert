# RestedXP: how the converter reads it

What the `rxp` adapter (`src/rxp/`) does with RestedXP's guide lines, and where
the result differs from playing the guide in RXP. Usage is in the
[README](../README.md#quick-start); RXP's translated guides in
[translations.md](translations.md).

## Rules

- Ids, names and coordinates come from Polestar's data, never from memory. What
  the data does not know is quoted by name and listed in the report.
- RXP world coordinates (`1420/0,X,Y`) become zone percentages through the map
  frames in `data/forever/map-frames.json`; a `.goto 1429,X,Y` is a point on
  that map.
- Commands Polestar has no verb for (`.deathskip`, `.equip`, a `.cast` of a
  spell no RXP line names, ...) become `task` lines. These, and the goals and
  conditions below, need Polestar 0.3.0 (pack format 5).

### Conditions

Read as RXP's own `applies()` (GuideLoader.lua) reads them:

- `/` splits a condition into groups, one of which must hold; inside a group,
  words separated by a space must all hold; `!` negates a word. `Rogue/Warrior
  Dwarf` is Rogues, or Dwarf Warriors. A race names its side too.
- A word RXP does not know as true is false: `skip` (RXP's off switch), other
  game versions and seasons (`sod`, `som`, `era`, ...) and typos. A step or line
  under such a word is left out, as RXP leaves it out; `!sod` holds. Unknown
  words are listed in the report.
- `--` starts a comment, cut before anything is read. On a tag line
  (`#completewith X << Rogue`) the `<<` limits only that tag, not the step:
  the step splits into the characters the tag holds for (beside the route) and
  the rest (an ordinary step). So do `#label` and `#optional` with a `<<`.
- In Polestar, names of one kind OR together and the kinds AND, so negations
  cannot be chained: RXP's `!Warlock !Mage` becomes the list of the other
  classes. A condition that mixes kinds (`Rogue/Warrior Dwarf`) splits the
  step into one step per group; a step with a label is not split and shows to
  a few more characters (`inexact condition` in the report).
- The guide's header `<< Horde Undead` limits the guide to those races, of its
  own side. `#defaultfor` only picks which guide RXP offers first and limits
  nothing: every character may run the others.
- Steps and goals for races the guide is not for are left out (RXP's "You have
  selected a guide meant for Undead" in an Undead guide), and goals for quests
  the data closes to the guide's races.

### Goals

- Quest objectives are matched **by name**: RXP and Polestar number a quest's
  objectives differently. When no name fits, RXP's number, if the data has that
  objective, else the whole quest.
- **Trainers:** a `.train`/`.trainer` line goes to a trainer of the line's class,
  chosen by role and by the `.target` beside the line (not the Warrior trainer
  for a Shaman). One `.trainer` beside a `.target` per class trains each class
  at its own. Professions (`.train 2575`, `[Mining]` in the text) are
  `train <Profession>`; `.train <id>,1|3` without text is RXP's "knows the
  profession" check, `when skill`. Pet spells learned by fighting are a note,
  mount trainers are left out. Polestar has no Horde Paladin trainer: a task.
- **Buying:** `.vendor <id>` with a buy text is a `buy` at that vendor; RXP's
  text names the vendor otherwise. A buy that names a made item (Runed Copper
  Rod) buys what it is made from (Copper Rod); a buy without a vendor (the
  auction house) is a `collect`.
- `.fly` and `.fp` find their flight point by the start of a zone's or point's
  name (Redridge, Stonetalon) and by the line's text. A hearth or home named by
  zone takes an inn of the guide's side, the bound one first.
- `.xp N` and `.xp N.F` are level goals; the skip form (`.xp <N`, `.xp L-N`) is
  `when level`. A grind step keeps RXP's last point as the place to go.
- `.abandon`, `.destroy` and `.cast` are Polestar's `abandon`, `destroy` and
  `cast` goals, which check themselves. A spell's name comes from RXP's lines
  that cast it (`[Teleport: Moonglade]`). `.usespell` is a button in RXP that
  never holds the step: an optional `cast`, or left out without a name.
- `.skill cooking,50,1` (RXP skips the step from rank 50 on) is
  `when !skill Cooking 50`; `<50` is `when skill Cooking 50`.
- `.money <0.1` (RXP skips the step while the character has less) is
  `when money>=1000`; `>N` is `when money<N`, in copper.
- `.cooldown item,6948,>0` (skipped while the Hearthstone cools down) is
  `when !cooldown item 6948`, `<0` is `when cooldown`. RXP counts at least
  2 seconds; longer thresholds (`<600`) have no Polestar form and stay out.
- `.zone Ironforge` in a travel step is `enter "Ironforge"` at RXP's last point:
  done on entering the zone, as in RXP. Beside the route (`#completewith`) it
  stays a way into the next step. `.subzone 254` names the area by its
  AreaTable id (the Forever client's table that `data build` caches) and is
  `enter "Blackrock Mountain"` the same way; its flags 1 (done once out of it)
  and 2 (dungeons only) have no Polestar form.
- `.subzoneskip 254` (RXP passes the step while the player is there) is
  `when !subzone "Blackrock Mountain"`, flag 1 `when subzone`; an area that is
  a zone reads as `when !zone`. A top area Polestar knows no zone for (Deeprun
  Tram) and flag 2 stay out.
- `.stable`, `.equip`, `.deathskip` and the bank commands have no Polestar goal:
  tasks to tick, with RXP's text.

### Quests the guide may not hold

- A goal for a quest this guide has not taken yet (taken in an earlier guide,
  in a step with a condition, or one whose prerequisite the guide never takes)
  goes in a step of its own with `when onquest <quest>`: one step per quest, in
  RXP's order, so a player without it is not held. RXP does the same by
  skipping goals of quests not in the log.
- `.turnin -Q` and `.complete -Q` (RXP's optional form, shown only while Q is
  in the log) are optional goals, and wait for the quest unless this guide
  takes it.
- A dungeon detour (`.dungeon X`, `when dungeon`) works quests its dungeon
  guide hands out: unless this guide takes them, they wait for the quest.
- `.group` on a step about one quest is `when group <quest>`: Polestar asks
  once per quest, or takes the player's "Group quests" option. RXP marks every
  step of a group quest so, the accept included, and a quest not taken takes its
  later goals with it. On a step about several quests, taking and handing in
  hold and the group work is optional.

### Guides

- RXP's `#next A; B << !Hunter` is read as RXP picks: the first line that holds
  for a character, and on it the first guide open to them. It becomes
  `next A, B` when the guides named are, together, for every character of this
  one: Polestar offers each character the options whose guide is for them (a
  Hunter route only to Hunters). A guide for some characters alone would send
  everyone there, so it is left out.
- `#include` takes the included guide's steps (or a labelled part of them).
  `--list` reads RXP's own guide list, so chains across files resolve.

## How it differs from RestedXP

The route, quests and text are RXP's; how a step runs is Polestar's. The rule:
a step RXP shows holds in Polestar until it is done, ticked or skipped.
Nothing passes unseen.

RXP shows a `#completewith X` step beside the steps after it and closes it
when X is done. Polestar's `along` is passed over at once, lists only goals
(never notes) under *Along the way*, and `along until X` ends when the route
*reaches* X. So the converter sorts RXP's step by what it holds. The rule
comes from a catalog of all N text-only steps and some read by hand:

| RXP step holds | Polestar | Example |
|---|---|---|
| text + a farming signal (`.mob`, `.money`, `.itemcount <N`, an `.xp` target) | a step of its own: `task` to tick, `@` the middle of RXP's points | "Loot until 50 copper" |
| text + arrow points only (no `,0`) | the way into the next step; the text a `note` there | "Enter the cave" |
| text alone | `task` under *Along the way* up to and through X | "Save up your Linen Cloth" |
| countable goals (kill, collect, objectives, buys; a `.use` beside them is their tool) | `along` up to and through X | kills beside the next step |
| goals that check themselves (fly, hearth, vendor, use, cast, destroy, abandon) | a step that holds | "Destroy the Hearthstone" |

- **Up to and through X:** the label goes on the step after X (`<label>-end`,
  `stepN-end` for `#completewith next`). A target step that is left out hands
  its label to the next step written; one split per quest keeps it on its last
  part. A label no step defines never ends the step in RXP: a bare `along`.
  A `#completewith` step split per quest keeps its `along` in each part.
- **Waypoints:** points without an arrow (`,0`) and the points of a step that
  farms or fights are rounds, not ways, and are left out; Polestar finds the
  spots itself (*Next spot*). Only a step that is just a walk (text and points)
  hands its points on as the way into the next step:
  - a step with a goal of its own (a vendor, a hand-in, a task) keeps them: its
    goal's arrow leads there;
  - a travel step (hearth, flight, death skip, teleport, boat) carries none, and
    neither does any such step passing beside the route: the way never hops
    over a step;
  - a point on a class's line goes only into steps for that class;
  - points on another map from further back are dropped: only the step right
    before leads out of a city;
  - of the way, a goal with a place of its own keeps the last point and those
    on another map (leaving a city); one without a place (`fly`, `sethome`)
    keeps every point. Repeated points go.
- **No place in the data:** a goal the data cannot place points where RXP's
  `.goto` sends the player, or RXP's last point before it. Not on a dungeon
  detour or a dungeon quest's goal: the last point is outside, the work inside.
- **A step whose goals are all optional** (elite, `#optional`, training) keeps
  them required, since Polestar passes such a step at once. Polestar's lint
  suggests `when group <quest>` for elite work instead. Skip it to leave it.
  An optional turn-in stays optional, and a step of optional waypoints alone
  still passes. An `#optional` turn-in that waits for its quest to be complete
  (`.isQuestComplete`) holds: `when complete` already says "if you finished
  it", and passing it would leave the quest to the guide's later `.abandon`.
- **The play style is fixed:** not self-found (`#ah` kept, `#ssf` dropped),
  softcore, 1× XP, Season 0, phase 6. Group steps are kept: the player
  chooses them in Polestar (`when group`).

## Known gaps

- Step numbers count every class's steps ("3 / 72"); RXP counts only yours.
  A Polestar change, not the converter's.
- A `goto` radius is the arrival radius only; Polestar draws no area. A text
  step gets one point, not a circle.
- A step with no title shows its first goal as the heading, so a one-task step
  reads twice. RXP has no titles to give it.
- `#include`s that name guides outside the list are left out.
- `.cast` of a spell no RXP line names stays a task (`.cast 6477`, clicking an
  object).
- Riding (`.skill riding`) is no profession in Polestar: ignored.
- `#requires X` is not carried over: RXP holds the step while X is
  still shown beside the route; Polestar's `when done X` would pass it by
  instead, and drop it whenever X was skipped.
- A tag with its own condition on a step that also carries an unconditioned
  `#label` is read for every character, so the label is not written
  twice.
- `.bankdeposit`/`.bankwithdraw` stay tasks: RXP checks the bank, which
  Polestar cannot see. `.isQuestAvailable a,b` (any of them) is left out:
  Polestar's `when available` takes one quest.
- After a `.abandon`, Polestar 0.3.0 sends the route back to that quest's work
  done before it. Skip the step. Fixed in Polestar by
  "Abandon: the quest work before it stays done" (proposed upstream).
- A collect of an item a summoned enemy drops can stop Polestar's `playtest`:
  the simulator does not put the item in the bags, so RXP's "abandon it if you
  do not have it" step fires. In the game the item is there and the step passes.

## Checking a change

`node tools/compare.mjs <base ref> --list <RXPGuides/Guides/GuideList-forever.xml>`
converts every guide with the base and with the working tree and prints what
changed: line kinds, the converter's counts and lint findings before -> after,
and the guides whose text changed, with the diff in its output folder.

## Against petllama/rxp-free-guides

petllama writes RXP's text beside the route as `along` notes, which Polestar
never lists, and splits class variants into one step per class, so the same
text appears several times. Here the text is a task in one step, with `only`
per line.
