# Zygor: how the converter reads it

What the `zygor` adapter (`src/zygor/`) does with the Zygor Classic guides in
your install, and where the result differs from playing them in Zygor. What
Polestar would need for each gap: [zygor/polestar-gaps.md](zygor/polestar-gaps.md).
The examples here are made up; no guide text is quoted.

It reads the Classic leveling file of each faction
(`Guides-Classic/Leveling/ZygorLeveling{Horde,Alliance}CLASSIC.lua`); for a
faction whose file is not installed, the free trial file the viewer ships
(`…CLASSICTrial.lua`, the starting zones).

Zygor's guide text is the source; the player sees what Zygor shows. A step
Zygor shows holds until it is done, ticked or skipped, and Polestar keeps
that.

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
- **Text** a line only shows is a tip, written as Zygor shows it (the verb
  kept, the `+` and map links `[Zone/0 x,y]` written out); text for some
  classes or races is a `note` beside the step's goals, or a task alone
  (Polestar tips take no condition).
- **Professions**: a `Train ... |skillmax <Profession>,<N>` line is
  `train <Profession> npc <the trainer the step talks to>`.
- **`turninany Name##a,b,c`** turns in each quest; one the guide does not take
  waits for it in the log.
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
- **Jumps** (`|next "label"`): a forward jump is a `skipto` (on a goal line it
  jumps once the goal's quest is complete), and a jump to the next step is no
  jump. A backward one is dropped and gapped.
- **Labels** are unique per guide (a repeated one gets `-2`); a label Polestar
  does not name is not written.
- **Waypoints**: the `|goto` points of a fighting or farming line are dropped:
  Polestar finds the spots. A goal the data places nowhere takes its line's
  `goto` as its `@`; a line without a goal leaves its point as the way into the
  next step (kept only when no step goal places itself). A point on another
  map than the step's zone names its map.
- **Conditions Polestar has no form for** (`walking`, `indoors`, an `or`
  across kinds, price checks, buffs, `equipped`, `skillmax`, `region`, `rep`)
  are kept without the condition and gapped. Each is in
  `reports/zygor-gaps.json` of the pack.

Lint warnings on a converted pack are mostly `collect`/`kill` of targets with
no spawn in the data (Zygor gives no point for them either), spell names of a
clone without `professions.json`, and Class guides without `why` and `reward`.
