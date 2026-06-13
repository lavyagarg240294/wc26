# WC·26 — World Cup 2026 Companion

A fast, no-build fan site for the **FIFA World Cup 2026** — every match in your timezone, a favorite team that re-themes the whole UI, and a tournament that fills itself in as games are played.

**What's inside**
- **Live match detail** — score + minute, a goal/card/sub **timeline** (tap any player for a mini profile — photo, club, caps & what they did in the match), **lineups on a formation pitch** (with official player photos), a match-flow sparkline, and **match stats** (possession, shots, corners, fouls).
- **Groups** — live standings + a "what each team needs to qualify" outlook.
- **Stats** — tournament pulse, the **Golden Boot** race, and per-match **team stats** (attack, defence, possession, shots on target, and yellow/red cards).
- **Predict** — order every group, pick the best third-placed teams, then tap winners through a full knockout **bracket** to crown your champion (seeded from live standings so it's ready to play with right away), see **how your call is tracking vs reality**, and **share your bracket as a ~30-character link**.
- **Teams** — tap any team for a detail sheet: overview, recent form, every fixture, the group standing + qualification outlook, a one-tap follow (re-themes the UI), and the squad.
- Plus: **global search** (⌘K — teams, players, matches), **installable to your home screen** (PWA), **dark mode**, a **Settings** sheet (anthem + goal horn + timezone), **calendar (.ics) export**, per-match **share cards** that unfurl on social, and a fully mobile-first, re-themable UI.

**Stack:** plain `index.html` + `styles.css` + one vanilla-JS `app.js` on GitHub Pages, fed by GitHub Actions that commit JSON into the repo. **No API keys are required to run it** — live scores, events, lineups, stats and player photos all come from free, keyless sources. Total cost: **$0**.

---

## One-time setup (~5 minutes)

### 1. Create the repo and push
```bash
cd wc26-site
git init && git add -A && git commit -m "kickoff"
gh repo create wc26 --public --source=. --push
# (or make an empty repo on github.com, then: git remote add origin … && git push -u origin main)
```
The repo must be **public** for free unlimited Pages + Actions.

### 2. Enable GitHub Pages
**Settings → Pages** → Source: **Deploy from a branch** → Branch `main`, folder `/ (root)` → Save.
Live at `https://<username>.github.io/wc26/` within a minute or two.
> Update the absolute URLs in `index.html` (the `og:`/`twitter:` meta) to your own Pages URL so social previews point at your site.

### 3. Allow the Actions to push
**Settings → Actions → General → Workflow permissions** → **Read and write permissions** → Save.

### 4. Kick the data once
**Actions** tab:
- **Update scores → Run workflow** — first scores commit; then it keeps itself running (a self-relaunching polling loop), refreshing ~every minute during live matches.
- **Share cards** runs automatically after each scores update (renders the OG card per finished match).
- **Update squads → Run workflow** — fills all 48 squads (16 official lists ship pre-seeded).

### Optional API keys (you can skip all of these)
Add under **Settings → Secrets and variables → Actions** only if you want them:
- `FOOTBALL_DATA_TOKEN` — a free [football-data.org](https://www.football-data.org/client/register) token, used **only as a last-resort fallback** if both FIFA and ESPN are unreachable.
- `API_FOOTBALL_KEY` — a free [API-Football](https://www.api-football.com) key for the squads workflow (caps/goals/club). Without it, the 16 seeded squads still show.

---

## How it works

```
visitor's browser ── reads ──► index.html + data/*.json     (GitHub Pages, static)
                                          ▲
GitHub Action (polling loop) ── writes ───┘
        │  PRIMARY  api.fifa.com         → score, minute, events, lineups, photos
        │  STATS    site.api.espn.com    → possession, shots, corners, fouls
        └  FALLBACK worldcup26.ir → football-data.org (token, optional)
```

All sources are fetched **server-side in the Action** (even the CORS-enabled ones), so a vanished endpoint never breaks a visitor's page, and no keys ever reach the browser. The site polls `results.json` every 60 s while open, so scores update without a refresh.

---

## Data files (`data/`)

| File | What | Written by |
|---|---|---|
| `matches.json` | 104 fixtures — UTC kickoffs, venues, stage/group, knockout slot placeholders (source: openfootball, public domain) | static |
| `teams.json` | 48 teams — names, kit colours, confederation, World Cup titles | static |
| `results.json` | per-match `{st,h,a,hp,ap,ht,at,min}` — score/status only (the small file polled every ~60s) | scores Action |
| `details.json` | per-match `{xi,ev,stats}` — lineups, event timeline, match stats (split out so it isn't re-polled every minute; the client merges it over `results.json`) | scores Action |
| `photos.json` | official player headshots harvested from FIFA lineups (`"ShortName|CODE"` → image URL) | scores Action |
| `squads.json` | 26-man squads per team | squads Action |

The favorite team, timezone and saved prediction live in each visitor's `localStorage` — they never leave the device.

---

## Updating the site

Edit anything, commit, push — every visitor sees it on their next load. **There is no build step for the site itself**; what's in the repo is the site.

**Manual score fix** (rare): edit `data/results.json` directly. Minimal per-match shape:
```json
"m12": { "st": "FT", "h": 2, "a": 1 }
```
`st`: `SCHED` | `LIVE` | `HT` | `FT` · `h/a`: goals · `hp/ap`: penalties · `ht/at`: resolved team codes (knockouts) · `min`: live minute. The heavy per-match detail (`xi`: lineups · `ev`: goal/card/sub timeline · `stats`: `[home,away]` pairs) lives in `data/details.json` (same `matches` keys), split out so the polled `results.json` stays small. Tap any match card for the full detail view.

**Share cards** are the one piece with build tooling (`scripts/make-share-cards.mjs` uses `satori` + `@resvg/resvg-js`; see `package.json`). They run only in their own Action — `node_modules` is gitignored and the core scores pipeline stays dependency-free.

---

## After the final (July 19)

**Disable the "Update scores" workflow in the Actions tab** (Actions → Update scores → ··· → Disable workflow). This is required, not optional: that workflow is a self-relaunching loop, so deleting its `schedule:` block is *not* enough — it re-triggers itself and would keep a runner busy forever. Disabling it stops the loop cleanly. Do the same for **Share cards** if you like. The site keeps working forever as a frozen record of the tournament.

---

## Notes & honest limits

- **No keys needed.** FIFA's and ESPN's feeds are unofficial/undocumented ("use at your own risk") — that's exactly why everything is fetched through the Action with layered fallbacks, so the site degrades to scores-only rather than breaking if one source changes.
- **Group tiebreakers** implement points → goal difference → goals scored. FIFA's deeper criteria (head-to-head, disciplinary, drawing of lots) aren't computable from scores alone; the qualification math is conservative about it, and the bracket uses the resolved teams as ground truth once known.
- **Player & share-card images** are hot-linked from FIFA's CDN; if a URL ever 404s, the dot/preview falls back gracefully.
- Unofficial fan project; **not affiliated with FIFA**.
