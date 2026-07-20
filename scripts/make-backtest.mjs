// Bake data/backtest.json: an HONEST post-tournament scorecard of the site's own win-prob model.
// Leave-prior replay of the PRODUCTION winProb in app.js (vm harness - no reimplementation drift):
// for each of the 104 matches, results/details are stripped to matches with utc STRICTLY earlier
// (blinds simultaneous kickoffs too), the Elo/att-def caches reset, and winProb(m, pre=true) called -
// so every number is what the model would have said before kickoff, blind to the result.
// The one permitted assist: third-place-fed R32 pairings are pinned from results ht/at when slotInfo
// can't resolve them blind - the FIFA allocation was published before kickoff (a matter of record,
// not a prediction); ratings stay leave-prior.
// Run from the repo root: node scripts/make-backtest.mjs   (reads app.js + data/*, writes data/backtest.json)
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

let src = readFileSync("app.js", "utf8");
const anchor = "const groupTeams = g => [...new Set(S.matches.filter(m => m.group === g).flatMap(m => [m.home.team, m.away.team]).filter(Boolean))].sort();";
if (!src.includes(anchor)) { console.error("harness anchor not found - app.js changed; update make-backtest.mjs"); process.exit(1); }
src = src.replace(anchor, anchor + '\nglobalThis.__H = { S, winProb, rebuildMatchData, resetElo: () => { _eloCache = null; _eloSig = ""; _adCache = null; _adSig = ""; } };\nthrow "__STOP__";');

const dummyEl = () => new Proxy(function () {}, {
  get: (t, k) => {
    if (k === Symbol.toPrimitive) return () => "";
    if (k === "style" || k === "classList" || k === "dataset") return dummyEl();
    if (k === "length") return 0;
    return typeof k === "string" && /^(add|remove|set|get|append|insert|toggle|contains|matches|closest|querySelector|addEventListener)/.test(k) ? () => (k.startsWith("querySelector") ? null : undefined) : dummyEl();
  },
  apply: () => dummyEl(),
});
const store = {};
const sandbox = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, RegExp, Map, Set, Promise, Symbol, Proxy, Reflect, Intl, isNaN, parseInt, parseFloat, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: dummyEl(), navigator: { onLine: true, userAgent: "harness" }, location: { hash: "", search: "", href: "" }, history: { replaceState: () => {} },
  fetch: () => new Promise(() => {}), matchMedia: () => ({ matches: false, addEventListener: () => {} }), requestAnimationFrame: () => 0, addEventListener: () => {}, removeEventListener: () => {}, screen: {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 2,
  HTMLDialogElement: Object.assign(function HTMLDialogElement() {}, { prototype: { showModal() {}, close() {} } }), HTMLElement: function () {}, Element: function () {}, Node: function () {}, Image: function () {}, Audio: function () {}, MutationObserver: function () { return { observe: () => {}, disconnect: () => {} }; }, ResizeObserver: function () { return { observe: () => {}, disconnect: () => {} }; }, IntersectionObserver: function () { return { observe: () => {}, disconnect: () => {} }; }, CustomEvent: function () {}, Event: function () {},
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);
try { vm.runInContext(src, ctx, { filename: "app.js" }); } catch (e) { if (e !== "__STOP__") throw e; }
const H = sandbox.__H;

const J = f => JSON.parse(readFileSync("data/" + f, "utf8"));
const matches = J("matches.json").matches, teams = J("teams.json"), results = J("results.json"), details = J("details.json"), efi = J("efi.json").matches;
const byUtc = [...matches].sort((a, b) => a.utc.localeCompare(b.utc) || a.num - b.num);

function setState(beforeUtc) {
  const keep = id => { const m = matches.find(x => x.id === id); return m && m.utc < beforeUtc; };
  const filt = obj => { const o = { matches: {} }; for (const id in obj.matches) if (keep(id)) o.matches[id] = obj.matches[id]; return o; };
  H.S.matches = JSON.parse(JSON.stringify(matches));
  H.S.teams = teams; H.S.results = filt(results); H.S.details = filt(details); H.S.efi = efi; H.S.fifaLive = null;
  H.resetElo(); H.rebuildMatchData();
}

const rows = []; const finals = {}; let fails = 0;
for (const fx of byUtc) {
  const r = results.matches[fx.id];
  if (!r || r.st !== "FT" || r.h == null) { fails++; continue; }
  setState(fx.utc);
  const m = H.S.matches.find(x => x.id === fx.id);
  let wp = null, err = null;
  try { wp = H.winProb(m, true); } catch (e) { err = String(e); }
  if (!wp && r.ht && r.at) {
    m.home = { team: r.ht }; m.away = { team: r.at };
    try { wp = H.winProb(m, true); err = null; } catch (e) { err = String(e); }
  }
  if (!wp) { console.error("NULL/ERR", fx.id, err || "(null)"); fails++; continue; }
  const ko = fx.stage !== "group";
  const act = (ko && (r.rt === 2 || r.rt === 3)) ? "D" : r.h > r.a ? "H" : r.h < r.a ? "A" : "D";   // 90' basis: pens/aet mean level after 90
  const brier = (wp.h - (act === "H")) ** 2 + (wp.d - (act === "D")) ** 2 + (wp.a - (act === "A")) ** 2;
  const pAct = act === "H" ? wp.h : act === "A" ? wp.a : wp.d;
  const pick = wp.h >= wp.d && wp.h >= wp.a ? "H" : wp.a >= wp.d ? "A" : "D";
  let advP = null, advBrier = null, advHit = null;
  if (ko && wp.adv) {
    const hWin = r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1));
    advP = wp.adv.h; advBrier = (wp.adv.h - (hWin ? 1 : 0)) ** 2; advHit = (wp.adv.h >= 0.5) === hWin;
  }
  rows.push({ num: fx.num, id: fx.id, stage: fx.stage, hc: r.ht || m.home?.team, ac: r.at || m.away?.team,
    p: [+wp.h.toFixed(4), +wp.d.toFixed(4), +wp.a.toFixed(4)], act,
    res: r.h + "-" + r.a + (r.rt === 2 ? " p" + r.hp + "-" + r.ap : r.rt === 3 ? " aet" : ""),
    brier: +brier.toFixed(4), pAct: +pAct.toFixed(4), hit: pick === act,
    advP: advP != null ? +advP.toFixed(4) : null, advBrier: advBrier != null ? +advBrier.toFixed(4) : null, advHit });
  if (["sf", "third", "final"].includes(fx.stage))   // the finals-week detail: xG + top scorelines, for the Wrap's story
    finals[fx.id] = { xg: { h: +wp.xg.h.toFixed(2), a: +wp.xg.a.toFixed(2) },
      top: (wp.predicted || []).slice(0, 3).map(c => ({ s: c.h + "-" + c.a, p: +c.p.toFixed(3) })) };
}

const agg = list => {
  const n = list.length;
  return { n, acc: +(list.filter(x => x.hit).length / n * 100).toFixed(1),
    brier: +(list.reduce((s, x) => s + x.brier, 0) / n).toFixed(3),
    logloss: +(list.reduce((s, x) => s - Math.log(Math.max(1e-9, x.pAct)), 0) / n).toFixed(3),
    meanP: +(list.reduce((s, x) => s + x.pAct, 0) / n * 100).toFixed(1) };
};
const grp = rows.filter(x => x.stage === "group"), ko = rows.filter(x => x.stage !== "group");
const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
for (const x of rows) for (const [p, o] of [[x.p[0], x.act === "H"], [x.p[1], x.act === "D"], [x.p[2], x.act === "A"]]) {
  const b = Math.min(9, Math.floor(p * 10)); bins[b].n++; bins[b].p += p; bins[b].o += o ? 1 : 0;
}
const out = {
  updated: new Date().toISOString(),
  note: "Leave-prior replay of the production model: every probability computed blind, from pre-match information only. Not archived live predictions.",
  all: agg(rows), group: agg(grp), ko: agg(ko),
  adv: { n: ko.length, correct: ko.filter(x => x.advHit).length, brier: +(ko.reduce((s, x) => s + x.advBrier, 0) / ko.length).toFixed(3),
    misses: ko.filter(x => !x.advHit).map(x => ({ num: x.num, id: x.id, hc: x.hc, ac: x.ac, advP: x.advP, res: x.res })) },
  bins: bins.map((b, i) => b.n ? { lo: i * 10, n: b.n, meanP: +(b.p / b.n * 100).toFixed(0), real: +(b.o / b.n * 100).toFixed(0) } : null).filter(Boolean),
  finals, rows,
};
writeFileSync("data/backtest.json", JSON.stringify(out));
console.log(`backtest.json: ${rows.length} matches (${fails} skipped) | all acc ${out.all.acc}% brier ${out.all.brier} | KO advance ${out.adv.correct}/${out.adv.n} brier ${out.adv.brier}`);
