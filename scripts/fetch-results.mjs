/**
 * Writes data/results.json for the WC·26 site. Runs in GitHub Actions, Node 20+, no deps.
 *
 * Source chain (first that succeeds wins):
 *   1. PRIMARY  api.fifa.com/api/v3  — free, no key, authoritative. Live score + minute,
 *              and (per in-play / just-finished match) a structured event timeline
 *              (goals / cards / subs with minute + player) + lineups. CORS-enabled, but we
 *              still fetch server-side so a vanished endpoint never breaks a visitor's page.
 *   2. FALLBACK worldcup26.ir       — free, no key. Live score + minute only (no events).
 *   3. FALLBACK football-data.org   — needs FOOTBALL_DATA_TOKEN. Reliable at full-time.
 *
 * Match mapping: FIFA's `MatchNumber` is NOT chronological and does NOT equal our openfootball `num`
 * (FIFA #8 == our m5), so we join feed rows to fixtures by their TEAMS, never by number. FIFA team codes
 * are 3-letter (MEX/RSA/QAT); we learn the 3-letter→our-code map by matching team NAMES against teams.json
 * (44/48 auto; 4 aliases), then pair each row to the fixture with that team pair (knockouts: by kickoff slot).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const fixtures = JSON.parse(readFileSync("data/matches.json", "utf8")).matches;
const teams = JSON.parse(readFileSync("data/teams.json", "utf8"));
const byNum = Object.fromEntries(fixtures.map(f => [f.num, f]));

const UA = "Mozilla/5.0 (compatible; wc26-bot/1.0; +https://github.com/lavyagarg240294/wc26)";
const loc = v => Array.isArray(v) ? (v[0]?.Description || "") : (typeof v === "string" ? v : "");
// "90'+8'" -> 90.08 (sort key that keeps stoppage time after the base minute)
const minKey = s => { const m = String(s || "").match(/(\d+)(?:'?\+(\d+))?/); return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : 0; };

/* ---------------- primary: api.fifa.com ---------------- */
const FIFA = "https://api.fifa.com/api/v3";
const COMP = "17", SEASON = "285023";       // FIFA World Cup 2026™
const LIVE_FETCH_CAP = 14;                  // max per-match live calls per run (spreads a cold start)

async function fifaGet(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`FIFA HTTP ${r.status}`);
  return r.json();
}

// official player photos harvested from FIFA lineups → data/photos.json, keyed "ShortName|CODE"
const harvestedPhotos = {};
function harvestPhotos(team, code) {
  if (!team || !code) return;
  for (const p of (team.Players || [])) {
    const url = p.PlayerPicture?.PictureUrl, nm = loc(p.ShortName) || loc(p.PlayerName);
    if (url && nm) harvestedPhotos[nm + "|" + code] = url;
  }
}
// Build the goals/cards/subs timeline (+ basic lineups) from a FIFA live-match object.
function buildEvents(lv) {
  const sides = [["h", lv.HomeTeam], ["a", lv.AwayTeam]];
  const nameById = {};
  for (const [, t] of sides) for (const p of (t?.Players || []))
    nameById[p.IdPlayer] = loc(p.ShortName) || loc(p.PlayerName);
  const name = id => nameById[id] || "";

  const ev = [];
  for (const [side, t] of sides) {
    if (!t) continue;
    for (const g of (t.Goals || [])) {
      const k = g.Type === 3 ? "OG" : g.Type === 1 ? "P" : "G";   // best-effort: 3=own goal, 1=penalty
      const e = { _k: minKey(g.Minute), t: g.Minute, k, tm: side, p: name(g.IdPlayer) };
      if (g.IdAssistPlayer) e.a = name(g.IdAssistPlayer);
      ev.push(e);
    }
    for (const b of (t.Bookings || []))
      ev.push({ _k: minKey(b.Minute), t: b.Minute, k: b.Card === 2 ? "R" : "Y", tm: side, p: name(b.IdPlayer) });
    for (const s of (t.Substitutions || []))
      ev.push({ _k: minKey(s.Minute), t: s.Minute, k: "S", tm: side, on: loc(s.PlayerOnName) || name(s.IdPlayerOn), off: loc(s.PlayerOffName) || name(s.IdPlayerOff) });
  }
  ev.sort((x, y) => x._k - y._k);
  ev.forEach(e => delete e._k);

  // lineups (starting XI) — Status 1 == starter (2 == bench). Position 0=GK 1=DEF 2=MID 3=FWD.
  const xiSide = t => {
    const starters = (t?.Players || []).filter(p => p.Status === 1)
      .map(p => [p.ShirtNumber, loc(p.ShortName) || loc(p.PlayerName), p.Position]);
    return starters.length ? { f: t.Tactics || "", xi: starters, coach: loc((t.Coaches || [])[0]?.Name) } : null;
  };
  const xh = xiSide(lv.HomeTeam), xa = xiSide(lv.AwayTeam);
  const xi = (xh || xa) ? { h: xh || {}, a: xa || {} } : null;

  return { ev, xi };
}

async function fromFifa(prev, photoCodes) {
  const cal = await fifaGet(`${FIFA}/calendar/matches?idCompetition=${COMP}&idSeason=${SEASON}&language=en&count=104`);
  const rows = cal.Results || [];
  if (!rows.length) throw new Error("FIFA calendar empty");
  // FIFA's MatchNumber is NOT chronological and does NOT equal our openfootball `num` (e.g. FIFA #8 == our m5),
  // so we must never join on it — that writes the live match's score onto the wrong fixture. Identify each feed
  // row by its TEAMS instead. First learn FIFA's 3-letter IdCountry -> our code by matching team names against
  // teams.json (auto-covers 44/48); a few aliases cover the names FIFA spells differently than we do.
  const ALIAS = { KOR: "KR", BIH: "BA", IRN: "IR", COD: "CD" };
  const norm = s => (Array.isArray(s) ? s[0]?.Description : s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const ourByName = {};
  for (const [c, t] of Object.entries(teams)) ourByName[norm(t.name)] = c;
  const toOur = {};                                   // FIFA IdCountry -> our code
  for (const x of rows) for (const s of [x.Home, x.Away]) {
    const id = s?.IdCountry;
    if (id && /^[A-Z]{3}$/.test(id) && !toOur[id]) { const c = ALIAS[id] || ourByName[norm(s.TeamName)]; if (c) toOur[id] = c; }
  }

  // Pair each feed row to our fixture by the unordered pair of teams — robust to FIFA's numbering and to
  // simultaneous kickoffs. Knockout slots stay placeholders in our schedule until the bracket fills, so for
  // those fall back to the kickoff slot (a unique minute); they carry no live data yet anyway.
  const pairKey = (a, b) => [a, b].sort().join("|");
  const byPair = {}, bySlot = {};
  for (const f of fixtures) {
    if (f.home?.team && f.away?.team) byPair[pairKey(f.home.team, f.away.team)] = f;
    (bySlot[(f.utc || "").slice(0, 16)] ??= []).push(f);
  }
  const fifaForFixture = {};
  for (const x of rows) {
    const hc = toOur[x.Home?.IdCountry], ac = toOur[x.Away?.IdCountry];
    let f = (hc && ac) ? byPair[pairKey(hc, ac)] : null;
    if (!f) { const slot = bySlot[(x.Date || "").slice(0, 16)]; if (slot && slot.length === 1) f = slot[0]; }
    if (f && !fifaForFixture[f.id]) fifaForFixture[f.id] = x;
  }

  const now = Date.now();
  const matches = {};
  const needLive = [];
  let liveCount = 0, doneCount = 0;

  for (const f of fixtures) {
    const x = fifaForFixture[f.id]; if (!x) continue;
    const kickoff = Date.parse(x.Date || f.utc);
    const ms = x.MatchStatus;                       // 1 = upcoming, 0 = finished, 3 = live (documented)
    let st;
    if (ms === 1) st = "SCHED";
    else if (ms === 3) st = "LIVE";
    else st = (kickoff && now >= kickoff && now < kickoff + 150 * 60000) ? "LIVE" : "FT"; // hedge ms 0

    const entry = { st };
    // Persist the feed's real kickoff when it drifts from openfootball's static time (>1 min). The static
    // schedule can be hours off the actual FIFA slate; the client overlays `ko` so countdowns, day-grouping
    // and the live hero all agree with reality. Set for every status — SCHED needs it most (future kickoffs).
    if (Number.isFinite(kickoff) && x.Date && Math.abs(kickoff - Date.parse(f.utc)) > 60000)
      entry.ko = new Date(kickoff).toISOString();
    if (st !== "SCHED") {
      if (Number.isFinite(x.HomeTeamScore)) entry.h = x.HomeTeamScore;
      if (Number.isFinite(x.AwayTeamScore)) entry.a = x.AwayTeamScore;
      if (Number.isFinite(x.HomeTeamPenaltyScore)) entry.hp = x.HomeTeamPenaltyScore;
      if (Number.isFinite(x.AwayTeamPenaltyScore)) entry.ap = x.AwayTeamPenaltyScore;
      const mt = parseInt(x.MatchTime, 10);
      if (Number.isFinite(mt)) entry.min = mt;
    }
    if (f.stage !== "group") {                      // resolve knockout teams for the bracket
      if (x.Home?.IdCountry && toOur[x.Home.IdCountry]) entry.ht = toOur[x.Home.IdCountry];
      if (x.Away?.IdCountry && toOur[x.Away.IdCountry]) entry.at = toOur[x.Away.IdCountry];
    }

    const prevE = prev[f.id];
    const inPlay = st === "LIVE" || st === "HT";
    const captured = prevE && prevE.ev;             // already grabbed this finished match's events
    const hc = f.home.team || entry.ht, ac = f.away.team || entry.at;
    const needPhotos = (hc && !photoCodes.has(hc)) || (ac && !photoCodes.has(ac));   // backfill photos for teams we haven't seen
    if (inPlay || (st === "FT" && (!captured || needPhotos))) needLive.push({ f, x, entry });
    else if (st === "FT" && captured) { entry.ev = prevE.ev; if (prevE.xi) entry.xi = prevE.xi; }

    matches[f.id] = entry;
    if (inPlay) liveCount++; else if (st === "FT") doneCount++;
  }

  // enrich in-play + newly-finished matches with events + lineups (bounded per run)
  let fetched = 0;
  for (const { f, x, entry } of needLive) {
    if (fetched >= LIVE_FETCH_CAP) break;
    try {
      const lv = await fifaGet(`${FIFA}/live/football/${COMP}/${SEASON}/${x.IdStage}/${x.IdMatch}?language=en`);
      fetched++;
      if (lv.Period === 4 && entry.st === "LIVE") entry.st = "HT";   // 4 == half-time
      const { ev, xi } = buildEvents(lv);
      if (ev.length) entry.ev = ev;
      if (xi) entry.xi = xi;
      harvestPhotos(lv.HomeTeam, f.home.team || entry.ht); harvestPhotos(lv.AwayTeam, f.away.team || entry.at);
    } catch { /* keep the score-only entry */ }
  }

  console.log(`api.fifa.com: 104 fixtures · ${liveCount} live · ${doneCount} finished · ${fetched} enriched`);
  return matches;
}

/* ---------------- fallback: worldcup26.ir ---------------- */
function parseScorers(s) {
  if (!s || s === "null") return [];
  return String(s).replace(/[{}“”]/g, "").split(",").map(x => x.trim()).filter(x => x && x !== "null").slice(0, 12);
}
async function fromWorldCup26() {
  const [gr, tr] = await Promise.all([
    fetch("https://worldcup26.ir/get/games"),
    fetch("https://worldcup26.ir/get/teams"),
  ]);
  if (!gr.ok || !tr.ok) throw new Error(`wc26.ir HTTP ${gr.status}/${tr.status}`);
  const games = (await gr.json()).games || [];
  const apiTeams = (await tr.json()).teams || [];
  if (!games.length) throw new Error("wc26.ir returned no games");

  const idCode = {};
  for (const t of apiTeams) {
    let code = String(t.iso2 || "").toUpperCase();
    if (t.fifa_code === "ENG") code = "GB-ENG";
    else if (t.fifa_code === "SCO") code = "GB-SCT";
    if (teams[code]) idCode[t.id] = code;
  }
  const matches = {};
  for (const g of games) {
    const f = byNum[Number(g.id)]; if (!f) continue;
    const fin = String(g.finished).toUpperCase() === "TRUE";
    const te = String(g.time_elapsed || "").toLowerCase().trim();
    let st;
    if (fin) st = "FT";
    else if (["ht", "half", "halftime", "half-time"].includes(te)) st = "HT";
    else if (["notstarted", "", "scheduled", "tbd", "postponed"].includes(te)) st = "SCHED";
    else st = "LIVE";
    const entry = { st };
    if (st !== "SCHED") {
      const h = parseInt(g.home_score, 10), a = parseInt(g.away_score, 10);
      if (Number.isFinite(h)) entry.h = h;
      if (Number.isFinite(a)) entry.a = a;
      const min = parseInt(g.time_elapsed, 10);
      if (Number.isFinite(min)) entry.min = min;
      const gh = parseScorers(g.home_scorers), ga = parseScorers(g.away_scorers);
      if (gh.length) entry.gh = gh;
      if (ga.length) entry.ga = ga;
    }
    if (f.stage !== "group") {
      if (idCode[g.home_team_id]) entry.ht = idCode[g.home_team_id];
      if (idCode[g.away_team_id]) entry.at = idCode[g.away_team_id];
    }
    matches[f.id] = entry;
  }
  console.log(`worldcup26.ir (fallback): ${Object.keys(matches).length} games`);
  return matches;
}

/* ---------------- fallback: football-data.org ---------------- */
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
}
const ALIAS = {};
for (const [code, t] of Object.entries(teams)) ALIAS[norm(t.name)] = code;
Object.assign(ALIAS, {
  [norm("United States")]: "US", [norm("USA")]: "US", [norm("Korea Republic")]: "KR", [norm("South Korea")]: "KR",
  [norm("Czechia")]: "CZ", [norm("Czech Republic")]: "CZ", [norm("Türkiye")]: "TR", [norm("Turkey")]: "TR",
  [norm("Côte d'Ivoire")]: "CI", [norm("Ivory Coast")]: "CI", [norm("Cabo Verde")]: "CV", [norm("Cape Verde")]: "CV",
  [norm("Bosnia and Herzegovina")]: "BA", [norm("DR Congo")]: "CD", [norm("Congo DR")]: "CD", [norm("IR Iran")]: "IR",
});
const toCode = name => ALIAS[norm(name)] || null;
const shift = (day, d) => { const t = new Date(day + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

async function fromFootballData() {
  const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
  if (!TOKEN) throw new Error("FOOTBALL_DATA_TOKEN unset");
  const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", { headers: { "X-Auth-Token": TOKEN } });
  if (!r.ok) throw new Error("football-data HTTP " + r.status);
  const api = (await r.json()).matches || [];
  const STATUS = s => s === "IN_PLAY" ? "LIVE" : s === "PAUSED" ? "HT" : s === "FINISHED" ? "FT" : "SCHED";
  const byDay = {};
  for (const f of fixtures) (byDay[f.utc.slice(0, 10)] ??= []).push(f);
  const matches = {};
  for (const am of api) {
    const day = (am.utcDate || "").slice(0, 10);
    const hc = toCode(am.homeTeam?.name), ac = toCode(am.awayTeam?.name);
    const cands = [...(byDay[day] || []), ...(byDay[shift(day, -1)] || []), ...(byDay[shift(day, 1)] || [])];
    const f = cands.find(x => x.utc === am.utcDate) ||
      (hc && ac && cands.find(x => (x.home.team === hc && x.away.team === ac) || (x.home.team === ac && x.away.team === hc))) ||
      (cands.length === 1 ? cands[0] : null);
    if (!f) continue;
    const swap = hc && f.home.team && f.home.team !== hc && f.away.team === hc;
    const ft = am.score?.fullTime || {}, pen = am.score?.penalties || {};
    const entry = { st: STATUS(am.status) };
    if (ft.home != null) { entry.h = swap ? ft.away : ft.home; entry.a = swap ? ft.home : ft.away; }
    if (pen.home != null) { entry.hp = swap ? pen.away : pen.home; entry.ap = swap ? pen.home : pen.away; }
    if (am.minute != null) entry.min = am.minute;
    if (f.stage !== "group") { if (hc) entry.ht = swap ? ac : hc; if (ac) entry.at = swap ? hc : ac; }
    matches[f.id] = entry;
  }
  console.log(`football-data.org (fallback): mapped ${Object.keys(matches).length} matches`);
  return matches;
}

/* ---------------- stats enrichment: ESPN fifa.world (possession/shots/corners) ---------------- */
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
function parseEspnStats(sum, f, entry) {
  const teams = sum.boxscore?.teams || [];
  if (teams.length < 2) return null;
  const num = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); const v = s && parseFloat(s.displayValue); return Number.isFinite(v) ? v : null; };
  const byCode = {};
  for (const t of teams) { const c = toCode(t.team?.displayName); if (c) byCode[c] = t; }
  const H = byCode[f.home.team || entry.ht], A = byCode[f.away.team || entry.at];
  if (!H || !A) return null;
  const pair = name => { const h = num(H, name), a = num(A, name); return (h != null && a != null) ? [h, a] : null; };
  const stats = {};
  for (const [key, espn] of [["poss", "possessionPct"], ["sh", "totalShots"], ["sot", "shotsOnTarget"], ["cor", "wonCorners"], ["fls", "foulsCommitted"]]) {
    const v = pair(espn); if (v) stats[key] = v;
  }
  return Object.keys(stats).length ? stats : null;
}
async function enrichStats(matches, prev) {
  const need = fixtures.filter(f => {
    const e = matches[f.id]; if (!e) return false;
    return e.st === "LIVE" || e.st === "HT" || (e.st === "FT" && !prev[f.id]?.stats);
  });
  for (const f of fixtures) {                              // carry cached stats for finished matches we won't refetch
    const e = matches[f.id];
    if (e && e.st === "FT" && prev[f.id]?.stats && !need.includes(f)) e.stats = prev[f.id].stats;
  }
  if (!need.length) return;
  const dates = [...new Set(need.map(f => f.utc.slice(0, 10).replace(/-/g, "")))];
  const byMin = {};                                        // UTC-minute → [{id, codes:Set<ourCode>}] (≥1 when matches kick off simultaneously)
  for (const d of dates) {
    try {
      const sb = await fetch(`${ESPN}/scoreboard?dates=${d}`, { headers: { "User-Agent": UA } }).then(r => r.json());
      for (const e of (sb.events || [])) {
        if (!e.date) continue;
        const codes = new Set((e.competitions?.[0]?.competitors || []).map(c => toCode(c.team?.displayName)).filter(Boolean));
        (byMin[e.date.slice(0, 16)] ??= []).push({ id: e.id, codes });
      }
    } catch { /* skip this date */ }
  }
  let calls = 0, ok = 0;
  for (const f of need) {
    if (calls >= LIVE_FETCH_CAP) break;
    const entry = matches[f.id], hc = f.home.team || entry.ht, ac = f.away.team || entry.at;
    const cands = byMin[f.utc.slice(0, 16)] || [];
    // pick the event whose teams match this fixture (so simultaneous kickoffs don't collide); fall back to a lone event
    const eid = (cands.find(c => (hc || ac) && (!hc || c.codes.has(hc)) && (!ac || c.codes.has(ac))) || (cands.length === 1 ? cands[0] : null))?.id;
    if (!eid) continue;
    calls++;
    try {
      const sum = await fetch(`${ESPN}/summary?event=${eid}`, { headers: { "User-Agent": UA } }).then(r => r.json());
      const st = parseEspnStats(sum, f, matches[f.id]);
      if (st) { matches[f.id].stats = st; ok++; }
    } catch { /* skip */ }
  }
  if (ok) console.log(`ESPN stats: enriched ${ok} match(es)`);
}

/* ---------------- run ---------------- */
const path = "data/results.json", dPath = "data/details.json";
let prev = {}, prevDetail = {};
try { if (existsSync(path)) prev = JSON.parse(readFileSync(path, "utf8")); } catch { /* malformed/conflicted — overwrite */ }
try { if (existsSync(dPath)) prevDetail = JSON.parse(readFileSync(dPath, "utf8")); } catch { /* ignore */ }
const prevMatches = prev.matches || {}, prevDetailMatches = prevDetail.matches || {};
// the fetch/enrich carry-forward reads ev/xi/stats off the previous entries — those now live in details.json,
// so feed the fetch logic a merged view (slim scores + heavy detail) exactly like the pre-split single file.
const prevMerged = {};
for (const id of new Set([...Object.keys(prevMatches), ...Object.keys(prevDetailMatches)]))
  prevMerged[id] = { ...(prevDetailMatches[id] || {}), ...(prevMatches[id] || {}) };
let prevPhotos = {};
try { if (existsSync("data/photos.json")) prevPhotos = JSON.parse(readFileSync("data/photos.json", "utf8")); } catch { /* ignore */ }
const photoCodes = new Set(Object.keys(prevPhotos).map(k => k.split("|")[1]));

const DRY = process.argv.includes("--dry-run");
let matches;
try {
  matches = await fromFifa(prevMerged, photoCodes);
} catch (e1) {
  console.warn("Primary api.fifa.com failed:", e1.message, "— trying worldcup26.ir");
  try { matches = await fromWorldCup26(); }
  catch (e2) {
    console.warn("worldcup26.ir failed:", e2.message, "— trying football-data.org");
    try { matches = await fromFootballData(); }
    catch (e3) { console.error("All sources failed:", e3.message); process.exit(1); }
  }
}

try { await enrichStats(matches, prevMerged); } catch (e) { console.warn("ESPN stats enrichment failed:", e.message); }

// Split the payload: results.json keeps only the small scores/status fields (it's polled every ~60s by every
// open page); the heavy per-match detail (timeline, lineups, team stats, fallback scorers) goes to details.json,
// fetched by the client only when scores actually change. Keeps the hot-path file tiny once knockouts fill it.
const SLIM = ["st", "h", "a", "hp", "ap", "ht", "at", "min", "ko"];
const slim = {}, detail = {};
for (const [id, m] of Object.entries(matches)) {
  const s = {}, d = {};
  for (const k in m) (SLIM.includes(k) ? s : d)[k] = m[k];
  slim[id] = s;
  if (Object.keys(d).length) detail[id] = d;
}
const now = new Date().toISOString();
if (DRY) {
  const ev = Object.entries(detail).filter(([, m]) => m.ev).map(([id, m]) => `${id}:${m.ev.length}ev`);
  console.log("DRY RUN — not writing. matches:", Object.keys(slim).length, "| detail rows:", Object.keys(detail).length, "| with events:", ev.join(", ") || "none");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(detail).slice(0, 1)), null, 1));
} else {
  if (JSON.stringify(prevMatches) !== JSON.stringify(slim)) {
    writeFileSync(path, JSON.stringify({ updated: now, matches: slim }));
    console.log("results.json updated");
  } else console.log("No score changes — skipping results.json");
  if (JSON.stringify(prevDetailMatches) !== JSON.stringify(detail)) {
    writeFileSync(dPath, JSON.stringify({ updated: now, matches: detail }));
    console.log("details.json updated");
  } else console.log("No detail changes — skipping details.json");
}

// player photos: merge newly-harvested into data/photos.json (write only when changed)
if (!DRY && Object.keys(harvestedPhotos).length) {
  const pPath = "data/photos.json";
  let prevPhotos = {};
  try { if (existsSync(pPath)) prevPhotos = JSON.parse(readFileSync(pPath, "utf8")); } catch { /* overwrite */ }
  const merged = { ...prevPhotos, ...harvestedPhotos };
  if (JSON.stringify(prevPhotos) !== JSON.stringify(merged)) {
    writeFileSync(pPath, JSON.stringify(merged));
    console.log(`photos.json updated (${Object.keys(merged).length} players)`);
  }
}
