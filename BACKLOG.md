# WC·26 — Backlog & QC notes

_Last QC: build 39 (2026-06-12). Driven live across all 6 views on desktop (900px) and mobile (375px)._

## QC summary — current state is healthy ✅

Exercised every view and the main interactions. **No console errors anywhere. No horizontal overflow on mobile.** Specifically verified working:

- **Matches** — 104 cards, stage filter (all/group/ko → 32), searchable team dropdown (default "All teams"), collapsible "Earlier results", jump-to-now, no duplicate kickoff time, scheduled cards have a clean empty right side.
- **Match modal** — FT shows events timeline (17) + stats bars (5) + formation pitch (22) + form chips + squad links, no calendar button; scheduled shows VS + calendar button, correctly hides timeline/stats/pitch.
- **Teams** — 48-card grid, 26-man squad dialog with form, team-picker search, My Team hero with form + `.ics` export + favourite theming (accent recolours).
- **Groups** — 12 tables + "what each team needs" outlook (only on started groups), legend.
- **Bracket** — 32 cards, 5 columns, SVG connectors, no inner vertical scrollbar, path-to-final hover trace.
- **Predict** — group ordering, thirds, shuffle/reset/standings, share link (round-trip verified), clear empty-state ("Pick your 8 third-place teams…").
- **Chrome** — timezone picker (22 zones), music toggle (reflects real audio state), ticker (live), footer build/updated.

### Real issues found (small)

1. **[BUG · low severity] ESPN stats miss on simultaneous kickoffs.** `enrichStats()` keys ESPN events by UTC kickoff *minute*. On the final group matchday two matches kick off at the same minute, so they collide on that key — one match maps to the other's ESPN event and silently gets **no** stats. It's self-protecting (parseEspnStats verifies team codes, so it's *missing*, never *wrong*), but ~half the stats will be absent on those days. **Fix:** match ESPN events by teams, not just time.
2. **[SCALE] `results.json` grows.** By the final it'll hold 104 × (events + lineups + stats) ≈ ~150 KB, re-fetched by every client every 90 s (~30 KB gzipped). Fine now; worth splitting the heavy per-match detail (`ev`/`xi`/`stats`) into a lazy-loaded file before knockouts so the polled file stays lean (scores/status only).
3. **[COSMETIC] OG share image is stale** (`assets/og.png?v=18`) — predates every feature added since. Folds into the share-cards item below.

---

## Sequential backlog (attack top-down)

Effort: **S** ≈ <1 session · **M** ≈ a session · **L** ≈ multi-session. Tag = data source / risk.

### Tier 0 — Fix what QC found
1. **ESPN stats: match by teams, not just kickoff minute** — fixes simultaneous-kickoff gaps. **S** · no new deps.

### Tier 1 — Quick, high-delight wins (group-stage timely)
2. **Momentum sparkline** — signed SVG area path built from the minute-stamped `ev[]` we already store; render in the match modal under the stats. Most impactful for live matches. **M** · existing data.
3. **FLIP standings animation** — animate group-table rows when they reorder after a result (measure → reflow → invert → play). Cheap, premium feel. **S** · CSS/JS only.
4. **Compact share links** — replace the ~950-char JSON prediction link with a bit-packed `#p=` (~20–40 chars): permutation index per group, 12-bit thirds mask, winner-bit per KO match, 1-byte schema tag. **M** · client only.

### Tier 2 — Engagement & visuals (bigger bets)
5. **"Share your score"** — score a shared prediction against resolved `results.json` (group-order hits, third-place hits, bracket hits, champion) and show a result card. Builds on #4. **M** · no backend.
6. **Auto-generated share cards** — `satori → @resvg/resvg-js` in the results Action: per-result PNG in `data/og/<num>.png` + a tiny `share/<num>.html` stub for correct OG unfurling. Also regenerates the stale site OG image. **L** · adds npm deps to the Action.
7. **Player photos** — Action pulls TheSportsDB cutouts (`lookupplayer.php?id=`, transparent PNGs) → commit URLs into `squads.json`; show in the roster + formation pitch. Mind the 10-player free cap (page per-player). **M** · TheSportsDB (no key, credit required).

### Tier 3 — Scale & knockout-timely (do before July)
8. **Split heavy match detail out of `results.json`** — keep the polled file to scores/status; lazy-load `ev`/`xi`/`stats` per match on modal open (or one `details.json`). **M** · refactor.
9. **Knockout-path narrative** — template strings walking the `feeds`/`slotInfo` graph ("To reach the final, X must beat the winner of M97, then…"); pairs with the existing visual path-highlight. **S** · existing data.

### Tier 4 — Optional
10. **LLM match previews** — Action writes `data/previews.json` grounded strictly on our computed numbers, with a deterministic template fallback on parse failure. **M** · needs a model key in Actions secrets.
11. **Installable PWA / offline** — manifest + service worker. **Deferred:** a service worker adds a cache layer; given the GitHub-Pages staleness sensitivity, use network-first for HTML/JS/results so it never serves a stale build. **M** · risk noted.
12. **Privacy-friendly analytics** — if you want to know devices/usage (currently zero tracking): one cookieless script (GoatCounter/Plausible/Umami). Small departure from the "no third-party calls" principle. **S** · opt-in.

---

### Recommended first sweep
**#1 (stats fix) → #2 (momentum) → #3 (FLIP standings)** — all small/medium, all timely for the live group stage, no new infrastructure. Then reassess before the bigger bets.
