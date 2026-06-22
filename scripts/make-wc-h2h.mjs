/**
 * Build data/wc-h2h.json — every men's World Cup meeting (1930-2025) between two of the 48 current teams,
 * for the "Past World Cup meetings" block on a projected knockout tie.
 * Sources: jfjelstul/worldcup (public dataset, 1930-2018) + this repo's data/wc2022.json (2022).
 * West Germany folds into Germany (FIFA's own treatment); ambiguous defunct sides (Czechoslovakia, Yugoslavia,
 * Soviet Union, Serbia & Montenegro) are intentionally NOT mapped, so we only ever claim genuine same-nation meetings.
 *   shape: { "<codeA|codeB sorted>": [ {y, r, h, a, hs, as, ph?, pa?} ... ] }   (h/a = home/away code that day)
 * Run:  node scripts/make-wc-h2h.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const teams = JSON.parse(readFileSync("data/teams.json", "utf8"));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const NAME2CODE = {};
for (const [code, t] of Object.entries(teams)) if (t.name) NAME2CODE[norm(t.name)] = code;
Object.assign(NAME2CODE, {   // jfjelstul / historical spellings → current code
  westgermany: "DE", korearepublic: "KR", unitedstates: "US", iriran: "IR", turkey: "TR",
  czechrepublic: "CZ", bosniaandherzegovina: "BA", ivorycoast: "CI", capeverde: "CV", usa: "US",
  zaire: "CD",   // DR Congo competed as Zaire in 1974 (the same nation, renamed) — FIFA's own continuity
});
// a current team that played under a different name back then → surfaced as a "(as …)" note in the head-to-head
const FORMER = { westgermany: "West Germany", zaire: "Zaire" };
const code = name => NAME2CODE[norm(name)] || null;
const resolve = name => ({ code: NAME2CODE[norm(name)] || null, was: FORMER[norm(name)] || null });
const CUR = new Set(Object.keys(teams));

function roundOf(stage) {
  const s = String(stage).toLowerCase();
  if (s === "final") return "Final";
  if (s.includes("third")) return "3rd place";
  if (s.includes("semi")) return "SF";
  if (s.includes("quarter")) return "QF";
  if (s.includes("round of 16")) return "R16";
  if (s.includes("final round")) return "Final round";
  if (s.includes("group") || s.includes("first round")) return "Group";
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function parseCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}

const out = {};
const add = (h, a, hs, as_, y, r, ph, pa, fh, fa) => {
  if (!CUR.has(h) || !CUR.has(a) || h === a) return;
  const key = [h, a].sort().join("|");
  (out[key] ||= []).push({ y, r, h, a, hs, as: as_, ...(ph != null ? { ph, pa } : {}), ...(fh ? { fh } : {}), ...(fa ? { fa } : {}) });
};

// ---- jfjelstul, men's only ----
const csv = await (await fetch("https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/matches.csv")).text();
const lines = csv.split("\n").filter(Boolean);
const H = parseCSVLine(lines[0]); const I = n => H.indexOf(n);
const [iT, iS, iH, iA, iHs, iAs, iPen, iHp, iAp] =
  ["tournament_name", "stage_name", "home_team_name", "away_team_name", "home_team_score", "away_team_score",
   "penalty_shootout", "home_team_score_penalties", "away_team_score_penalties"].map(I);
let jf = 0; const jfYears = new Set();
for (const line of lines.slice(1)) {
  const r = parseCSVLine(line);
  if (/women/i.test(r[iT])) continue;                        // NB: /men's/ alone also matches "Women's" — exclude explicitly
  const H_ = resolve(r[iH]), A_ = resolve(r[iA]); if (!H_.code || !A_.code) continue;
  const y = +(r[iT].match(/^(\d{4})/) || [])[1];
  const pens = r[iPen] === "1" || r[iPen] === "TRUE";
  add(H_.code, A_.code, +r[iHs], +r[iAs], y, roundOf(r[iS]), pens ? +r[iHp] : null, pens ? +r[iAp] : null, H_.was, A_.was);
  jfYears.add(y); jf++;
}

// ---- 2022 fallback (only if the external set hasn't reached 2022 yet) ----
const ST22 = { R16: "R16", QF: "QF", SF: "SF", "3P": "3rd place", FIN: "Final" };
let n22 = 0;
if (!jfYears.has(2022)) {
  const w22 = JSON.parse(readFileSync("data/wc2022.json", "utf8")).matches || [];
  for (const m of w22) {
    if (!CUR.has(m.a) || !CUR.has(m.b)) continue;
    const r = /^[A-L]$/.test(m.st) ? "Group" : (ST22[m.st] || m.st);
    add(m.a, m.b, m.s[0], m.s[1], 2022, r, m.pen ? m.pen[0] : null, m.pen ? m.pen[1] : null);
    n22++;
  }
}

for (const k of Object.keys(out)) out[k].sort((x, y) => x.y - y.y);
writeFileSync("data/wc-h2h.json", JSON.stringify(out));
const pairs = Object.keys(out).length, meetings = Object.values(out).reduce((s, v) => s + v.length, 0);
console.log(`wrote data/wc-h2h.json — ${pairs} pairings, ${meetings} meetings (jfjelstul ${jf} + 2022 ${n22}), ${JSON.stringify(out).length} bytes`);
