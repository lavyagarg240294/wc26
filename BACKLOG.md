# WC·26 — Feature backlog

_Refreshed at build 63 (2026-06-13). Free/keyless sources only; no backend; no build step for the site itself._

## Shipped so far ✅
Live scores + goal/card/sub **timeline**, **lineups on a formation pitch** (head-cropped official photos), **match stats** + match-flow momentum, **tap-any-player profiles** (timeline / pitch / Golden Boot / squad), group tables + qualification outlook (+ FLIP reorder), **Predict** (seeded interactive knockout bracket, thirds allocator, compact share links, champion teaser), **Stats** (Golden Boot, per-match team stats, yellow/red cards), Teams + 26-man squads + My Team `.ics` export, per-match **share cards**, team re-theming, timezone, music, jump-to-now, and a **new-version refresh nudge** for open tabs. Scores come from a self-relaunching **1-min polling Action** (works around GitHub cron throttling).

---

## Backlog (attack top-down)
Effort: **S** ≈ <1 session · **M** ≈ a session · **L** ≈ multi-session. Tag = data/risk.

### Tier 1 — high value, timely, low risk
1. **PWA — installable** _(S, no deps)_ — web manifest + branded icons + apple-touch-icon so it installs to the home screen and runs standalone. Pairs with the refresh-nudge already shipped. **← doing now**
2. **Prediction scoring — "how your call is doing"** _(M, client only)_ — score the saved prediction against live `results.json`: group-stage spots called right now, and once knockouts start, R32/R16/…/champion hits + "is your champion still alive?". Lives in Predict; rewards the feature we just polished.
3. **Playmakers (assists) race** _(S, existing data)_ — an assists leaderboard beside the Golden Boot (we already aggregate `assists` from `ev`).
4. **Suspension watch** _(S, existing data)_ — from the cards in `ev`, flag players one booking from a ban (2 yellows) heading into a knockout — a genuinely useful, timely angle.

### Tier 2 — engagement & depth
5. **Per-team page / "road to final"** _(M)_ — promote My Team into a full team view: fixtures + form + group position + squad + their highlighted knockout path. Per-team knockout-path highlight is a long-standing idea.
6. **Dark mode** _(S–M, CSS vars)_ — a night theme toggle; the design is already fully tokenised.
7. **Quick search** _(M)_ — a ⌘K-style palette to jump to any team, player, or match.
8. **Venue & weather** _(M, open-meteo — free/keyless)_ — kickoff weather per match card/modal (city → lat/long is static); fetched server-side in the Action so it stays keyless.
9. **Live notifications (while open)** _(S–M)_ — Notification API for "kickoff in 5 min" / "GOAL for your team" while a tab is open (no push backend needed).

### Tier 3 — scale & knockout-timely (before July)
10. **Split heavy match detail out of `results.json`** _(M, refactor)_ — keep the 1-min polled file to scores/status only; lazy-load `ev`/`xi`/`stats` per match on modal open. By the final the combined file is ~150 KB polled by every client.
11. **Offline service worker** _(M, risk: staleness)_ — network-first SW (always fresh online, cached fallback offline). Must cooperate with the version-nudge so it never serves a stale shell. Backlogged deliberately until the caching story is airtight.

### Tier 4 — bigger bets / nice-to-have
12. **i18n** _(L)_ — multi-language UI.
13. **Head-to-head & history** _(M–L, data)_ — recent meetings per fixture; needs a historical source.
14. **Goal alerts / sound + richer celebration** _(S)_.
15. **Accessibility deep pass** _(M)_ — full keyboard/SR audit beyond the current basics.

---

## Known issues / watch
- **`results.json` growth** — see #10; fine now, split before knockouts.
- **Squad ↔ feed name matching** — player profiles fuzzy-match a squad's full name to FIFA short-name photo keys; rare mismatches fall back to the flag (graceful).
- **Golden Glove** was removed (was a bolt-on); clean sheets could return as a *team* stat if wanted.

When adding data fields, update in order: the schema note in `CLAUDE.md`, the writer script, then the renderer.
