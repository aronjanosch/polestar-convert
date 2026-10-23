# Changelog

## 0.1.0 (2026-10-23)

The first release, for players on Polestar's `next` branch (Polestar 0.3.0,
guide pack format 5).

- **Three sources into one pack:** RestedXP (every guide of
  `GuideList-forever.xml`, chained by `#next`, with RestedXP's German, Spanish,
  French, Brazilian Portuguese and Chinese texts), Journey (the install's
  catalog, chained by its "next guide" buttons) and Zygor (the Classic leveling
  guides of both factions and the class quest guides).
- **Polestar 0.3.0's goals and conditions:** `abandon`, `destroy`, `cast`,
  `enter`, `task`, `money`; `when group`, `when skill`, `when cooldown`,
  `when money`, `when done`, `when subzone`; `skipto`.
- **Steps beside the route** (RestedXP's `#completewith`, Zygor's sticky steps)
  go to *Along the way* where Polestar can tick them, else a step or task of
  their own.
- **Places by id:** RestedXP's subzones by AreaTable id become `enter` goals and
  `when subzone` conditions.
- **Every run reports** what it dropped, softened or could not place; Journey
  and Zygor also write a gap report into the pack.

Known gaps are listed in the README and per source in `docs/`.
