# WC·26 — World Cup 2026 Companion

A fast, no-build fan site for the FIFA World Cup 2026: all 104 matches in your timezone, a favorite team that re-themes the whole site, live group tables, and a bracket that fills itself in.

**Stack:** plain HTML/CSS/JS on GitHub Pages + a GitHub Action that refreshes scores from football-data.org every 20 minutes. Total cost: $0.

---

## One-time setup (~10 minutes)

### 1. Get the free API keys
- **football-data.org** (scores): sign up at https://www.football-data.org/client/register — free tier includes the World Cup.
- **API-Football** (squads + starting XIs, optional): sign up at https://www.api-football.com — free plan is 100 requests/day, plenty for this.

### 2. Create the repo and push
```bash
cd wc26-site
git init && git add -A && git commit -m "kickoff"
gh repo create wc26 --public --source=. --push
# (or create an empty repo on github.com and: git remote add origin … && git push -u origin main)
```
The repo must be **public** for free unlimited Pages + Actions.

### 3. Add the API key as a secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**
Add two secrets (encrypted and hidden, even in public repos):
- `FOOTBALL_DATA_TOKEN` — your football-data.org token (scores)
- `API_FOOTBALL_KEY` — your API-Football key (squads + lineups; skip it and the site simply runs without player data)

### 4. Enable GitHub Pages
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
Your site goes live at `https://<username>.github.io/wc26/` within a minute or two.

### 5. Allow the Action to push
Repo → **Settings → Actions → General → Workflow permissions** → select **Read and write permissions** → Save.

### 6. Kick the data once
Repo → **Actions**:
- **Update scores → Run workflow** — first scores commit; then automatic every 20 minutes.
- **Update squads → Run workflow** — fills all 48 squads (16 official lists ship pre-seeded). Re-run if a squad changes through injury replacement.

---

## How it works

```
visitor's browser ── reads ──► index.html + data/*.json   (GitHub Pages, static)
                                          ▲
GitHub Action (every 20 min) ── writes ──┘
        │
        └── fetches scores from football-data.org (key stays in repo secrets)
```

- `data/matches.json` — all 104 fixtures, UTC kickoffs, venues (source: openfootball, public domain)
- `data/teams.json` — 48 teams: display names, flag codes, kit colors
- `data/results.json` — scores, statuses, resolved knockout teams, and starting XIs, written by the Action
- `data/squads.json` — 26-man squads per team (16 official lists seeded; squads workflow fills the rest)
- The site polls `results.json` every 90 s while open, so scores update without a refresh.

## Updating the site

Edit anything, commit, push — every visitor sees it on their next load. No build step exists; what's in the repo is the site.

**Manual score fix** (API hiccup, etc.): edit `data/results.json` directly. Schema per match:
```json
"m12": { "st": "FT", "h": 2, "a": 1 }
```
`st`: `SCHED` | `LIVE` | `HT` | `FT` · `h/a`: goals · `hp/ap`: penalty scores · `ht/at`: resolved team codes (knockouts only) · `min`: live minute · `xi`: starting lineups (written ~1h before kickoff when `API_FOOTBALL_KEY` is set; tap a match card to view).

## After the final (July 19)

Disable the schedule so the Action stops running: delete the `schedule:` block in `.github/workflows/results.yml`, or disable the workflow in the Actions tab. The site keeps working forever as a frozen record of the tournament.

## Notes & honest limits

- Free-tier scores can lag a few minutes behind broadcast; the Action's 20-min cadence means at most ~20 min staleness. Tighten the cron to `*/10` during knockout rounds if you like.
- Group tiebreakers implement points → goal difference → goals scored (FIFA's further criteria — head-to-head conduct points, ranking — aren't computable from scores alone; the bracket uses the API's resolved teams as ground truth once known, so it stays correct regardless).
- Unofficial fan project; not affiliated with FIFA.
