# Translations

Polestar shows game names (NPCs, quests, items, places, spells) in the
client's own language for every source. RestedXP also ships translated
guides, and the `rxp` run carries their text into the pack's translations.

The `rxp` run fills the pack's translations. `--locales <all|none|zhCN,deDE,...>`
(default `all`): for each language RXP ships translated guides for (found as `RXPGuides/lang/Guides-<locale>/GuideList-forever.xml`)
the run fills the pack's `locales/<locale>/` files through Polestar's
`i18n guides sync`, then runs `i18n guides check`. `none` turns it off (no sync,
no download).

- The first run per language downloads the client's area, zone and spell names
  in that language from wago.tools (public game data) into the clone's
  git-ignored `data/sources/wago/`. Nothing of the guides is sent.
- Lines that already hold a translation are never changed, so your own
  corrections survive a rerun. That includes the lines the converter filled
  itself: to pick up a newer RXP translation or a converter fix, delete the
  pack's `locales/<locale>/` folder (your own edits there are lost) and run
  again.
- Shown translated: game names (NPCs, quests, items, places, spells) for every
  source, since Polestar shows the client's own names; for RXP also the guide
  words RXP translated. Where a guide's own translation lacks a line (a guide
  file RXP ships no translated copy of, a step it left out, a text it marks
  "NOT TRANSLATED"), the line comes from any other guide RXP translated it in,
  for every game version RXP ships.
- The translated guide is converted by its English words: the inn, vendor,
  trainer, level goal and step titles come out as in the English guide, so each
  translated text lines up with its English one.
- A text that pairs with nothing takes the translation of a text of the same
  shape: "Talk to {npc}" translated once serves every NPC, a name in the plural
  counts as its singular, a list of names ("A, B and C") as one name, and a text
  of several lines or sentences is filled line by line and sentence by sentence.
  A text whose lines are only partly found keeps the rest English; the report
  counts it as "partly translated".
- The converter's own sentences (the elite tip, tasks it writes itself) come
  translated for Chinese.
- Left English: Journey's and Zygor's own words (a sentence they share with RXP
  may come translated), and RXP's words no guide of RXP has translated.
- A new Forever NPC whose name the game has not shown yet appears in English
  inside a translated sentence until the player has seen or targeted it once.
- `reports/rxp-locales.json` in the pack: per language, the texts, how many are
  translated (fully or partly), and the causes for texts left English, with
  examples per guide.
- Compile and install with Polestar (`node ../polestar/tools/polestar.js compile`,
  then `install`, inside the pack); the compiler builds the language's texts
  addon from `locales/`.
