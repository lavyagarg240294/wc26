# Architecture - WC·26

A technical overview of how this site is built. For setup/deploy, see [`README.md`](README.md).

## What it is

A static, **no-build** fan site for the FIFA World Cup 2026 (June 11 – July 19): all 104 matches in the visitor's timezone, a favourite team that re-themes the whole UI, live group tables, a full predictor with an interactive knockout bracket (tap winners to crown a champion), squads and lineups. Hosted free on GitHub Pages. **Live scores/timeline/line-ups are read directly from FIFA's public feed by the browser** (real-time); everything slower is baked into JSON by GitHub Actions, which also serves as the fallback. FIFA's feed is keyless and the keyed sources stay in the Actions, so **no keys are ever exposed client-side** (see [Live data: two paths](#live-data-two-paths-real-time--fallback)).

## Live data: two paths (real-time + fallback)

Live data moves on **two independent paths**, split by how fast it changes. Both run at once during a match — the robot does **not** wait for the browser to fail.

**1. Hot path — the browser reads FIFA directly (real-time).** For anything that ticks during play — score, minute, status, the goal/card/sub timeline, line-ups, phase (extra time / penalties), the kick-by-kick shoot-out — the browser fetches FIFA's public feed itself (`api.fifa.com`, CORS-enabled, keyless): the **calendar** endpoint (all 104 matches: score/status/minute) every ~20s, plus each **in-play match's live object** (and the timeline endpoint for a shoot-out). `fetchFifaLive()` / `fetchFifaDetail()` in `app.js` reproduce the bot's team-join + status coercion client-side and produce the same slim/detail shapes. Because this path never touches the publish pipeline, **a stalled Action or a slow Pages deploy can't freeze the live score** — the failure mode that froze the site repeatedly before this design.

**2. Slow path — the committed JSON (enrichment + fallback + record).** The `results.yml` Action polls FIFA on its own timer (~25s during a live match) **continuously and independently of any browser**, and commits `data/*.json`. It carries the things the browser doesn't fetch directly — ESPN match stats, commentary, reports, FIFA's post-match deep analysis — and is the **durable record** (finished results, standings) and the **fallback**. It runs the whole time a match is live, not only when the hot path fails.

**How they merge.** `rebuildMatchData()` builds one object per match: committed detail → committed slim → **FIFA calendar overlay** → **FIFA detail overlay** (freshest wins). Guards: the overlay never overrides a `manual` operator lock, and it ages out after 2 min — so if FIFA is ever unreachable from a given browser, the page cleanly falls back to committed data (never blank, never worse than before). `celebrateGoals()` runs on the merged data, so a goal animates with the instant score.

**Fallback freshness.** The committed data is read from the site origin (GitHub Pages — a CDN, unlimited) but, if that copy is **stale** (its `updated` is behind, e.g. a lagging deploy) or the fetch fails, `fetchFresh()` falls back to **git HEAD via `raw.githubusercontent.com`** — always the latest commit, no build. Raw is only hit when Pages is actually behind, so its tighter rate limit is a non-issue. Net: three independent layers (FIFA-direct → committed via Pages → committed via git HEAD); it takes all three failing at once to show nothing fresh.

## Design constraints

These are deliberate, not accidental:

- **No build step, no framework, no bundler.** The site is plain `index.html` + `styles.css` + `app.js` (one vanilla IIFE). What's in the repo *is* the site.
- **No API keys in client code.** The page reads FIFA's *keyless* public feed directly (hot path) plus pre-committed JSON from `data/`; the keyed sources (football-data, API-Football) live only in GitHub Actions secrets and never reach the browser.
- **All kickoff times are stored in UTC** in `matches.json` and converted at render time via `Intl.DateTimeFormat` - never a hardcoded local time.
- **`localStorage` is only for per-visitor prefs** (favourite team, timezone, saved prediction). Tournament data comes from FIFA's live feed (hot path) and `data/*.json` (enrichment + fallback) — never from `localStorage`.
- **One design system, driven by CSS variables.** The accent colour is `--acc1`; picking a favourite team recolours the whole UI to its kit (contrast-guarded).

## File map

- **`index.html`** - the shell: header (search · settings · team chips), tab nav (Matches / Bracket / Stats / Predict / Teams / Players / News), the ticker strip, all dialogs, the confetti canvas, and the jump-to-now button. Views are `#view-<name>` sections; `RENDER[name]` maps each to its renderer. Dialogs include the match popup (`openMatch` - a finished game shows a credited **Match report**, a live one shows a lazy-loaded **Live commentary** feed, never both), the rich **team sheet** (`openTeam`), the **player profile** (`openPlayer`), the favourite-team picker, the **About the tournament** / **About this project** sheets, and a once-only first-launch **welcome**.
- **`styles.css`** - the "Floodlit, on paper" design system. All colours are CSS variables; team theming overrides `--acc1` / `--acc2`.
- **`app.js`** - everything else: state, timezone handling, results resolution, standings math, the predictor engine (third-place allocator + bracket resolution), per-view renderers, pickers, and data loading/polling. One vanilla IIFE, sectioned with comment banners.

### Data files (`data/`)

| File | Contents | Source |
|---|---|---|
| `matches.json` | 104 fixtures - UTC kickoffs, stage/group, venue, knockout-slot placeholders | openfootball (public domain), **static** |
| `teams.json` | 48 teams - names, kit colours, confederation, World Cup titles, an **Elo** strength rating (feeds the win-probability model), and curated WC pedigree (`apps` / `best` / `coach`) | static |
| `results.json` | per-match `{st,h,a,hp,ap,ht,at,min,per,rt,ko}` - score/status only; the small committed file (the browser also reads FIFA directly and overlays it on top). `per` = FIFA period, `rt` = result type (a.e.t./pens), `ko` = the feed's real kickoff when it drifts from the static schedule | scores Action |
| `details.json` | per-match `{xi,ev,stats,pens}` - lineups, goal/card/sub timeline, team stats, kick-by-kick shoot-out; split out so it isn't re-polled every minute. The client merges it (and the FIFA-direct overlay) over `results.json` | scores Action |
| `photos.json` | official player headshots harvested from FIFA (`"ShortName\|CODE"` → URL) | scores Action |
| `reports.json` | credited match reports from ESPN's free `summary` feed, keyed by match number | scores Action |
| `commentary/<num>.json` | heavy live play-by-play, one file per match so the client lazy-loads only what a popup opens | scores Action |
| `squads.json` | 26-man squads (from official FIFA squad lists; caps/goals frozen at tournament start) | static + optional refresh |

The empty-state files (`results`/`reports`) are seeded `{"matches":{}}` so the site works before the first Action run. The client always reads one merged object per match via `res()` — committed slim + committed detail + the FIFA-direct real-time overlay (see [Live data: two paths](#live-data-two-paths-real-time--fallback)).

### Scripts (`scripts/`)

- **`fetch-results.mjs`** - the data engine for the **committed/slow path** (Node 20 ESM); the browser reads FIFA directly for the live hot path (see [Live data](#live-data-two-paths-real-time--fallback)), and `app.js`'s `fetchFifaLive()`/`fetchFifaDetail()` are ports of this file's core. **Primary source: `api.fifa.com/api/v3`** (free, no key) for score + minute + `period`/`result-type`, plus an event timeline, line-ups and the kick-by-kick **shoot-out** (`timelines` endpoint) per in-play match. It joins feed rows to fixtures **by team pair, never by match number** (FIFA's numbering isn't chronological - joining on it once wrote a live score onto the wrong fixture). **Fallbacks:** worldcup26.ir → football-data.org (needs `FOOTBALL_DATA_TOKEN`). It then enriches with team **stats**, a credited **report**, and **commentary** from one ESPN `summary` call. Writes the slim `results.json` and heavy `details.json` separately, each only when its half changed. `--dry-run` tests without writing.
- **`fetch-squads.mjs`** - *optional*. Refreshes caps/goals/club from API-Football (needs `API_FOOTBALL_KEY`). The committed squads already ship from official FIFA lists, so this isn't required to run the site.
- **`make-icons.py`** / **`make-og.py`** - Pillow, one-shot. Generate the PWA/home-screen icons and the 1200×630 social card from the site's centre-circle mark.
- **`make-share-cards.mjs`** - build-time only, and the one place with npm deps (`satori` + `@resvg/resvg-js`). Renders a per-finished-match OG card + a `share/<num>.html` redirect stub. The site itself stays dependency-free; `node_modules` is gitignored.

### Service worker & PWA

`sw.js` is **network-first**: HTML / `app.js` / `styles.css` / `*.json` always come from the network when online (so a visitor is never trapped on a stale build; an in-app nudge prompts a reload on a new version), with the cache as an offline fallback. Flags, icons and fonts are cache-first. `site.webmanifest` + the generated icons make the site installable.

### GitHub Actions (`.github/workflows/`)

- **`results.yml`** - a **self-relaunching polling loop** (not a plain cron, which GitHub throttles to ~hourly - too slow for live). One run polls every ~25s near kickoffs / 30 min in quiet hours for ~5h, commits any changed data, dispatches `pages.yml` (a `GITHUB_TOKEN` push doesn't auto-trigger a workflow, so it triggers the deploy explicitly), then re-dispatches itself, until the tournament ends. Since the browser now reads live scores from FIFA directly, this loop's freshness is **non-critical** for the live score — it feeds enrichment + the fallback + the durable record.
- **`pages.yml`** - the **Pages deploy** (source = *GitHub Actions*, not "deploy from a branch"). Uses `concurrency: {group: pages, cancel-in-progress: false}` so deploys **queue** instead of cancelling — the built-in branch-deploy flow cancels an in-progress build on every commit, so the frequent scores commits starved it and the site froze for hours. This queues the latest instead.
- **`results-restart.yml`** - a safety-net cron that restarts the loop only if none is running (its own concurrency group, so it can't kill the healthy loop).
- **`tests.yml`** - runs `node --test` on every push.
- **`health.yml`** - an always-on watchdog that checks the **live** site (up? data valid? scores fresh while a match is in play? assets load?) and opens/closes a GitHub issue on failure/recovery.
- **`squads.yml`** / **`share-cards.yml`** - manual squad refresh / OG-card generation.

## Data model notes

- **Knockout slots are placeholders until resolved.** A slot is `{team:"BR"}` (known) or a placeholder like `{ph:"Winner Group A", short:"1A"}` / `{short:"3rd A/B/C/D"}` / `{feeds:73}`. `slotInfo()` resolves these from results; unresolved slots render as italic placeholders.
- **Third-place routing.** The 48-team format sends 8 of 12 third-placed teams to specific Round-of-32 slots, each constrained to certain groups. The predictor implements FIFA's constraint with a backtracking allocator (`allocateThirds()`) and seeds a valid default set so the bracket is interactive immediately.
- **Standings tiebreak** is points → goal difference → goals for → code. FIFA's deeper criteria (head-to-head, disciplinary, drawing of lots) aren't computable from scores alone - an acknowledged simplification; once knockout teams are known, the resolved real teams are used as ground truth.
- **Two "day" concepts.** The matches list groups by the real **calendar date** (`dayKey`). The ticker and match-of-day use a slate-aware **`viewDay`** (rolls at ~10am local) so a night's football reads as one block past midnight. The ticker shows a sliding **two-practical-day window** - yesterday's finals + today's fixtures (times → live → finals) - and slides forward at the 10am boundary.

## Design system

- **Fonts:** Archivo (display), Instrument Sans (body), Spline Sans Mono (numbers/times - always `tabular-nums`).
- **Palette:** paper `#FAFBF9`, ink `#0D1B2A`, pitch green `#0BA360` (default accent), gold `#E8B931` (third-place / champion), live red `#FF3B30` (live state only - never decorative).
- **Logo:** a pure-geometry pitch **centre-circle mark** (`assets/mark.svg`) - gold circle + edge-to-edge halfway line + kick-off spot on a floodlit-green tile. Reused for the favicon, PWA icons, the OG card and the welcome screen (where it draws itself on first open).
- **Flags** (`flag(code)`): bundled local SVGs in `assets/flags/` (originally from flagcdn), each rendered in a uniform 3:2 box via `object-fit:cover` with a hairline ring so even white flags separate from the paper.
- **Live hero is a stack** (`heroStack()`): every live match is its own hero card (simultaneous kickoffs are normal). The spinning live/goal indicator is the public-domain (CC0) `assets/football.svg`. When nothing's live, a single next-kickoff card carries the countdown.
- **Motion** respects `prefers-reduced-motion`; mobile-first, tables collapse to single-column under 560px. Optional background music ("Stadium mix") is a shuffled royalty-free playlist, off by default.

## Local development

The site fetches `data/*.json`, so `file://` won't work (CORS). Use a static server:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
# or: npx serve .
```

Run the tests (no deps; Node 20+):

```bash
node --test           # validates squads, flags, calendars + a syntax smoke test
```

**Deploying** is a push to `main`, which the `pages.yml` Action publishes (a code push you make triggers it directly; the scores loop dispatches it for its data commits). When changing `app.js`/`styles.css`, bump the cache-busting version in three places together: `BUILD` in `app.js`, the `?v=` query on both files in `index.html`, and `CACHE` in `sw.js`.

## License

MIT - see [`LICENSE`](LICENSE). Football data, team names, flags and related marks belong to their respective owners; this is an unofficial fan project, not affiliated with FIFA.
