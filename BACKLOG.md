# WC·26 — Feature backlog & information architecture

_Refreshed at build 65 (2026-06-13). Free/keyless sources only; no backend; no build step for the site itself._

---

## Information architecture — how we grow without clutter

We're going to add a lot. The rule is **grow down (depth), not wide (tabs)**, and push depth into detail sheets and sub-navs so the default of every screen stays scannable.

**Principles**
1. **Top-level tabs stay at 5** — Matches · Teams · Groups · Predict · Stats. A new tab must own a genuinely new *domain*; the default answer is "no new tab."
2. **A tab that accumulates distinct categories gets an in-tab segmented sub-nav** — not more top tabs. (Stats needs this first.)
3. **Per-entity depth lives in detail sheets** — Match sheet (have), Player sheet (have), **Team sheet (to build)**. Lists stay light; one tap reveals depth.
4. **Global preferences consolidate into one Settings sheet** (a gear chip) — not an ever-growing row of topbar chips.
5. **Global navigation = a Search / ⌘K overlay** — jump to any team/player/match from anywhere, instead of cramming entry points into tabs.
6. **Progressive disclosure** — collapsible sections, "see all", modals. Default view shows the 80% case; the rest is a tap away.

**Two foundations unlock most of the backlog cheaply — build these first:**
- **(A) Stats sub-nav** — segmented control: `Players · Teams · Discipline · Records · Tournament`. Every new leaderboard/record then slots into a section instead of lengthening one scroll.
- **(B) Settings sheet** — a gear chip opening a sheet for theme/dark-mode, notifications, music, timezone, lite-mode, calendar-subscribe. Frees the topbar and gives new prefs a home.

**Placement map (where each thing lives)**

| Surface | Owns |
|---|---|
| **Matches** tab / **Match sheet** | schedule + filters; per-match: summary, timeline, lineups, momentum, stats, **H2H**, **venue + weather**, **win-probability**, player profiles |
| **Teams** tab / **Team sheet (new)** | 48 grid + My Team; per-team: **road-to-final**, form, group, fixtures, squad, **rotation/minutes**, **compare** |
| **Groups** tab | standings, qualification outlook, **scenarios/permutations**, **knockout projection** |
| **Predict** tab | predictor, scoring, share, **knockout scenarios** |
| **Stats** tab + **sub-nav (new)** | Players (Boot, **assists**, **keepers**, most-fouled) · Teams (per-match stats, **clean sheets**) · **Discipline** (cards, **suspension watch**) · **Records** (superlatives) · Tournament (pulse, **confederations**) |
| **Settings sheet (new, gear)** | **dark mode**, **notifications**, music, timezone, **lite/data mode**, **calendar subscribe** |
| **Global** | **Search / ⌘K**, refresh-nudge (have), ticker, jump-to-now (have) |

---

## Detailed feature list

Status: ✅ shipped · ⬜ backlog. Effort: S < a session · M ≈ a session · L multi-session. → = where it lives.

### A. Matches & live match detail
- ✅ Live scores (self-relaunching 1-min polling Action)
- ✅ Goal / card / sub **timeline**
- ✅ **Lineups** on a formation pitch (head-cropped official photos)
- ✅ **Match stats** (possession, shots, on-target, corners, fouls) + match-flow **momentum**
- ✅ **Player profiles** — tap any name (timeline / pitch / Boot / squad)
- ⬜ **Venue + weather** — kickoff conditions per match (open-meteo, keyless; city→lat/long static). → Match sheet + small card chip. **M**
- ⬜ **Head-to-head** — recent meetings between the two teams. → Match sheet. **M–L** (needs a history source)
- ⬜ **Live win-probability** — simple heuristic from score + minute + (opt) xG-less shot data. → Match sheet. **M**
- ⬜ **Penalty shootout detail** — kick-by-kick in KO ties. → Match sheet. **S**
- ⬜ **Match of the day** — a featured pick (biggest fixture today). → Matches hero. **S**

### B. Teams
- ✅ 48-team grid, 26-man squads, player profiles, My Team + `.ics` export, team re-theming
- ✅ **Team detail sheet** — tapping a team anywhere (grid, group table, leaderboards, match modal) opens a sheet with overview (conf · group · titles · live position), recent form, every fixture (results + upcoming, each drills into the match), the group standing + qualification outlook, a one-tap **Follow** (re-themes the UI), and the full squad (collapsible). _Forward-projected "road to final" knockout path still open — needs the bracket projection (see Groups → knockout projection)._
- ⬜ **Player comparison** — two players' tournament stats side by side. → Team/Stats. **M**
- ⬜ **Squad rotation / minutes played** — built from `xi` across matches. → Team sheet. **M**
- ⬜ **Subscribe to a team's calendar** (webcal). → Team sheet / Settings. **S**

### C. Groups
- ✅ 12 live tables, "what each team needs" outlook, FLIP reorder animation
- ✅ **Third-place race tracker** — ranks all 12 third-placed teams by FIFA's criteria (pts → GD → GF) with the "top 8 advance" cut line drawn in, since the 48-team format's best-thirds math can't be read off 12 separate tables. → Groups (below the legend). Pure client math, no extra data.
- ⬜ **Qualification scenarios / permutations** — which results send whom through (incl. full third-place permutations). → Groups. **M**
- ⬜ **Knockout projection** — "if the groups ended now, the bracket looks like…". → Groups (or Predict). **M**
- ✅ **Confederation breakdown** — each confederation's combined record (W-D-L) and points-per-game, ranked, in the Stats → Tournament sub-section. Pure client math.

### D. Predict
- ✅ Seeded interactive knockout bracket, thirds allocator, compact share link, champion teaser, **"your call vs reality" scoring**
- ⬜ **Knockout scenarios** — explore alternate bracket outcomes. → Predict. **M**
- ⬜ **Share & compare predictions** — needs a backend for a real leaderboard; local-only "vs a friend's link" otherwise. **L** (likely skip)

### E. Stats & records  _(home: Stats tab + new sub-nav)_
- ✅ Tournament pulse, **Golden Boot**, per-match team stats, yellow/red cards
- ⬜ **Assists / playmakers race**. → Players. **S** (data already aggregated)
- ✅ **Clean sheets** (team shutouts) — leaderboard in the Teams sub-section. _(Per-keeper clean sheets still open — needs GK attribution from `xi`.)_
- ✅ **Suspension watch** — Discipline sub-section flags who's banned next match (red / 2nd yellow) and who's "on a yellow", derived from the card tallies. Note explains FIFA clears single yellows after the QF.
- ✅ **Records & superlatives** — biggest win, highest-scoring match, fastest & latest goals (each taps through to its match/player). → Records sub-section. _Comebacks / longest-unbeaten still open (need lead-change tracking)._
- ⬜ **Most fouled / most minutes / cleanest team** etc. → Players/Teams. **S**

### F. Personalisation, chrome & settings
- ✅ Team theming, timezone picker, jump-to-now, new-version refresh nudge, **installable PWA**
- ✅ **Settings sheet** — gear → consolidated prefs (declutters the topbar)
- ✅ **Dark mode** — system-aware + manual toggle in Settings (no-flash head script)
- ✅ **Sounds** — anthem + a synthesized **goal horn** (opt-in). _More background tracks need audio files (royalty-free); won't add random songs._
- ⬜ **Notifications (while open)** — "kickoff in 5" / "GOAL for your team" via the Notification API (no push backend). → Settings + per-team. **S–M**
- ⬜ **Notifications (while open)** — "kickoff in 5" / "GOAL for your team" via the Notification API (no push backend). → Settings + per-team. **S–M**
- ✅ **Quick search / ⌘K** — a global overlay (search chip + ⌘K/Ctrl-K, or "/") that jumps to any team, player (by name or club) or match (by team/city/stage), relevance-ranked (prefix beats mid-word); each result opens the right sheet.
- ⬜ **Lite / data-saver mode** — skip photos & heavy detail on slow connections. → Settings. **S**

### G. Platform & scale  _(do before knockouts)_
- ⬜ **Split heavy match detail out of `results.json`** — keep the 1-min polled file to scores/status; lazy-load `ev`/`xi`/`stats` per match. **M**
- ⬜ **Offline service worker** — network-first (fresh online, cached offline); must cooperate with the version-nudge so it never serves a stale shell. **M** (risk)
- ⬜ **i18n** — multi-language UI. **L**
- ⬜ **Accessibility deep pass** — full keyboard/SR audit. **M**
- ⬜ **Goal sound / richer celebration**. **S**

---

## Suggested order
1. **Foundation A — Stats sub-nav** (unlocks E with no clutter).
2. **Foundation B — Settings sheet** (unlocks F; declutters the topbar).
3. Quick wins into the new homes: **assists race**, **clean sheets**, **suspension watch** (Stats), **dark mode** (Settings).
4. **Team detail sheet / road-to-final** (the big Teams upgrade).
5. **Records**, **venue+weather**, **search**, then scale (#G).

## Known issues / watch
- **`results.json` growth** — see G; fine now, split before knockouts.
- **Squad ↔ feed name matching** — profiles fuzzy-match squad full names to FIFA short-name photo keys; misses fall back to the flag (graceful).

When adding data fields, update in order: the schema note in `CLAUDE.md`, the writer script, then the renderer.
