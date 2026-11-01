# Modularisation notes

Phases 0–3 were done on `refactor/modular-game-foundation`, started from `main` at `55b5307` and merged as `60bb698`. Phase 4 is on `refactor/opponent-generation-module`, started from `main` at `9344cc2`.

Every phase is a structural refactor only: the game must behave and look exactly as it did at the commit the phase started from. It prepares later work on music and audio, a larger Melbourne NPC population, opponent and event-lineup generation, opt-in simulated community racers and event presentation. None of those features belong in this branch.

## Approved decisions

Recorded on 2026-11-01 from the game director's review of the read-only inspection.

1. **CSS is split into four files by contiguous range.** The links appear in exactly the same order as the original style block, so the cascade and source order are unchanged. There is no `garage.css` yet: garage rules are interleaved through the base styles, and moving them would reorder the cascade.
2. **The bootstrap stays in `index.html` for now.** The startup line (`refreshListings();loadGame(false);render();…`), the global listeners and initialisation remain inline. Extracting a bootstrap (`js/app.js`) is a later, dedicated change, once the dependency structure is clearer.
3. **One modular release version.** Every extracted `<link>` and `<script>` tag carries the same `?v=` value, so a player can't get a mix of new HTML and stale cached assets. See "Updating extracted files" below.
4. **Golden expected outputs.** Save, cloud and race behaviour is pinned by deterministic goldens: seeded random numbers, a fixed date, a manual clock, recorded timers that never fire, and stubbed network calls. An intentional change to save shapes or race maths requires a separately reviewed regeneration of only the affected golden.

Also decided during the inspection:

- **Classic scripts, not ES modules.** Extracted files are ordinary `<script src>` tags with no `defer` or `async`, placed where the inline script runs today, so timing is identical. ES modules would break:
  - opening `index.html` from a local file (`file://`), which browsers block for modules;
  - the 144 inline `on*` handlers, which call global functions;
  - the 17 load-time wrappers that reassign functions (`show=function…`), because imported bindings are read-only;
  - the code's sloppy-mode semantics, since modules are always strict;
  - the Node `vm` test harness.
- **Nothing is renamed and there's no namespace yet.** Every function and `const`/`let` stays global under its existing name. Classic scripts share one global scope, and no two files declare the same name.
- **Out of scope for the foundation branch (Phases 0–3):** save loading, cloud synchronisation, core race physics, progression calculations, audio and opponent generation. Opponent generation moved in Phase 4, with the driver-name list unchanged inside `makeOpponents`. Save loading, cloud synchronisation, race physics, progression and audio are still inline.

## Layout

| File | Contains (verbatim from `55b5307` `index.html`) | Loaded |
|---|---|---|
| `css/base.css` | Lines 8–94: `:root` tokens, base layout and components, with garage, market, event, onboarding, daily briefing, badges and the responsive rules interleaved | 1st `<link>` in `<head>` |
| `css/you-yangs.css` | Lines 95–117: You Yangs special event (begins with the original blank separator line) | 2nd `<link>` |
| `css/race-night.css` | Lines 118–261: Race Night live race (from `feature/race-night-visual-prototype`) and player reaction time (from `feature/player-reaction-time`) | 3rd `<link>` |
| `css/event-presentation.css` | Lines 262–400: event travel trip card, venue scenes, spectator timing tower and coasting | 4th `<link>` |
| `js/data/vehicles.js` | Lines 457–1352: `CARS`, `TECH_DATA`, `STALL_RPM`, the `CARS.forEach(...)` enrichment line, `ISSUES`, `UPGRADE_PATHS`, `DYNO_TUNE`, `TOYOTA_LEXUS_IDS` | 1st classic `<script src>` |
| `js/data/events.js` | Lines 1507–1514 (`EVENT_CALENDAR`), then lines 1808–1881 (`EVENT_STORIES`), each block unchanged and in that order | 2nd classic `<script src>` |
| `js/data/names.js` | `NPC_GIVEN_NAMES` (180 given names), `NPC_NICKNAMES` (12) and `NPC_NICKNAME_SHARE` (0.12): plain data, added by `feature/population-rework` (not moved from `index.html`) | 3rd classic `<script src>` |
| `js/systems/opponent-generation.js` | From `9344cc2` `index.html`, in source order: `eventProfile` (line 604); `makeOpponents`, `perfIndex` and `pickRaceSlots` (606–617); `visibleClues` (622); `shuffleIndexes` and `buildNpcPairIndexes` (627–628). Plus `pickDriverName`, added by `feature/population-rework`; `makeOpponents` now calls it in place of the old inline name list | 4th classic `<script src>`, immediately before the inline `<script>` |
| `index.html` | Markup, the rest of the game script and the startup line. This includes `platformBrand` and the upgrade helpers; the shared helpers `rand`, `choice` and `makeOwned`; travel and arrival (`travelToEvent`, `finishTravel`); event story text (`hashSeed`, `seededPick`, `eventSeed`, `eventNarrative`, `weatherForEvent`); round management (`chooseRoundOpponent`, `prepareSpectatorRound` and the queue); race-slot display and race records; and everything that reads vehicle or event data | — |

Each CSS file starts with two added lines:
- `@charset "UTF-8";`, because the styles contain a non-ASCII `·`, so the encoding doesn't depend on the server or on `file://`;
- a comment naming its source lines.

Everything below those two lines is the original text, unchanged. **The link order must stay base, you-yangs, race-night, event-presentation.** The cascade depends on source order, and later files override earlier ones; for example, Race Night and event presentation restyle shared classes such as `.treeBulb` and `.laneFill`.

Each JS file starts with one added comment line naming its source lines; everything below it is the original text. The inline script keeps a one-line pointer comment where each block used to be (`events.js` has two, one for each collection; `opponent-generation.js` has four, one for each run of lines).

`opponent-generation.js` holds only top-level function declarations. Like inline function declarations, they become global functions (`window` properties), so every caller and the tests reach them under the same names. The file runs no code when it loads; the functions read `CARS`, `EVENT_CALENDAR`, `state`, `choice`, `rand`, `makeOwned` and `carById` only when called, which happens after startup (travelling to an event, rendering call-ups, starting a round).

**Script order:** `js/data/vehicles.js`, then `js/data/events.js`, then `js/data/names.js`, then `js/systems/opponent-generation.js`, then the inline game script. Classic scripts share one global scope: `const` declarations in the data files are global lexical bindings, not `window` properties, exactly as they were inline. Nothing in the game reads them through `window`, `globalThis` or a dynamic lookup.

**Missing-file risk.** The data files have no fallback copy in `index.html`, by design: a duplicate would drift. If a data file fails to load (an incomplete deploy, a typo in a path, a blocked request), the browser still runs the inline script, which stops with a `ReferenceError` the first time it reads `CARS` or `EVENT_CALENDAR`, so the game doesn't start. If `js/data/names.js` fails to load, the game still starts, but travelling to an event throws a `ReferenceError` (`NPC_NICKNAME_SHARE is not defined`) when the field is generated. If `js/systems/opponent-generation.js` fails to load, the game still starts, but travelling to an event or showing race call-ups throws a `ReferenceError` (for example, `eventProfile is not defined`). Before code was moved out of `index.html`, none of these failures could happen. To guard against it:
- deploy `index.html` and every extracted file together, from one commit;
- keep the shared `?v=` release version, so a cached `index.html` is never paired with a newer or older data file;
- after a deploy, open the live site and check the browser console and network panel for a failed `css/` or `js/` request.

Garage styles have no file of their own yet. They're interleaved through `base.css`, and moving them out would reorder the cascade; that needs its own reviewed change.

## Updating extracted files (release version)

1. Change the extracted CSS or JS file.
2. In `index.html`, change the `?v=` value on **every** extracted `<link>` and `<script>` tag to one new value, such as the next date-based release (`2026.11.01-6`).
3. Run `node tests/helpers/asset-manifest.js --write` to record the version and each file's content hash in `tests/fixtures/asset-version.json`.
4. Run the full test suite.

`tests/qmb-modular-loading.test.js` fails if any extracted file's content no longer matches the manifest, or if the tags carry different versions. So step 2 can't be forgotten silently.

## Golden outputs

| Golden | Covers | Test |
|---|---|---|
| `tests/fixtures/expected/saves.json` | A new game, plus load and re-save of the frozen inputs in `tests/fixtures/saves/`: v1 pre-garage, v2 garage with upgrades and history, Race Night mid-event with reaction data, You Yangs mid-session, You Yangs first journey | `qmb-save-compat` |
| `tests/fixtures/expected/cloud-save.json` | Requests a cloud save makes (captured by a fetch stub, never sent) | `qmb-save-compat` |
| `tests/fixtures/expected/opponent-generation.json` | Driver names produced for fixed rolls; night sizes at every band edge with each event's `fieldMult`, `opponentBoost` and `reqRespect`; complete opponent records for Heathcote, Mildura and The Bend; call-ups with and without a player car, including the 0.88 slower-car boundary; NPC pairing; random-draw counts per stage; travel, arrival, queueing, save and reload | `qmb-opponent-generation` |
| `tests/fixtures/expected/race-baseline.json` | `simulate()` for four cars (player and NPC paths, auto and manual), and `eventProfile`/`makeOpponents`/`pickRaceSlots` for three events, with random-draw counts | `qmb-race-baseline` |

**The input saves are frozen historical snapshots and are never regenerated.** They were built from the game at `55b5307`; the v1 save uses the pre-garage shape from before `GARAGE_SAVE_VERSION`.

**To change a golden on purpose:**
1. Make the reviewed rule change.
2. Run `node tests/helpers/regenerate-goldens.js saves|cloud|race|opponents`, naming only the affected golden.
3. Review the diff.
4. Commit the regenerated file separately with the reason.

A golden must never be regenerated to make a refactor pass.

## Verification for every extraction

The shared test loader (`tests/helpers/game-source.js`) reads every file with LF line endings. Git stores LF, but a Windows checkout with `core.autocrlf=true` presents CRLF, which once made a CSS assertion fail on an unchanged game.


- **All test files.** Run `node tests/<file>.test.js`, one file at a time.
- **A rebuild check.** Put the phase's extracted file back inline; the result must reproduce `index.html` at the phase's starting commit byte for byte, apart from the tags and the bumped `?v=`. Putting every extracted file back must reproduce `55b5307`, apart from intentional changes merged since (so far only the splash image's `?v=2`).
- **`git diff --check`.**
- **A browser check in headless Edge**, over both `file://` and a local static server:
  - no startup errors, and every asset loads;
  - the principal screens at desktop and phone widths, compared pixel for pixel with the baseline;
  - old saves load and re-save.

## Phase log

- **Phase 0 (baseline):**
  - shared test loader `tests/helpers/game-source.js`, so tests follow `<link>`/`<script src>` in document order;
  - deterministic sandbox `tests/helpers/game-context.js`;
  - golden cases and their regeneration script;
  - save-compatibility, race-baseline and modular-loading tests;
  - an empty asset manifest.

  No game files changed.
- **Phase 1 (CSS):** the inline `<style>` (lines 8–400) moved into the four files above, with release version `2026.11.01-1`.
  - **Rebuild check:** putting the four files back inline reproduces `55b5307` `index.html` byte for byte (415,310 bytes).
  - **Rule count:** loaded over HTTP, the four stylesheets hold 196 + 39 + 110 + 117 = 462 rules, the same as the original single sheet.
  - **Screenshots:** 19 screens at 1366 and 390 px, loaded both from `file://` and from a local HTTP server, are byte-identical to the baseline (76 of 76).
    - The 19 screens: new-game start, start line, shed, Trading Post buy and sell, Speed Shop, calendar, trophies, Earn Cash, The Books, Race Journal, Car Club, paused travel, arrival, Race Night hub, race start, spectator stage, You Yangs hub and You Yangs journey.
  - **Startup:** no errors; every stylesheet returns 200.
  - **Test change:** `qmb-core`'s CSS assertions now read the loaded stylesheets instead of the HTML file.
- **Phase 2 (vehicle data):** lines 457–1352 moved verbatim into `js/data/vehicles.js`, release version `2026.11.01-2` on every tag.
  - **Execution order:** the only statements that used to run before the block were three string constants (`QMB_API_URL`, `QMB_PUBLISHABLE_KEY`, `QMB_RECOVERY_STORAGE`); they now run just after it. The block references none of them and calls no game function (only `CARS.forEach` and `Object.assign`), so the reorder can't change a value. The enrichment still completes before any game code runs.
  - **Rebuild check:** putting the file back at its pointer line, and the stylesheets back inline, reproduces `55b5307` `index.html` byte for byte.
  - **Tests:** `qmb-modular-loading` now also checks that `vehicles.js` loads before the inline script, leaves every car enriched on its own, defines no functions and draws no random numbers.
  - **Screenshots:** the same 19 screens, at both widths, over `file://` and HTTP. The first run matched 75 of 76 images. The single mismatch (The Books at 390 px over `file://`, 8 bytes of PNG with the same visible content) appeared to be a capture glitch. A complete rerun matched 76 of 76 images byte for byte.
- **Phase 3 (event data):** `EVENT_CALENDAR` (lines 1507–1514) and `EVENT_STORIES` (lines 1808–1881) moved verbatim into `js/data/events.js`, loaded after `vehicles.js`. Release version `2026.11.01-3` on every tag. The vehicle pointer comment now says "loads before this script", since `events.js` sits between them.
  - **Static data:** both collections are plain object and array literals with string, number and boolean values. They call nothing and read no state, constants, dates, random numbers or browser state.
  - **Initialisation order:** both now exist before any inline code runs. Before the move, any code that ran before them and read them would have thrown a temporal-dead-zone `ReferenceError`; startup never threw, so no such code ran. The only top-level code before them was function reassignments, aliases and `let state=freshState()`; `freshState` and its helpers (`freshBadgeHistory`, `freshDailyBriefing`, `freshGuidance`, `realWeekKey`) never read event data, and no `try` could have hidden a failure. Every read of either collection in the inline script is inside a function body (`eventById`, `eventProfile`, `weatherForEvent`, `eventNarrative`, `finishLiveRace` and others), so none runs at load time.
  - **Rebuild check:** putting both blocks back at their pointer lines (and the vehicle file and stylesheets back inline) reproduces `55b5307` `index.html` byte for byte.
  - **Tests:** `qmb-modular-loading` now checks the exact order (`vehicles.js`, `events.js`, inline), that the event data holds no functions, defines no helpers, draws no random numbers, and keeps the baseline event IDs in order in both collections. Each of these assertions was confirmed by a deliberate mutation.
  - **Screenshots:** the same 19 screens at both widths, over `file://` and HTTP, match the Phase 0 baseline byte for byte (76 of 76).
- **Phase 4 (opponent generation):** seven functions moved verbatim, in source order, from four runs of lines into `js/systems/opponent-generation.js`, loaded after `events.js`: `eventProfile`, `makeOpponents`, `perfIndex`, `pickRaceSlots`, `visibleClues`, `shuffleIndexes` and `buildNpcPairIndexes`. Release version `2026.11.01-4` on every tag. The splash image keeps its own `?v=2`, because it isn't an extracted asset.
  - **Tests first:** `qmb-opponent-generation` and its golden were committed separately, against the unmodified game at `9344cc2`. Twelve deliberate mutations were all caught, both before and after the move:
    - a renamed or reordered driver name;
    - the strip chance, the price cap of the opponent pool, the 0.88 slower-car threshold and a night-size band edge;
    - an extra random draw, or swapped power and grip draws;
    - the pairing order, the `entryId` format, a visible-clue text and a dropped `opponentBoost`.

    The same commit made the test loader read files with LF line endings (see above).
  - **Unchanged behaviour:** the save, cloud, race and opponent goldens all match without regeneration. `qmb-modular-loading` now checks:
    - the four-script order;
    - that the file declares exactly the seven functions and runs no other top-level code;
    - that it draws nothing when loaded;
    - that its functions are global;
    - that none of them is still defined inline.
  - **Lineups in a browser:** with a seeded random-number generator and a fixed date, the Heathcote, Mildura and The Bend lineups produced through the real travel and arrival path are identical to `9344cc2`, over both `file://` and HTTP: draw counts, night sizes, call-ups, drivers and complete opponent records.
  - **Rebuild check:**
    - putting `opponent-generation.js` back at its four pointer lines reproduces `9344cc2` `index.html` byte for byte, apart from the bumped `?v=`;
    - putting every extracted file back reproduces `55b5307` byte for byte, apart from the splash image's `?v=2`.
  - **New baselines:** the rebuild and screenshot baselines were recaptured at `9344cc2`. The approved splash artwork (`9344cc2`) changed `index.html` and the splash image after the Phase 0–3 baselines were taken, so those baselines no longer describe `main`.
  - **Screenshots:** 76 captures against the `9344cc2` baseline.
    - At desktop width (`file://` and HTTP) and at phone width over HTTP, all 57 are byte-identical.
    - At phone width over `file://`, the unmodified `9344cc2` build doesn't capture reproducibly either: across six runs, it produced two variants each of the spectator and Trading Post sell screens.
    - Every variant differs by at most 69 pixels, each off by 1/255 in one colour channel, all in the header and navigation band (y = 75–154 px).
    - Over five runs of the new build, every capture matched a variant seen from `9344cc2`, except one shed capture with the same ±1 difference in that same band.
    - Screen, page height and page width matched in every capture.

## Changes after the split

- **NPC population rework (`feature/population-rework`):** generated opponents get display names from `js/data/names.js`. This replaces the 18-name list that was inside `makeOpponents`.
  - **The pools:**
    - 180 given names: the 17 original given names first, in their original order, then 163 more;
    - 12 nicknames: Davo (the 18th original), Macca, Loz, Kaz, Simmo, Tez, Robbo, Jono, Benno, Tommo, Gazza and Hammo.

    The data carries no ethnicity, gender or other metadata, and no name is linked to a vehicle, performance, venue or progression.
  - **Selection:** `pickDriverName(roll, used)` turns the one existing name draw into a name.
    - Rolls below `NPC_NICKNAME_SHARE` (0.12) pick a nickname; all other rolls pick a given name, in proportion to the roll.
    - A name already in the lineup is skipped by stepping forward through the same pool (wrapping around), then through the other pool from the position the same roll maps to there.
    - A name repeats only when all 192 are used. The largest possible field is 111.
    - It never rerolls, draws no random numbers itself, and doesn't modify `used`; `makeOpponents` records each name.
  - **Unchanged:** the number and order of random draws, vehicles, attributes, entry IDs, UIDs, lineup sizes, call-ups, pairing and performance. A field-by-field comparison of the old and new opponent and race goldens found 397 differing values, all of them `driver` values; the only other change, the arrival opponent hash, re-derives exactly when the old names are put back. Save and cloud goldens are unchanged.
  - **Saved events keep their names:** names are stored on each opponent, and loading never regenerates them. Existing saves keep their original names, including historical duplicates and names that aren't in the new pools.
  - **Goldens:** `opponent-generation.json` and the `driver` fields of `race-baseline.json` were regenerated in a separate commit, with that comparison as the review.
  - **Version:** release version `2026.11.01-5` on every tag.
