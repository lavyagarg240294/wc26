/**
 * Writes data/results.json for the WC·26 site. Runs in GitHub Actions, Node 20+, no deps.
 *
 * Primary source: worldcup26.ir (free, no key, LIVE in-play scores during the tournament).
 * Fallback:       football-data.org (needs FOOTBALL_DATA_TOKEN) — reliable at full-time,
 *                 used only if worldcup26.ir is unreachable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const fixtures = JSON.parse(readFileSync("data/matches.json", "utf8")).matches;
const teams = JSON.parse(readFileSync("data/teams.json", "utf8"));
const byNum = Object.fromEntries(fixtures.map(f => [f.num, f]));

/* ---------------- primary: worldcup26.ir ---------------- */
async function fromWorldCup26() {
  const [gr, tr] = await Promise.all([
    fetch("https://worldcup26.ir/get/games"),
    fetch("https://worldcup26.ir/get/teams"),
  ]);
  if (!gr.ok || !tr.ok) throw new Error(`wc26.ir HTTP ${gr.status}/${tr.status}`);
  const games = (await gr.json()).games || [];
  const apiTeams = (await tr.json()).teams || [];
  if (!games.length) throw new Error("wc26.ir returned no games");

  // team id → our team code (iso2, with the two GB nations overridden by fifa_code)
  const idCode = {};
  for (const t of apiTeams) {
    let code = String(t.iso2 || "").toUpperCase();
    if (t.fifa_code === "ENG") code = "GB-ENG";
    else if (t.fifa_code === "SCO") code = "GB-SCT";
    if (teams[code]) idCode[t.id] = code;
  }

  const matches = {};
  let live = 0, done = 0;
  for (const g of games) {
    const f = byNum[Number(g.id)]; if (!f) continue;        // game id == our match number
    const fin = String(g.finished).toUpperCase() === "TRUE";
    const te = String(g.time_elapsed || "").toLowerCase().trim();
    let st;
    if (fin) st = "FT";
    else if (["ht", "half", "halftime", "half-time"].includes(te)) st = "HT";
    else if (["notstarted", "", "scheduled", "tbd", "postponed"].includes(te)) st = "SCHED";
    else st = "LIVE";                                        // "live" or a minute number
    const entry = { st };
    if (st !== "SCHED") {
      const h = parseInt(g.home_score, 10), a = parseInt(g.away_score, 10);
      if (Number.isFinite(h)) entry.h = h;
      if (Number.isFinite(a)) entry.a = a;
      const min = parseInt(g.time_elapsed, 10);
      if (Number.isFinite(min)) entry.min = min;
    }
    if (f.stage !== "group") {                              // resolve knockout teams for the bracket
      if (idCode[g.home_team_id]) entry.ht = idCode[g.home_team_id];
      if (idCode[g.away_team_id]) entry.at = idCode[g.away_team_id];
    }
    matches[f.id] = entry;
    if (st === "LIVE" || st === "HT") live++; else if (st === "FT") done++;
  }
  console.log(`worldcup26.ir: ${Object.keys(matches).length} games · ${live} live · ${done} finished`);
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

/* ---------------- run ---------------- */
let matches;
try {
  matches = await fromWorldCup26();
} catch (e) {
  console.warn("Primary source worldcup26.ir failed:", e.message, "— trying football-data.org");
  try { matches = await fromFootballData(); }
  catch (e2) { console.error("Fallback also failed:", e2.message); process.exit(1); }
}

const out = { updated: new Date().toISOString(), matches };
const path = "data/results.json";
const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
if (JSON.stringify(prev.matches || {}) !== JSON.stringify(out.matches)) {
  writeFileSync(path, JSON.stringify(out));
  console.log("results.json updated");
} else {
  console.log("No score changes — skipping write");
}
