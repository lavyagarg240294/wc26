#!/usr/bin/env node
// Per-player tournament stat summary for the semi-finalists, baked into data/playerstats.json.
// Source: FIFA's public data hub (fdh-api.fifa.com) — the same per-player physical/performance data behind the distance
// leaderboard, but the fuller set: distance, top speed, sprints, shots (+ on target), xG, passes (+ completed).
// We aggregate each player's stats across every match their team has played, keyed by team code + shirt number so the
// client joins them to the player sheet exactly (jersey is unique within a squad). Scoped to the four semi-finalists for
// now — widen SF simply by editing the map. Post-match data; a match joins the moment FIFA's data hub has it.
import fs from "fs";

// our code -> FIFA 3-letter IdCountry, for the teams we aggregate
const SF = { "FR": "FRA", "ES": "ESP", "GB-ENG": "ENG", "AR": "ARG" };
const BY_IDC = Object.fromEntries(Object.entries(SF).map(([c, id]) => [id, c]));
const COMP = "17", SEASON = "285023";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GET = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch { /* retry */ } await sleep(500); } return null; };
const num = v => (typeof v === "number" && isFinite(v)) ? v : 0;

const cal = await GET(`https://api.fifa.com/api/v3/calendar/matches?idCompetition=${COMP}&idSeason=${SEASON}&language=en&count=104`);
const rows = cal?.Results || [];
if (!rows.length) { console.error("no calendar rows — FIFA unreachable; keeping existing playerstats.json"); process.exit(0); }

const byTeam = {};   // ourCode -> { shirt: {num, name, m, min, km, sh, sot, xg, pass, passC, spd, sprints} }
let matchesDone = 0;
for (const x of rows) {
  if (x.Home?.Score == null || !x.IdStage || !x.IdMatch) continue;                 // only played matches
  const ifes = x.Properties?.IdIFES; if (!ifes) continue;
  const idcs = [x.Home?.IdCountry, x.Away?.IdCountry];
  if (!idcs.some(id => BY_IDC[id])) continue;                                        // only matches involving a semi-finalist
  const fdh = await GET(`https://fdh-api.fifa.com/v1/stats/match/${ifes}/players.json`);
  const live = await GET(`https://api.fifa.com/api/v3/live/football/${COMP}/${SEASON}/${x.IdStage}/${x.IdMatch}?language=en`);
  await sleep(150);
  if (!fdh || !live) continue;
  for (const side of ["HomeTeam", "AwayTeam"]) {
    const team = live[side]; const code = BY_IDC[team?.IdCountry]; if (!code) continue;   // aggregate only the semi-finalist's own players
    const T = (byTeam[code] ||= {});
    for (const p of (team.Players || [])) {
      const st = Object.fromEntries((fdh[String(p.IdPlayer)] || []).filter(t => Array.isArray(t) && t.length >= 2).map(t => [t[0], t[1]]));
      const min = num(st.TimePlayed), shirt = p.ShirtNumber;
      if (!min || shirt == null) continue;                                          // unused sub / no tracking row
      const a = (T[shirt] ||= { num: shirt, name: ((p.PlayerName || [{}])[0].Description || "").trim(), m: 0, min: 0, km: 0, sh: 0, sot: 0, xg: 0, pass: 0, passC: 0, spd: 0, sprints: 0 });
      a.m++; a.min += min; a.km += num(st.TotalDistance) / 1000; a.spd = Math.max(a.spd, num(st.TopSpeed));
      a.sprints += num(st.Sprints); a.sh += num(st.AttemptAtGoal); a.sot += num(st.AttemptAtGoalOnTarget);
      a.xg += num(st.XG); a.pass += num(st.Passes); a.passC += num(st.PassesCompleted);
    }
  }
  matchesDone++;
  process.stderr.write(`\r${matchesDone} SF matches aggregated`);
}
process.stderr.write("\n");

// round, and drop the internal sums we don't display raw
const out = {};
for (const [code, players] of Object.entries(byTeam)) {
  out[code] = Object.values(players).map(a => ({
    num: a.num, name: a.name, m: a.m, min: Math.round(a.min),
    km: +a.km.toFixed(1), spd: +a.spd.toFixed(1), sprints: Math.round(a.sprints),
    sh: Math.round(a.sh), sot: Math.round(a.sot), xg: +a.xg.toFixed(1),
    pass: Math.round(a.pass), passC: Math.round(a.passC),
  })).sort((x, y) => y.km - x.km);
}
fs.writeFileSync("data/playerstats.json", JSON.stringify({ updated: null, teams: Object.keys(out), byTeam: out }));
const n = Object.values(out).reduce((a, p) => a + p.length, 0);
console.log(`wrote data/playerstats.json: ${Object.keys(out).length} teams, ${n} players`);
