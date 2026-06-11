/**
 * Fetches World Cup results from football-data.org and writes data/results.json.
 * Runs in GitHub Actions. Requires env FOOTBALL_DATA_TOKEN (free tier works).
 * No npm dependencies — Node 20+ only.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) { console.error("Missing FOOTBALL_DATA_TOKEN"); process.exit(1); }

const fixtures = JSON.parse(readFileSync("data/matches.json", "utf8")).matches;
const teams = JSON.parse(readFileSync("data/teams.json", "utf8"));

// football-data.org team names → our codes (covers common variants)
const ALIAS = {};
for (const [code, t] of Object.entries(teams)) ALIAS[norm(t.name)] = code;
Object.assign(ALIAS, {
  [norm("United States")]: "US", [norm("USA")]: "US",
  [norm("Korea Republic")]: "KR", [norm("South Korea")]: "KR",
  [norm("Czechia")]: "CZ", [norm("Czech Republic")]: "CZ",
  [norm("Türkiye")]: "TR", [norm("Turkey")]: "TR",
  [norm("Côte d'Ivoire")]: "CI", [norm("Ivory Coast")]: "CI", [norm("Cote d Ivoire")]: "CI",
  [norm("Cabo Verde")]: "CV", [norm("Cape Verde Islands")]: "CV", [norm("Cape Verde")]: "CV",
  [norm("Bosnia and Herzegovina")]: "BA", [norm("Bosnia & Herzegovina")]: "BA",
  [norm("DR Congo")]: "CD", [norm("Congo DR")]: "CD", [norm("Democratic Republic of the Congo")]: "CD",
  [norm("IR Iran")]: "IR", [norm("Iran")]: "IR",
  [norm("Netherlands")]: "NL", [norm("Holland")]: "NL",
});
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}
const toCode = name => ALIAS[norm(name)] || null;

const STATUS = s =>
  ["IN_PLAY"].includes(s) ? "LIVE" :
  ["PAUSED"].includes(s) ? "HT" :
  ["FINISHED"].includes(s) ? "FT" : "SCHED";

const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
  headers: { "X-Auth-Token": TOKEN },
});
if (!r.ok) { console.error("API error", r.status, await r.text()); process.exit(1); }
const api = (await r.json()).matches || [];
console.log(`API returned ${api.length} matches`);

// index our fixtures by day for matching
const byDay = {};
for (const f of fixtures) (byDay[f.utc.slice(0, 10)] ??= []).push(f);

const out = { updated: new Date().toISOString(), matches: {} };
let matched = 0;

for (const am of api) {
  const day = (am.utcDate || "").slice(0, 10);
  const hc = toCode(am.homeTeam?.name), ac = toCode(am.awayTeam?.name);
  const cands = [...(byDay[day] || []), ...(byDay[shift(day, -1)] || []), ...(byDay[shift(day, 1)] || [])];
  let f =
    // exact kickoff time
    cands.find(x => x.utc === am.utcDate) ||
    // both teams known and match a group fixture
    (hc && ac && cands.find(x =>
      (x.home.team === hc && x.away.team === ac) || (x.home.team === ac && x.away.team === hc))) ||
    // single match that day in same city stage
    (cands.length === 1 ? cands[0] : null);
  if (!f) continue;
  matched++;

  const swap = hc && f.home.team && f.home.team !== hc && f.away.team === hc;
  const ft = am.score?.fullTime || {}, pen = am.score?.penalties || {};
  const entry = { st: STATUS(am.status) };
  if (ft.home != null) { entry.h = swap ? ft.away : ft.home; entry.a = swap ? ft.home : ft.away; }
  if (pen.home != null) { entry.hp = swap ? pen.away : pen.home; entry.ap = swap ? pen.home : pen.away; }
  if (am.minute != null) entry.min = am.minute;
  // resolve knockout team names so the bracket fills in
  if (f.stage !== "group") {
    if (hc) entry.ht = swap ? ac : hc;
    if (ac) entry.at = swap ? hc : ac;
  }
  out.matches[f.id] = entry;
}
function shift(day, d) {
  const t = new Date(day + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

console.log(`Matched ${matched}/${api.length} API matches to fixtures`);

/* ---- optional: starting XIs via API-Football (free tier, 100 req/day) ----
   Only polls during match windows (kickoff −90 min → +3 h) to stay in budget. */
const AF_KEY = process.env.API_FOOTBALL_KEY;
if (AF_KEY) {
  try {
    const now = Date.now();
    const inWindow = fixtures.filter(f => {
      const ko = new Date(f.utc).getTime();
      return now > ko - 90 * 60e3 && now < ko + 180 * 60e3;
    });
    if (inWindow.length) {
      const af = async path => {
        const r = await fetch("https://v3.football.api-sports.io" + path, { headers: { "x-apisports-key": AF_KEY } });
        return r.ok ? (await r.json()).response : [];
      };
      const day = new Date().toISOString().slice(0, 10);
      const dayFx = [...await af(`/fixtures?league=1&season=2026&date=${day}`),
                     ...await af(`/fixtures?league=1&season=2026&date=${shift(day, -1)}`)];
      const wanted = dayFx.filter(fx => inWindow.some(f =>
        Math.abs(new Date(fx.fixture.date) - new Date(f.utc)) < 60 * 60e3 &&
        (toCode(fx.teams.home.name) || toCode(fx.teams.away.name))));
      if (wanted.length) {
        const detail = await af(`/fixtures?ids=${wanted.map(fx => fx.fixture.id).join("-")}`);
        for (const fx of detail) {
          if (!fx.lineups || fx.lineups.length < 2) continue;
          const hc = toCode(fx.teams.home.name), ac = toCode(fx.teams.away.name);
          const f = inWindow.find(f => {
            const sh = sideCodes(f);
            return Math.abs(new Date(fx.fixture.date) - new Date(f.utc)) < 60 * 60e3 &&
              (!sh.h || sh.h === hc || sh.h === ac);
          });
          if (!f) continue;
          const fl = fx.lineups.find(l => toCode(l.team?.name) === hc) || fx.lineups[0];
          const al = fx.lineups.find(l => l !== fl) || fx.lineups[1];
          const pack = l => ({
            f: l.formation || "", coach: l.coach?.name || "",
            xi: (l.startXI || []).map(x => [x.player?.number, x.player?.name, x.player?.pos || ""]),
          });
          out.matches[f.id] = { ...(out.matches[f.id] || { st: "SCHED" }), xi: { h: pack(fl), a: pack(al) } };
        }
        console.log("Lineups attached for", detail.filter(fx => fx.lineups?.length >= 2).length, "fixtures");
      }
    } else console.log("No matches in lineup window — skipping API-Football calls");
  } catch (e) { console.warn("Lineup fetch skipped:", e.message); }
} else console.log("API_FOOTBALL_KEY not set — lineups disabled");

function sideCodes(f) {
  return { h: f.home.team || null, a: f.away.team || null };
}

// only write if meaningful change (avoids empty commits)
const path = "data/results.json";
const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const changed = JSON.stringify(prev.matches || {}) !== JSON.stringify(out.matches);
if (changed) {
  writeFileSync(path, JSON.stringify(out));
  console.log("results.json updated");
} else {
  console.log("No score changes — skipping write");
}
