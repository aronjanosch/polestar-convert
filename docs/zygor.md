# Zygor: how the converter reads it

What the `zygor` adapter (`src/zygor/`) does with the Zygor Classic guides in
your install, and where the result differs from playing them in Zygor. What
Polestar would need for each gap: [zygor/polestar-gaps.md](zygor/polestar-gaps.md).
The examples here are made up; no guide text is quoted.

It reads the Classic guide files of each faction under `Guides-Classic/`:
leveling (`Leveling/ZygorLeveling{Horde,Alliance}CLASSIC.lua`), dungeons
(`Dungeons/ZygorDungeon…`), professions (`Professions/ZygorProfessions…`),
reputations (`Reputations/ZygorReputations…`) and events
(`Events/ZygorEvents…`). For a faction whose full file of a family is not
installed it reads the free trial file the viewer ships (`…CLASSICTrial.lua`).
Season of Discovery guides (shown only on that client) and the hidden startup
wizard are left out.

| Zygor folder | Polestar category | Guide menu folder |
|---|---|---|
| Leveling Guides, chapters `(N-M)` | Leveling (Class for class quests) | by level |
| Leveling Guides, other (end-game chains) | Miscellaneous (Reputation for field duty) | Zygor's subfolder |
| Dungeon Guides | Dungeons | Zygor's subfolder |
| Profession Guides | Professions | `Cooking · Farming Guides` |
| Reputation Guides | Reputation | Zygor's subfolder |
| Events Guides | Miscellaneous | `Events` or Zygor's subfolder |

A chapter keeps its slug (`h-invented-vale-1-4`); any other guide names its
family and path (`h-dungeons-invented-hollow-quests`).

Zygor's guide text is the source; the player sees what Zygor shows. A step
Zygor shows holds until it is done, ticked or skipped, and Polestar keeps
that.

- **Lines**: every line is a goal, as in Zygor's parser; a line that opens
  with `'` is one without text of its own (`'|complete …`, `'|accept
  Example##100`), not a continuation of the line above. A `'|goto x,y` under a
  line without a point of its own gives that line its point.
- **Sticky** (`stickystart "X"`): the labelled step's countable goals (kill,
  collect, quest objectives) are copied into an `along until <label>` step
  before the start; with a `stickystop` before the label it ends `along until`
  that step instead. Accepts and turn-ins are never copied; a goal of a quest
  the guide has not accepted before the copy is left out.
- **Talk** to a giver or vendor the same step names is dropped: the accept,
  turn-in or vendor goal places the NPC.
- **`|confirm`** is a `task` at its `|goto`: Zygor holds the player there,
  named by the step's own text rather than Zygor's button label. A dungeon
  choice (`|confirm <Name>flag`) is dropped: Polestar asks in Options.
- **Text with a quest objective** (`Do #3# Things |q 100/1`) is that
  objective's goal, matched by name or Zygor's number.
- **`|or`**: kills on the way beside a way (`|complete subzone(...)`) are
  optional; the way holds the step.
- **Bags**: a `collect` or `buy` for a quest not taken yet (`|future`, bank
  pickups) or of an item no vendor sells (the auction house) is a bag count at
  the line's point, not the objective.
- **Givers the data places nowhere** take the route's last point for the arrow.
- **More goals**: `Abandon … |complete not haveq(Q)` is `abandon Q`; `cast
  Spell##id` is `cast`; `use Item##id` alone in its step is `use`;
  `|complete rep("X") == Friendly` is `rep X Friendly` (`Stormwind City` as
  Polestar names it, `Stormwind`). A guide without a level range in its name
  takes the one its `condition_suggested` names, else its quests'.
- **Text** a line only shows is a tip, written as Zygor shows it (the verb
  kept, the `+` and map links `[Zone/0 x,y]` written out); text for some
  classes or races is a `note` beside the step's goals, or a task alone
  (Polestar tips take no condition).
- **Professions**: a `Train ... |skillmax <Profession>,<N>` line is
  `train <Profession> npc <the trainer the step talks to>`.
- **`turninany Name##a,b,c`** turns in each quest; one the guide does not take
  waits for it in the log.
- **Conditions read as Polestar's:** `walking` is true (Zygor: not on a
  flight; Classic has no flying mount); `subzone("X") and indoors()` is
  `subzone "X"`; `discountgold(f, N)` is `money>=N` (the full price, without
  the Honored discount); `ZGV.IsClassicSoD` is false; `completedallq(a,b)` is
  `turnedin a` and `turnedin b`.
- **An OR of conditions** (`haveq(100) or completedq(100)`) is a copy of the
  step per way it can hold, each with `when` lines no other copy can meet at
  the same time (`when onquest 100`, then `when turnedin 100`). A copy whose
  lines contradict each other is left out.
- **A way line for some places only** (`Leave the cave |goto … |only if
  subzone("Invented Cave")`) is a `goto` step of its own before its step, with
  the condition as its `when`: Zygor shows the line until the player is there.
- **Goal lines under different conditions** in one step (`turnin 100 |only if
  readyq(100)` beside `accept 101`) are one step per condition, in order.
  `itemcount(I) < N` beside a `collect` of N of I says only that the goal is
  not done, and is dropped.
- **Professions:** `|skillmax P,75/150/225/300` is `train P
  Apprentice/Journeyman/Expert/Artisan`; `|skill P,N` is `skill P N`; `|learn
  Recipe##id` is `learn <id>` at the trainer the step talks to. `collect 20
  Example Cloth |or` with `'|complete skill("Tailoring") >= 80 |or` is the
  collect in a step `when !skill Tailoring 80`. A trainer chosen by distance
  (`|only if dist(...) < N`, `|only if default`) is left to Polestar, whose
  `train` and `learn` lead to the nearest one; trainers per race (`talk A
  |only if Human`, `talk B |only if Dwarf`) give a `train` or `learn` per
  trainer, `only` its races.
- **Gathering routes** (`map`, `path x,y …`) are the step's `loop` where it
  collects or kills; beside a goal Polestar cannot search for (a skill to
  reach) the route's first point leads there, and the report says so. A goal
  marked `|n` (counted, never ticked) is optional; the step's `|confirm` holds
  it, named by the step's text.
- **Menus** (`Option A |confirm |next "A"`, `Option B |confirm |next "B"`) are a
  step per option, each a task: tick the one you want and skip the others;
  the step after a ticked option jumps to its label (`skipto A when done
  <option>`). A `|next` without a condition jumps the same way once its step
  is done.
- **Dungeons:** entering one (`|goto <Dungeon>/0 …`, a map Polestar has no
  frame for) is `enter "<Dungeon>"`; a boss with `Click Here to Continue` is a
  task to tick.
- **Conditions** on a step (a line that opens with `|only`, as in Zygor's
  parser) are its `only` and `when`; an `|only` later on a line is that line's
  (`|tip … |only if hardcore` drops the tip, not the step); `|only if` on a
  goal line goes to the step's `when` when all its goals share it. The race of
  a step the guide is not for drops it; `hardcore()` and `selfmade()` drop the
  steps they make impossible. `readyq(Q)` is `complete Q`, and
  `haveq(a) or haveq(b)` is `onquest a,b`.
- **Quests**: a goal for a quest no earlier step accepts, or accepts only under
  a `when` (a dungeon, an item), goes in a step `when onquest <quest>` (along
  copies keep such a quest's goals).
- **Jumps** (`|next "label"`): Zygor jumps once the line is done. Beside a
  `|complete` check it is a `skipto` while the check holds on arrival (one
  line per check: the first that holds decides); a check Polestar cannot ask
  (a standing) drops the jump. On a goal line the step after it jumps: `when
  turnedin Q` after a turn-in, else `when done <this step>`. A jump to the
  next step is no jump; a backward one (a loop) is dropped and gapped.
- **`|or` with a check** (`collect 20 Example Cloth |or`, `'|complete
  skill("Tailoring") >= 80 |or`): the step is for those the check does not
  hold for (`when !skill Tailoring 80`); a check Polestar cannot ask is left
  out, and the other ways to end the step stay.
- **A check on a goal line** (`accept 100 |complete completedq(100)`): the
  goal is for those the check does not hold for (`when !turnedin 100`).
- **Labels** are unique per guide (a repeated one gets `-2`); a label Polestar
  does not name is not written.
- **Waypoints**: the `|goto` points of a fighting or farming line are dropped:
  Polestar finds the spots. A goal the data places nowhere takes its line's
  `goto` as its `@`; a line without a goal leaves its point as the way into the
  next step (kept only when no step goal places itself). A point on another
  map than the step's zone names its map.
- **Conditions Polestar has no form for** (`indoors` without a subzone, an
  `or` of a class and a predicate, buffs, `equipped`, `skillmax`, `region`,
  `rep`, `knowsrecipe`) are kept without the condition and gapped. Each is in
  `reports/zygor-gaps.json` of the pack.

Lint warnings on a converted pack are mostly `collect`/`kill` of targets with
no spawn in the data (Zygor gives no point for them either), spell names of a
clone without `professions.json`, Class guides without `why` and `reward`, and
`subzone` names inside cities the client's tables do not list (the predicate
then compares the English name).
