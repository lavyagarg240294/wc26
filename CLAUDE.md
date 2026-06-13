# CLAUDE.md — WC·26 World Cup 2026 Companion

Orientation for Claude Code. Read this first, then `README.md` for deploy/secrets.

## What this is
A static, no-build fan site for the FIFA World Cup 2026 (June 11 – July 19): all 104 matches in the visitor's timezone, a favorite team that re-themes the whole UI, live group tables, a full predictor with an interactive knockout bracket (tap winners to crown a champion), and squad/lineup data. Hosted free on GitHub Pages (or Vercel). Data is refreshed by GitHub Actions that commit JSON into the repo — the browser never calls a sports API directly, so no keys are ever exposed client-side.

## Hard rules (do not break these)
- **No build step, no framework, no bundler.** Plain `index.html` + `styles.css` + `app.js` (one vanilla IIFE). Keep it that way unless explicitly asked to migrate.
- **Never put API keys in client code.** Keys live only in GitHub Actions secrets (`FOOTBALL_DATA_TOKEN`, `API_FOOTBALL_KEY`). The site reads committed JSON from `data/`.
- **No `localStorage` misuse for app data that must be shared** — per-visitor prefs (favorite team, timezone, saved prediction) intentionally use `localStorage`; tournament data must come from `data/*.json`.
- **All kickoff times are stored in UTC** in `matches.json` and converted at render time via `Intl.DateTimeFormat`. Never hardcode a local time.
- Preserve the design system (see Tokens). Accent color is driven by CSS variable `--acc1` and recolors to the favorite team's kit.

## File map
- `index.html` — shell: header chips (search, settings-gear, team), tab nav (Matches / Teams / Groups / Predict / Stats — scrollable on mobile, active tab auto-centres), ticker strip, dialogs, confetti canvas, jump-to-now button. Views are `#view-<name>` sections; `RENDER[name]` maps each to its renderer. (There's no standalone results-bracket tab — the knockout bracket lives inside Predict; real knockout results still show in Matches/Groups.) Dialogs: `#searchDialog` (global ⌘K/"/" search over teams/players/matches, relevance-ranked), `#settingsDialog`, `#tzDialog`, `#matchDialog`, `#teamSheet` (rich team detail — overview/form/fixtures/group/squad; `openTeam`, opened wherever a team is tapped), `#teamDialog` (favorite picker), `#playerDialog`. Search/leaderboard rows reuse the `data-squad`/`data-player`/`data-mid` click delegation, so taps route to `openTeam`/`openPlayer`/`openMatch`.
- `styles.css` — "Floodlit, on paper" design system. All colors via CSS vars; team theming overrides `--acc1`/`--acc2`.
- `app.js` — everything: state, timezone, results resolution, standings math, the simulator engine (third-place allocator + bracket resolution), renderers per view, pickers, data loading/polling. ~700 lines, sectioned with comment banners.
- `data/matches.json` — 104 fixtures (id, num, stage, group, utc, home/away slots, stadium, city). Source: openfootball (public domain). **Static — don't expect Actions to rewrite this.**
- `data/teams.json` — 48 teams: display name, kit colors `c1`/`c2`. Flags are derived from the team code at runtime.
- `data/results.json` — written by the scores Action: the **small, every-60s-polled** file. Per-match **scores/status only**: `{st,h,a,hp,ap,ht,at,min}`. Seeded empty (`{"matches":{}}`) so the site works before first run.
- `data/details.json` — written by the scores Action alongside `results.json`: the **heavy per-match detail**, split out so it isn't re-downloaded every 60s. Per-match `{xi,ev,stats}` (+ `gh`/`ga` fallback). `stats` (from ESPN's free `fifa.world` feed) is `{poss,sh,sot,cor,fls}`, each a `[home,away]` pair (possession is %). `ev` is the goals/cards/subs timeline: array of `{t,k,tm,...}` where `t`=minute string (`"9'"`/`"90'+8'"`), `k`=`G|P|OG|Y|R|S`, `tm`=`h|a`; goals/cards carry `p` (+`a` assist), subs carry `on`/`off`. `xi` is `{h,a}` each `{f:formation,xi:[[num,name,pos],…],coach}` (pos 0=GK 1=DEF 2=MID 3=FWD). `gh`/`ga` (plain scorer strings, worldcup26.ir fallback) — the renderer prefers `ev`, falls back to `gh`/`ga`. **The client merges `details.json` over `results.json` into `S.matchData`** (fetched only when scores change), so every renderer still reads one object per match via `res()`. The writer keeps `SLIM = [st,h,a,hp,ap,ht,at,min]` in `results.json` and everything else in `details.json`; both are written only when their half changed, and the fetch carry-forward uses a merged `prevMerged` view.
- `data/squads.json` — 26-man squads. 16 official lists are seeded by hand; the squads Action fills the rest. Shape: `{squads:{CODE:{coach,players:[{n,pos,name,caps,goals,club,photo}]}}}`.
- `data/photos.json` — official player headshots harvested from FIFA lineups by the scores Action (keyed `"ShortName|CODE"` → image URL). Backfills as teams play; the client reads it for the formation pitch + Golden Boot via `playerPhoto(name, code)`. Committed alongside `results.json` by `results.yml`.
- `scripts/fetch-results.mjs` — Node 20 ESM. **Primary source: api.fifa.com/api/v3** (free, no key, authoritative; `MatchNumber` 1–104 == our match `num`). Gives live score+minute from `/calendar/matches`, and per in-play / just-finished match an event timeline + lineups from `/live/football/{comp}/{season}/{stage}/{match}` (built into `ev`/`xi`). FIFA team codes are 3-letter; the script auto-learns the 3-letter→our-code map from the group fixtures to resolve knockout teams. Per-match live calls are bounded (`LIVE_FETCH_CAP`) and finished matches are captured once then carried from the previous `results.json`. **Fallbacks (scores only):** worldcup26.ir (free, no key) → football-data.org (needs `FOOTBALL_DATA_TOKEN`, reliable at full-time). After the primary runs, `enrichStats()` pulls team stats (possession/shots/corners/fouls) from ESPN's free `site.api.espn.com/.../soccer/fifa.world` feed for in-play / just-finished matches (mapped by UTC kickoff minute), into the `stats` field. Writes `results.json` (slim scores) and `details.json` (heavy `ev`/`xi`/`stats`) separately, each only when its half changed. Run `node scripts/fetch-results.mjs --dry-run` to test without writing. (All sources fetched server-side via the Action — even the CORS-enabled FIFA feed — so a vanished endpoint never breaks a visitor's page.)
- `scripts/fetch-squads.mjs` — Node 20 ESM. Pulls all 48 squads from API-Football, merging over seeded caps/goals/club.
- `site.webmanifest` (repo root, so relative `scope`/icon URLs resolve under `/wc26/`) + `assets/icon-{192,512,180}.png` make the site an installable PWA; `scripts/make-icons.py` (Pillow, one-shot like `make-og.py`) regenerates the icons. `sw.js` (root, registered from `boot()`) is a **network-first** service worker: HTML/`app.js`/`styles.css`/`*.json` always come from the network when online (so a visitor can never be trapped on a stale build — the version-refresh nudge still prompts a reload), and the cache is an offline fallback only; flags/icons/fonts are cache-first. Bump its `CACHE` const per deploy.
- `data/ics/*.ics` + `scripts/make-ics.mjs` — static calendars for webcal subscription: `all.ics` (104 matches) + one per team (group fixtures; knockout slots are placeholders). The schedule is fixed, so it's a **one-off** generate-and-commit (Node, no deps); the client links to them as `webcal://…` URLs (team sheet "Subscribe to fixtures" + a Settings "Subscribe to all matches" row). Keep the VEVENT format in sync with `matchVEVENT()` in `app.js`.
- `scripts/make-share-cards.mjs` — **build-time only** (the one place with npm deps: `satori` + `@resvg/resvg-js`, see `package.json`). Renders a 1200×630 OG card per finished match → `assets/og/<num>.png` + a `share/<num>.html` stub (OG meta + redirect to `/?match=<id>`). Skips existing cards (`--force` to redo). Fonts: `assets/fonts/archivo-*.woff`. The site itself stays dependency-free; `node_modules` is gitignored.
- `.github/workflows/results.yml` — **self-relaunching polling loop** (not a plain 5-min cron: GitHub throttles `schedule` to ~hourly, too slow for live). One run loops `fetch-results.mjs` every 1 min near kickoffs / 30 min in quiet hours for ~5h, then re-dispatches itself (`gh workflow run`, needs `actions: write`); a `*/15` cron is only a safety-net restarter. `concurrency: cancel-in-progress` keeps exactly one loop alive. `.github/workflows/squads.yml` — manual only. `.github/workflows/share-cards.yml` — `workflow_run` on Update-scores completion (now fires when a loop run ends/relaunches, ~every 5h), `npm ci` + generate, commits `assets/og`/`share` (isolated from the dep-free scores pipeline).

## Data model notes
- **Knockout slots are placeholders until resolved.** A slot is `{team:"BR"}` (known) or `{ph:"Winner Group A", short:"1A"}` / `{short:"3rd A/B/C/D", ...}` / `{feeds:73}` (winner of match 73). `slotInfo()` resolves these from results; unresolved → italic placeholder. This is correct, not a bug.
- **Third-place routing:** the new 48-team format sends 8 of 12 third-placed teams to specific Round-of-32 slots, each constrained to certain groups. The predictor implements FIFA's constraint via a backtracking allocator (`allocateThirds()`); `renderSim` seeds a valid default set of thirds (`seedSimThirds()`) on first visit so the bracket is interactive immediately. In Matches/Groups, knockout slots resolve to the API's real teams once known (`slotInfo()`).
- **Standings tiebreak** is points → goal difference → goals for → code. FIFA's deeper criteria (head-to-head, disciplinary, drawing of lots) aren't computable from scores alone — acceptable simplification; knockout slots use the resolved real teams as ground truth once known.
- **Caps/goals are frozen at tournament start** (from official squad lists). The squads refresh preserves them rather than overwriting.

## Run locally
The site fetches `data/*.json`, so `file://` won't work (CORS). Use a static server:
```bash
cd wc26-site        # the folder containing index.html
python3 -m http.server 8000      # then open http://localhost:8000
# or: npx serve .
```
To test the data scripts locally (optional — Actions do this in prod), Node 20+:
```bash
FOOTBALL_DATA_TOKEN=xxx node scripts/fetch-results.mjs
API_FOOTBALL_KEY=yyy node scripts/fetch-squads.mjs
```

## Design tokens (keep consistent)
- Fonts: Archivo (display, condensed-ish via font-stretch), Instrument Sans (body), Spline Sans Mono (numbers/times).
- Palette: paper `#FAFBF9`, ink `#0D1B2A`, pitch green `#0BA360` (default accent), gold `#E8B931` (3rd-place / champion), live red `#FF3B30` (live state ONLY — never decorative).
- Numbers/times/scores are always mono with `tabular-nums`.
- Animations respect `prefers-reduced-motion`. Mobile-first; tables go single-column under 560px.

## Good first tasks / common requests
- Tighten the score cron to `*/10` during knockout rounds.
- Add live match events (scorers/cards/subs) — needs API-Football, budget carefully (knockouts only).
- Add an `events` array to the results schema + a timeline UI in the match card.
- Per-team knockout-path highlighting on My Team.
- Share a prediction via URL (encode `sim` state into a query param).

When adding data fields, update: the schema note here, the writer script, and the renderer — in that order.
