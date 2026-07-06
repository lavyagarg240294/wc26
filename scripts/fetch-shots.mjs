#!/usr/bin/env node
// Bake every finished match's shot coordinates into data/shots.json, for the tournament-wide shot map in Stats.
// Same source the client already uses per-match (FIFA v3 timelines), but fetched server-side once and committed, so the
// Stats page can draw all ~2000 shots without hammering the FIFA API from every visitor's browser.
// Shots are normalized so BOTH teams attack the top goal (x<50 -> 180deg rotation), matching mdShotMap.
import fs from "fs";

const COMP = "17", SEASON = "285023";
const ALIAS = { KOR: "KR", BIH: "BA", IRN: "IR", COD: "CD" };
const norm = s => { const v = Array.isArray(s) ? (s[0]?.Description || "") : (s && typeof s === "object" ? (s.Description || "") : s); return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, ""); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GET = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (r.ok) return await r.json(); } catch { /* retry */ } await sleep(600); } return null; };

const matches = JSON.parse(fs.readFileSync("data/matches.json", "utf8")).matches;
const teams = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const results = (() => { try { return JSON.parse(fs.readFileSync("data/results.json", "utf8")).matches || {}; } catch { return {}; } })();
const byNum = {}; for (const m of matches) byNum[m.num] = m;
const byName = {}; for (const [c, t] of Object.entries(teams)) byName[norm(t.name)] = c;

const cal = await GET(`https://api.fifa.com/api/v3/calendar/matches?idCompetition=${COMP}&idSeason=${SEASON}&language=en&count=104`);
const rows = cal?.Results || [];
if (!rows.length) { console.error("no calendar rows - FIFA unreachable; keeping existing shots.json"); process.exit(0); }

// FIFA IdCountry (3-letter) -> our code
const toOur = {};
for (const x of rows) for (const s of [x.Home, x.Away]) { const id = s?.IdCountry; if (id && /^[A-Z]{3}$/.test(id) && !toOur[id]) { const c = ALIAS[id] || byName[norm(s.TeamName)]; if (c) toOur[id] = c; } }

const out = {};
let done = 0, shotTotal = 0;
for (const x of rows) {
  if (!x.IdStage || !x.IdMatch) continue;
  const m = byNum[Number(x.MatchNumber)]; if (!m) continue;
  const r = results[m.id];
  const finished = r && (r.st === "FT" || r.st === "AWD") && r.h != null;   // only settled matches (shots are final)
  if (!finished) continue;
  const homeId = x.Home?.IdTeam;
  const hc = toOur[x.Home?.IdCountry] || r.ht, ac = toOur[x.Away?.IdCountry] || r.at;   // FIFA's home/away codes
  const myH = m.home?.team || r.ht, myA = m.away?.team || r.at;                          // OUR home/away (the client's convention)
  const tl = await GET(`https://api.fifa.com/api/v3/timelines/${COMP}/${SEASON}/${x.IdStage}/${x.IdMatch}?language=en`);
  await sleep(250);
  const evs = tl?.Event || tl?.Events || []; if (!evs.length) continue;
  const descName = e => { const d = (e.EventDescription?.[0]?.Description) || ""; const i = d.indexOf(" ("); return (i > 0 ? d.slice(0, i) : d).trim(); };
  const seen = new Map(), shots = [];
  for (const e of evs) {
    if (e.PositionX == null || ![12, 0, 41].includes(e.Type)) continue;
    let px = +e.PositionX, py = +e.PositionY; if (px < 50) { px = 100 - px; py = 100 - py; }   // rotate so all attack the top goal
    const goal = e.Type === 0 || e.Type === 41;
    const shooter = e.IdTeam === homeId ? hc : ac;
    const side = shooter && shooter === myA ? 1 : 0;   // 0 = our home, 1 = our away (handles FIFA's home/away being flipped from ours)
    const key = `${e.MatchMinute}|${e.IdPlayer}`;
    const s = [Math.round(px), Math.round(py), goal ? 1 : 0, side, e.MatchMinute || "", descName(e)];   // [x, y, goal, side, minute, player]
    if (seen.has(key)) { if (goal) seen.get(key)[2] = 1; } else { seen.set(key, s); shots.push(s); }   // merge the goal+attempt logged at one spot
  }
  if (shots.length) { out[m.id] = { h: myH, a: myA, st: m.stage, s: shots }; shotTotal += shots.length; }
  done++;
  process.stderr.write(`\r${done} matches · ${shotTotal} shots`);
}
process.stderr.write("\n");

fs.writeFileSync("data/shots.json", JSON.stringify({ updated: new Date().toISOString(), matches: out }));
console.log(`wrote data/shots.json: ${Object.keys(out).length} matches, ${shotTotal} shots`);
