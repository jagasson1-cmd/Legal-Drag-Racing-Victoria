# Modularisation notes

Branch `refactor/modular-game-foundation`, started from `main` at `55b5307`.

This is a structural refactor only. The game must behave and look exactly as it did at `55b5307`. It prepares later work on music and audio, a larger Melbourne NPC population, opponent and event-lineup generation, opt-in simulated community racers and event presentation. None of those features belong in this branch.

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
- **Out of scope for this branch:** save loading, cloud synchronisation, core race physics, progression calculations, audio, opponent generation, and the driver-name list inside `makeOpponents`.

## Layout

| File | Contains (verbatim from `55b5307`) | Loaded |
|---|---|---|
| `index.html` | Markup, the remaining game script and the startup line | — |

The table grows with each extraction; see the phase log.

## Updating extracted files (release version)

1. Change the extracted CSS or JS file.
2. In `index.html`, change the `?v=` value on **every** extracted `<link>` and `<script>` tag to one new value, such as the next date-based release (`2026.11.01-2`).
3. Run `node tests/helpers/asset-manifest.js --write` to record the version and each file's content hash in `tests/fixtures/asset-version.json`.
4. Run the full test suite.

`tests/qmb-modular-loading.test.js` fails if any extracted file's content no longer matches the manifest, or if the tags carry different versions. So step 2 can't be forgotten silently.

## Golden outputs

| Golden | Covers | Test |
|---|---|---|
| `tests/fixtures/expected/saves.json` | A new game, plus load and re-save of the frozen inputs in `tests/fixtures/saves/`: v1 pre-garage, v2 garage with upgrades and history, Race Night mid-event with reaction data, You Yangs mid-session, You Yangs first journey | `qmb-save-compat` |
| `tests/fixtures/expected/cloud-save.json` | Requests a cloud save makes (captured by a fetch stub, never sent) | `qmb-save-compat` |
| `tests/fixtures/expected/race-baseline.json` | `simulate()` for four cars (player and NPC paths, auto and manual), and `eventProfile`/`makeOpponents`/`pickRaceSlots` for three events, with random-draw counts | `qmb-race-baseline` |

**The input saves are frozen historical snapshots and are never regenerated.** They were built from the game at `55b5307`; the v1 save uses the pre-garage shape from before `GARAGE_SAVE_VERSION`.

**To change a golden on purpose:**
1. Make the reviewed rule change.
2. Run `node tests/helpers/regenerate-goldens.js saves|cloud|race`, naming only the affected golden.
3. Review the diff.
4. Commit the regenerated file separately with the reason.

A golden must never be regenerated to make a refactor pass.

## Verification for every extraction

- **All test files.** Run `node tests/<file>.test.js`, one file at a time.
- **A rebuild check.** Put every extracted file back inline; the result must reproduce `index.html` at `55b5307` byte for byte, apart from the tags.
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
