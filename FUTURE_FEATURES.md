# Future features

## You Yangs Proving Ground Archive — Stage Two

Build on the persistent per-car records introduced in Stage One with a richer nostalgia and comparison view.

- Add challenge-specific horizontal comparison charts.
- Add filters for current garage and former cars.
- Add sorting by Standing Kilometre, High-Speed Run and acceleration milestones.
- Highlight personal bests and record-setting days.
- Add a detailed former-car profile showing the specification snapshot used for each best result.
- Consider a broader Garage History or Nostalgia area only after the You Yangs archive data has proven stable.

Keep charts dependency-free where practical and preserve accessibility with an equivalent comparison table.

## Browser and Multiplayer Security Hardening

Revisit this work if the public user base grows or competitive multiplayer becomes important. A player cannot be prevented from changing code in their own browser, so the long-term goal is to ensure modified client code cannot affect other players, cloud saves, leaderboards or authoritative results.

- Move inline JavaScript and `onclick` handlers into external modules.
- Introduce a strict Content Security Policy without `unsafe-inline` or `unsafe-eval`.
- Replace untrusted `innerHTML` rendering with safe DOM construction or rigorously escaped templates.
- Treat client-submitted money, Respect, upgrades, race results, rewards and elapsed times as untrusted.
- Validate progression and cloud-save changes through server-side rules or authoritative event processing.
- Add ownership enforcement, Row Level Security, rate limiting and replay protection to Supabase APIs.
- Keep privileged credentials server-side; public browser keys must have tightly limited permissions.
- Add automated tests for XSS payloads, malformed saves, impossible progression and forged leaderboard results.
- Consider hosting with configurable security headers if GitHub Pages becomes too restrictive.

Apply this as a planned security migration rather than enabling a strict policy immediately. The current single-file interface depends heavily on inline handlers and dynamic HTML, so an immediate lockdown would break normal gameplay.
