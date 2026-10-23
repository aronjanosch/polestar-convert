# Zygor guides: what Polestar would need

What the Zygor adapter cannot carry into a Polestar `.guide` today. Each wish
is a line Polestar would need to say for the converter to stop dropping or
softening it. Until then the converter keeps the line without the condition,
or drops it, and says so in the pack's `reports/zygor-gaps.json` (per guide and
step).

## Conditions

| Zygor | Polestar wish | today |
|---|---|---|
| `A or B` of predicates (`haveq(x) or completedq(x)`) | an OR of predicates | a copy of the step per alternative, none overlapping |
| `A or B` of a class and a predicate (`Warrior or haveq(x)`) | an OR across `only` and `when` | kept without it |
| `indoors()` without a subzone beside it | `when indoors` | kept without it (with one: the subzone) |
| `discountgold(...)` (price check with the reputation discount) | a reputation predicate | `money>=` the full price |
| `hasbuff(...)`, `\|havebuff X`, `\|nobuff X` | `when buff "<name>"` / `!buff` | kept without it |
| `equipped(id)`, `\|equipped`, `\|unequipped` | `when equipped <item>` | kept without it |
| `\|skillmax P,N` | `when skill` at the maximum for the level | kept without it |
| `\|region X` | `when region` | kept without it |
| `rep(...)` comparisons | `when rep "<Faction>" <Standing>` (the `rep` goal exists, the predicate does not) | kept without it |
| `knowsrecipe(id)` | `when known <spell>` | kept without it |
| other `itemcount` forms | predicates for them | dropped or kept |
| predicate on a text line (`subzone`, `zone`, `has`, `dungeon`) | a conditional `tip` or `note` | the tip shows for everyone |
| predicate on a goal beside other goals of its step | a `when` per goal, not per step | kept without it |

A predicate on a task would hold the step for everyone, so the converter turns
such a task into a tip (Polestar has no conditional tip).

## Jumps and alternatives

| Zygor | Polestar wish | today |
|---|---|---|
| `\|next "label"` to an earlier step | a backward `skipto` (a loop) | dropped |
| `\|next "label"` forward | (has `skipto`: supported) | `skipto`; without a predicate, `when done` on the next step |
| `\|next` on a check Polestar cannot ask (`rep(...) == Exalted`) | the predicate (`when rep`) | dropped |
| `\|next` on several predicates at once (`itemcount(x) == 1 and level >= 10`) | an AND in `skipto` | dropped |
| `\|or` with a check Polestar cannot ask (a standing) | an OR between a goal and a predicate | the check left out, the other ways stay |
| a skill threshold per race (`skill("X") >= ((Gnome and 45) or 30)`) | a `when` per race | the check dropped |
| a menu (`Option \|confirm \|next "label"` per option) | a choice goal: pick one, jump to its label | a step per option: tick one, skip the others |
| `\|or` (an alternative line: either goal) | an OR between goals | both lines kept |
| `turninany Q1,Q2,...` | `turnin any <q1>,<q2>` (hold until any is handed in) | each quest turned in |
| `\|multiq N,M,...` (a click that serves several quests) | several quests on one goal | kept without the list |

## Goals

| Zygor | Polestar wish | today |
|---|---|---|
| `gossip` (`\|gossip N`, "Select ..." lines) | a goal the player checks by picking a gossip option | a tip |
| `\|learnspell` for pet abilities | `learn pet <spell>` | a task |
| `bank` verb and `\|usebank` | a `has` predicate or goal that counts the bank too | tips |
| `\|stablemaster`, `\|learnpetspell` | a pet goal (stable a pet, learn a pet spell) | tips |
| `openskill` (open a profession window) | an `open` goal | tips |
| `\|noautoaccept`, `\|autoacceptany`, `\|delay`, `\|execute`, `\|macro`, `\|autoscript`, `\|forceuse` | none: Zygor automation | ignored |
| `\|confirm XXflag` (dungeon choice) | nothing: Polestar's Options ask it | dropped |
| a gathering route beside `skill P N` (`path` while herbs or ore raise the skill) | `loop` for a skill goal, or a `gather` goal | the route's first point |
| `\|n` (a goal counted but never ticked: a farming guide) | a counter that does not hold | `optional`; the step's `\|confirm` holds it |

## Places and data

| Wish | Why | today |
|---|---|---|
| `@x,y map N` on a `collect` or `kill` goal (a goal's own map) | the lint asks for `zone map` where the data's spot is on another map | the step's zone, when the goto is on that map |
| coordinates for a `collect` or `kill` whose item or mob has no spawn in the data | Zygor's farming points are rounds; the data knows no spot | no `@`: the line's goto when it has one |
| `professions.json` in the clone (the spell names of `learn`) | lint can check learned spells | the explicit name is used |
| `reward` and `why` optional for a generated `Class` chain | lint asks for both for every class guide | `category Class` kept |
