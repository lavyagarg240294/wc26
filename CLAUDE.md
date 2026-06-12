# CLAUDE.md — WC·26 World Cup 2026 Companion

Orientation for Claude Code. Read this first, then `README.md` for deploy/secrets.

## What this is
A static, no-build fan site for the FIFA World Cup 2026 (June 11 – July 19): all 104 matches in the visitor's timezone, a favorite team that re-themes the whole UI, live group tables, an auto-filling knockout bracket, a full predictor, and squad/lineup data. Hosted free on GitHub Pages (or Vercel). Data is refreshed by GitHub Actions that commit JSON into the repo — the browser never calls a sports API directly, so no keys are ever exposed client-side.

## Hard rules (do not break these)
- **No build step, no framework, no bundler.** Plain `index.html` + `styles.css` + `app.js` (one vanilla IIFE). Keep it that way unless explicitly asked to migrate.
- **Never put API keys in client code.** Keys live only in GitHub Actions secrets (`FOOTBALL_DATA_TOKEN`, `API_FOOTBALL_KEY`). The site reads committed JSON from `data/`.
- **No `localStorage` misuse for app data that must be shared** — per-visitor prefs (favorite team, timezone, saved prediction) intentionally use `localStorage`; tournament data must come from `data/*.json`.
- **All kickoff times are stored in UTC** in `matches.json` and converted at render time via `Intl.DateTimeFormat`. Never hardcode a local time.
- Preserve the design system (see Tokens). Accent color is driven by CSS variable `--acc1` and recolors to the favorite team's kit.

## File map
- `index.html` — shell: header chips (timezone, team), tab nav (Today / My Team / Calendar / Groups / Bracket / Predict), ticker strip, dialogs, confetti canvas.
- `styles.css` — "Floodlit, on paper" design system. All colors via CSS vars; team theming overrides `--acc1`/`--acc2`.
- `app.js` — everything: state, timezone, results resolution, standings math, the simulator engine (third-place allocator + bracket resolution), renderers per view, pickers, data loading/polling. ~700 lines, sectioned with comment banners.
- `data/matches.json` — 104 fixtures (id, num, stage, group, utc, home/away slots, stadium, city). Source: openfootball (public domain). **Static — don't expect Actions to rewrite this.**
- `data/teams.json` — 48 teams: display name, kit colors `c1`/`c2`. Flags are derived from the team code at runtime.
- `data/results.json` — written by the scores Action: per-match `{st,h,a,hp,ap,ht,at,min,xi,ev,stats}`. `stats` (from ESPN's free `fifa.world` feed) is `{poss,sh,sot,cor,fls}`, each a `[home,away]` pair (possession is %). `ev` is the goals/cards/subs timeline: array of `{t,k,tm,...}` where `t`=minute string (`"9'"`/`"90'+8'"`), `k`=`G|P|OG|Y|R|S`, `tm`=`h|a`; goals/cards carry `p` (+`a` assist), subs carry `on`/`off`. `xi` is `{h,a}` each `{f:formation,xi:[[num,name,pos],…],coach}` (pos 0=GK 1=DEF 2=MID 3=FWD). Older rows may instead carry `gh`/`ga` (plain scorer strings) from the worldcup26.ir fallback — the renderer prefers `ev`, falls back to `gh`/`ga`. Seeded empty (`{"matches":{}}`) so the site works before first run.
- `data/squads.json` — 26-man squads. 16 official lists are seeded by hand; the squads Action fills the rest. Shape: `{squads:{CODE:{coach,players:[{n,pos,name,caps,goals,club,photo}]}}}`.
- `scripts/fetch-results.mjs` — Node 20 ESM. **Primary source: api.fifa.com/api/v3** (free, no key, authoritative; `MatchNumber` 1–104 == our match `num`). Gives live score+minute from `/calendar/matches`, and per in-play / just-finished match an event timeline + lineups from `/live/football/{comp}/{season}/{stage}/{match}` (built into `ev`/`xi`). FIFA team codes are 3-letter; the script auto-learns the 3-letter→our-code map from the group fixtures to resolve knockout teams. Per-match live calls are bounded (`LIVE_FETCH_CAP`) and finished matches are captured once then carried from the previous `results.json`. **Fallbacks (scores only):** worldcup26.ir (free, no key) → football-data.org (needs `FOOTBALL_DATA_TOKEN`, reliable at full-time). After the primary runs, `enrichStats()` pulls team stats (possession/shots/corners/fouls) from ESPN's free `site.api.espn.com/.../soccer/fifa.world` feed for in-play / just-finished matches (mapped by UTC kickoff minute), into the `stats` field. Writes `results.json` only when changed. Run `node scripts/fetch-results.mjs --dry-run` to test without writing. (All sources fetched server-side via the Action — even the CORS-enabled FIFA feed — so a vanished endpoint never breaks a visitor's page.)
- `scripts/fetch-squads.mjs` — Node 20 ESM. Pulls all 48 squads from API-Football, merging over seeded caps/goals/club.
- `.github/workflows/results.yml` — cron every 20 min + manual. `.github/workflows/squads.yml` — manual only.

## Data model notes
- **Knockout slots are placeholders until resolved.** A slot is `{team:"BR"}` (known) or `{ph:"Winner Group A", short:"1A"}` / `{short:"3rd A/B/C/D", ...}` / `{feeds:73}` (winner of match 73). `slotInfo()` resolves these from results; unresolved → italic placeholder. This is correct, not a bug.
- **Third-place routing:** the new 48-team format sends 8 of 12 third-placed teams to specific Round-of-32 slots, each constrained to certain groups. The predictor implements FIFA's constraint via a backtracking allocator (`allocateThirds()`); the live bracket uses the API's resolved teams as ground truth once known.
- **Standings tiebreak** is points → goal difference → goals for → code. FIFA's deeper criteria (head-to-head, disciplinary, drawing of lots) aren't computable from scores alone — acceptable simplification; the bracket never relies on it once real results exist.
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
