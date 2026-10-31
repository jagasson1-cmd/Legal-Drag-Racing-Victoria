# Legal Drag Racing Victoria — Claude Development Guide

This file defines the standing instructions for Claude when working in this repository. Read it completely before inspecting, planning, or changing the project.

## Project purpose

Legal Drag Racing Victoria is an Australian street-to-strip drag-racing game about learning, experimentation, engineering decisions, vehicle development, racing, and long-term progression.

The player should succeed by understanding the car and making informed choices—not merely by purchasing more horsepower, waiting for timers, or repeating the same activity indefinitely. The game should feel grounded in Victorian car culture and populated motorsport events while remaining approachable and enjoyable.

## Authority and collaboration

The user is the game director and has final authority over design, scope, and release decisions.

Claude may:

- inspect and explain the existing implementation;
- identify risks, bugs, exploits, dead ends, dominant strategies, and unclear behaviour;
- assess the game's visual language, hierarchy, usability, atmosphere, responsiveness, and level of polish;
- develop justified visual directions, mock-ups, prototypes, and incremental presentation improvements;
- suggest alternatives and explain their trade-offs;
- implement an approved, well-defined task;
- add or improve tests that protect intended behaviour.

Claude is encouraged to question existing decisions—including decisions made early in the project—when there is a clear, evidence-based reason. Established decisions are design constraints to understand, not ideas that must be defended regardless of the result. However, Claude must not silently redesign the game. If a proposed change affects the game's identity, visual direction, progression, balance, the meaning of Respect, vehicle identity, event structure, player rewards, or another design principle, present the reasoning and obtain approval before treating the proposal as the new direction.

Treat task specifications, repository code, tests, and this file as a hierarchy of evidence—not permission to invent missing product decisions. When requirements conflict or remain materially ambiguous, explain the conflict and ask for a decision.

## Design philosophy

Preserve these principles unless the assigned task explicitly changes one:

- Engineering decisions should matter more than simply buying horsepower.
- Tuning, setup, component choices, and driver execution should produce understandable consequences.
- Feedback should teach the player what happened and help them form a better hypothesis for the next run.
- Watching races, scouting opponents, and participating in side activity should remain meaningful.
- Events should feel populated and connected to a broader racing scene.
- Respect represents experience, reputation, and standing—not merely another currency or generic XP total.
- Progression should reward learning and increasingly serious builds without erasing the value of earlier cars or events.
- Avoid forced waiting, energy systems, daily-login pressure, unlimited repetitive grinding, and arbitrary progress gates.
- Do not introduce loot boxes, gambling-style mechanics, manipulative engagement systems, or monetisation-shaped design.
- Prefer credible vehicle behaviour and coherent engineering relationships over spectacle that contradicts the simulation.
- Do not replace established Australian/Victorian character with generic racing-game language or systems.

When asked to critique a design, challenge it constructively. Identify exploits and consequences, but distinguish clearly between observations, recommendations, and approved requirements.

## Visual design, atmosphere, and polish

Claude may act as both a visual-design critic and an implementation partner. The objective is not decoration for its own sake; it is a game that feels coherent, distinctive, readable, responsive, and satisfying while retaining its Australian/Victorian street-to-strip identity and engineering focus.

Visual work should support:

- a clear hierarchy that makes the next meaningful action easy to understand;
- strong legibility of vehicle, tuning, telemetry, event, and race information;
- a credible motorsport atmosphere rather than a generic mobile-game appearance;
- visual feedback that helps the player connect engineering decisions to outcomes;
- a sense of place appropriate to Victorian drag-racing culture;
- consistency across typography, spacing, colour, controls, panels, icons, data displays, and motion;
- responsive behaviour across the screen sizes the project supports;
- accessible contrast, readable type, visible focus, and reduced-motion considerations;
- deliberate hover, focus, active, selected, disabled, loading, empty, success, warning, and error states;
- performance appropriate to the current architecture and deployment model.

Avoid visual trends that conflict with the game merely because they are fashionable. Do not turn the interface into a generic neon racing dashboard, casino-like reward screen, dense technical console, or glossy mobile storefront unless that direction is explicitly chosen. Atmosphere must not obscure information or make routine interactions slower.

### Questioning established visual decisions

Claude is welcome to challenge an existing visual choice when the criticism is justified. A proposal should explain:

1. What the current design is trying to achieve.
2. What specific problem has been observed.
3. Whether the problem concerns usability, accessibility, coherence, atmosphere, responsiveness, performance, or subjective taste.
4. What evidence supports the criticism—for example, an inconsistent pattern, cramped viewport, poor contrast, unclear hierarchy, excessive interaction cost, or conflict with another screen.
5. Which original principle would be preserved, reinterpreted, or intentionally changed.
6. The proposed alternative and at least one credible trade-off.
7. The smallest reversible way to test the idea.

Do not present personal preference as an objective usability finding. When multiple directions are reasonable, show distinct options and recommend one with reasons rather than blending them into an unfocused compromise.

### Visual exploration workflow

For a significant visual change, use this sequence unless the task explicitly authorises direct implementation:

1. Audit the current screen in context, including its states and supported viewport sizes.
2. Identify what should remain recognisable and what may change.
3. Define the design goals and constraints in plain language.
4. Present a small number of meaningfully different directions or a focused prototype.
5. Explain the recommendation and its trade-offs.
6. Obtain approval for the direction.
7. Implement it in a focused branch without changing game rules or data contracts.
8. Compare the rendered result against the approved direction and test interaction states.

Prefer reusable design tokens and established component patterns over isolated one-off styling, but do not begin a sweeping design-system refactor unless approved. Introduce shared foundations incrementally when the current task demonstrates their value.

### Separation from game logic

Visual redesign does not authorise changes to physics, balance, rewards, eligibility, progression, save data, or permanent IDs. If a better presentation appears to require a rules change, separate the proposals and seek approval for each.

Never fabricate telemetry or engineering meaning to make a screen look richer. Use real game data, label illustrative mock-up values clearly, and preserve the distinction between decorative feedback and measured race information.

## Current architecture and change discipline

The game is currently highly interconnected and is implemented primarily in a large `index.html`. Racing physics, vehicle definitions, upgrades, ownership, garage state, saves, cloud saves, opponents, events, You Yangs activities, Respect, achievements, market records, and user-interface behaviour may share data or assumptions.

Therefore:

- Make the smallest coherent change that satisfies the approved task.
- Do not perform broad refactors, file splits, framework migrations, mass renames, formatting sweeps, dependency changes, or unrelated cleanup unless explicitly requested.
- Do not rewrite working code merely to match a preferred style.
- Reuse established helpers, data shapes, naming conventions, and rendering patterns where practical.
- Trace both writers and readers of any state before changing its shape or meaning.
- Treat duplicated-looking logic as potentially intentional until its call sites and behavioural differences have been inspected.
- Keep physics changes separate from presentation or reporting changes whenever possible.
- Do not change balance values, prices, probabilities, eligibility rules, or physics constants as incidental cleanup.
- Preserve offline/local operation and current deployment assumptions unless the task says otherwise.

If a broader refactor appears necessary, stop after investigation and propose it separately. Include the reason, affected systems, migration risk, test strategy, and a smaller alternative.

## Inspect before editing

For every task, inspect the relevant implementation before making changes. Do not guess from filenames or from a partial snippet.

At minimum:

1. Read this file and the full task or issue.
2. Check repository status, current branch, recent relevant history, and repository-specific instructions.
3. Locate the definitions, call sites, state writers, state readers, renderers, persistence paths, and tests related to the task.
4. Identify coupling to racing physics, vehicles, upgrades, garage ownership, market records, opponents, events, achievements, Respect, local saves, and cloud saves.
5. Determine whether permanent identifiers or persisted data are involved.
6. State the intended scope, affected systems, compatibility risks, assumptions, and proposed verification.
7. If the task requests investigation or planning only, do not edit code.
8. If approval is required by the task, wait for it before implementation.

Do not claim that a system is isolated until searches and call-site inspection support that conclusion.

## Save compatibility is a release requirement

Existing player saves are durable user data. A new build must load existing valid saves without losing ownership, progression, records, upgrades, achievements, settings, or the active vehicle.

Do not casually rename, remove, repurpose, reorder, or change the type or meaning of persisted fields. This includes, but is not limited to:

- save keys and storage keys;
- save schema or version fields;
- owned-vehicle structures;
- `activeCarId` and equivalent references;
- market vehicle UIDs and market records;
- upgrade IDs, slots, levels, and references;
- event completion and record data;
- achievement and badge IDs;
- Respect and progression fields;
- settings and feature flags;
- local-save and cloud-save payloads or contracts.

New fields should normally have safe defaults when absent. Loading code must tolerate an older valid save that does not contain newly introduced data.

Never “solve” compatibility by wiping, replacing, or silently normalising a save. Do not discard unknown fields unless an approved migration explicitly requires it.

Any intentional schema change requires an explicit migration plan containing:

- the old and new shapes;
- a schema-version strategy;
- a deterministic, idempotent migration;
- safe defaults for missing data;
- handling for malformed or partially migrated data;
- local/cloud reconciliation implications;
- representative legacy-save fixtures;
- rollback or recovery considerations;
- tests proving that old saves retain their meaning.

If compatibility cannot be preserved, stop and obtain explicit approval before implementation.

## Permanent identifier stability

Identifiers are contracts, not labels. Once released or written to a save, they are permanent.

Do not rename, delete, recycle, or change the meaning of:

- vehicle/car IDs;
- event IDs;
- badge or achievement IDs;
- upgrade and component IDs;
- opponent IDs when persisted or referenced externally;
- market vehicle UIDs;
- save and storage keys;
- any identifier used by records, ownership, unlocks, telemetry, or cloud data.

Display names and descriptions may change when requested; stable IDs should not. If an entity is retired, preserve compatibility through deprecation, aliasing, or an approved migration rather than reusing its ID.

Before adding an ID:

1. Search the entire repository for existing and historical uses.
2. Follow the established format and casing.
3. Confirm that it is unique.
4. Add tests for lookup and persistence where relevant.

Car IDs are permanent and lowercase unless the repository establishes a stricter convention. Do not derive persistent identity from array position, display text, price, or another mutable property.

## Vehicle and event data

Vehicle behaviour may be distributed across `CARS`, `TECH_DATA`, optional `STALL_RPM`, upgrade data, physics logic, opponent selection, market logic, and display code. Inspect all relevant sources before adding or changing a vehicle.

Preserve established invariants, including the current rule that cars priced at `$34,000` or above are excluded from ordinary opponent selection unless a task explicitly changes that rule.

When changing vehicle data, verify as applicable:

- stable and unique ID;
- matching technical-data references;
- optional stall-RPM behaviour;
- price and progression placement;
- dealership, garage, market, and opponent-selection behaviour;
- upgrade compatibility;
- default state and ownership behaviour;
- performance plausibility and absence of invalid numeric results;
- display, search, sorting, and save round-trips.

When changing event data, verify as applicable:

- stable and unique event ID;
- eligibility and unlock conditions;
- opponent pools and vehicle exclusions;
- rewards, Respect, records, achievements, and completion state;
- repeatability and exploit potential;
- rendering and save/cloud round-trips.

Do not tune unrelated vehicles or events to make a new item fit without explicit approval.

## Physics, telemetry, and race outcomes

Physics constants and race calculations are high-risk. Small changes can alter every vehicle, opponent result, record, achievement, and progression path.

- Do not change physics while implementing UI, reporting, copy, or telemetry presentation unless explicitly required.
- Prefer consuming existing telemetry over inventing arbitrary scores or hidden ratings.
- Keep units, time steps, rounding points, and random inputs explicit.
- Do not clamp, round, or “correct” values without tracing downstream effects.
- Any deliberate physics change requires before/after evidence across representative slow, mid-range, and high-performance vehicles.
- Preserve determinism where tests or seeded runs depend on it.

If observed behaviour looks wrong but the task does not authorise a physics change, document the finding separately.

## Implementation rules

- Stay within the approved scope.
- Preserve public and persisted contracts.
- Avoid unrelated formatting changes so the diff remains reviewable.
- Add comments only where they explain non-obvious intent, invariants, or compatibility constraints.
- Do not add a dependency when a clear existing mechanism is sufficient.
- Do not hide errors with broad exception handling or silent fallback behaviour.
- Do not weaken validation or delete tests to make a change pass.
- Never commit secrets, credentials, personal data, generated caches, or machine-specific files.
- Do not alter generated or vendored files unless the repository's documented workflow requires it.

If unrelated defects are discovered, record them for follow-up rather than expanding the current task.

## Testing expectations

Run the narrowest relevant checks during development, then the repository's complete documented test suite before requesting review. If a check cannot be run, say exactly why; do not imply that it passed.

Tests should cover behaviour and contracts, not only implementation details. Depending on the change, include:

- the requested success path;
- boundary and failure cases;
- representative legacy-save loading;
- save/load and local/cloud round-trips;
- permanent-ID lookup and uniqueness;
- vehicle and event eligibility;
- ownership, upgrades, active-car selection, and market references;
- race, telemetry, record, achievement, and Respect side effects;
- UI behaviour at relevant screen sizes and interaction states;
- regression coverage for the bug or risk being addressed.

For balance or physics changes, provide reproducible before/after results using representative vehicles and fixed inputs where possible. For UI changes, inspect the rendered result rather than relying solely on code review.

Visual verification should cover, as relevant:

- the target screen at representative desktop, tablet, and mobile widths;
- default, hover, keyboard-focus, active, selected, disabled, loading, empty, success, warning, and error states;
- long labels, large values, unusual vehicle names, and other realistic content extremes;
- contrast, legibility, keyboard navigation, focus visibility, and reduced motion;
- overflow, clipping, overlap, layout shift, and accidental horizontal scrolling;
- consistency with adjacent screens and established interaction patterns;
- animation smoothness and absence of unnecessary performance cost.

Include before/after screenshots or equivalent rendered evidence in the pull request for a material visual change. Screenshots support review but do not replace interaction testing.

Never report “all tests pass” unless the named commands completed successfully in the current working tree.

## Git, branches, and pull requests

GitHub is the shared source of truth. Work must be traceable, reviewable, and reversible.

- Never develop directly on `main` and never push directly to `main`.
- Use one focused branch per approved task, normally `feature/<short-name>`, `fix/<short-name>`, or `test/<short-name>`.
- Before editing, confirm that the current branch is appropriate and understand any existing uncommitted changes.
- Do not overwrite, discard, or reformat another contributor's work.
- Keep commits focused and messages descriptive.
- Do not mix refactors, balance changes, feature work, and formatting in one pull request.
- Rebase or merge only through the repository's agreed workflow; do not rewrite shared history without explicit instruction.
- Do not merge your own pull request or treat review as optional.

A pull request should state:

- the player-facing and technical purpose;
- the exact scope of the change;
- affected systems and files;
- save, ID, physics, balance, and cloud-compatibility impact;
- tests and manual checks actually performed;
- before/after evidence where useful;
- assumptions, known limitations, and follow-up work;
- anything deliberately left unchanged.

Keep the diff small enough that a reviewer can understand its consequences.

## Stop-and-ask conditions

Stop and request direction before proceeding if:

- requirements conflict or a missing product decision materially changes the outcome;
- the task would alter the core design philosophy;
- a stable ID or persisted field appears to require renaming, deletion, or repurposing;
- an old valid save cannot be preserved without migration or data loss;
- local and cloud-save contracts disagree;
- a requested UI/reporting change appears to require physics or balance changes;
- the smallest safe implementation requires a broad refactor or new dependency;
- tests reveal an unrelated regression that would expand scope;
- the working tree contains overlapping uncommitted work whose ownership is unclear;
- credentials, production access, destructive operations, or history rewriting would be required.

Present the evidence, the smallest safe options, and their trade-offs. Do not choose silently.

## Completion report

At the end of an implementation task, report:

1. What changed and why.
2. Which systems and files were affected.
3. Save, ID, physics, balance, and cloud-compatibility impact.
4. Tests and manual checks run, with their actual results.
5. Assumptions and known limitations.
6. Anything deliberately not changed.
7. Any recommended follow-up, clearly separated from the completed scope.

Do not describe work as complete while required checks are failing or the approved acceptance criteria remain unmet.

## Default operating principle

Investigate broadly enough to understand the consequences; change narrowly enough to preserve the game.
