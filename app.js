/* WC·26 companion — vanilla JS, no build step */
(() => {
"use strict";

/* ---------------- state ---------------- */
const S = {
  matches: [], teams: {}, results: { matches: {} }, details: { matches: {} }, matchData: {},
  reports: { matches: {} }, commentary: {},   // credited match reports (reports.json) + lazy per-match live commentary
  tz: localStorage.getItem("wc26.tz") || "auto",
  fav: localStorage.getItem("wc26.fav") || null,
  view: "matches",
  filters: { stage: "all", team: "", saved: false },
  saved: new Set(JSON.parse(localStorage.getItem("wc26.saved") || "[]")),
  sim: JSON.parse(localStorage.getItem("wc26.sim") || "null") || { order: {}, thirds: [], ko: {} },
  _lastResults: null, lastChecked: null,
};
// a committed match report (reports.json), keyed by openfootball match number; null until the Action writes one
const report = m => (S.reports.matches || {})[m.num] || null;
const isSaved = id => S.saved.has(id);
function toggleSave(id) {
  S.saved.has(id) ? S.saved.delete(id) : S.saved.add(id);
  localStorage.setItem("wc26.saved", JSON.stringify([...S.saved]));
  RENDER[S.view]();
  const md = document.getElementById("matchDialog");
  if (md && md.open && md.dataset.openMid === id) {
    const b = md.querySelector(".md-save"), on = S.saved.has(id);
    if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "★" : "☆"; b.title = on ? "Saved" : "Save match"; b.setAttribute("aria-label", on ? "Remove from saved" : "Save match"); }
  }
}
const AUTO_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const tz = () => (S.tz === "auto" ? AUTO_TZ : S.tz);
const GROUPS = "ABCDEFGHIJKL".split("");
const BUILD = "172";  // shown in footer; bump with the ?v= asset version

const ZONES = [
  ["auto", "Auto (device)"],
  ["Asia/Dubai", "Dubai, UAE"], ["Asia/Riyadh", "Riyadh, Saudi Arabia"], ["Asia/Karachi", "Karachi, Pakistan"],
  ["Asia/Kolkata", "Mumbai, India"], ["Asia/Singapore", "Singapore"], ["Asia/Tokyo", "Tokyo, Japan"],
  ["Australia/Sydney", "Sydney, Australia"], ["Europe/London", "London, UK"], ["Europe/Paris", "Paris, France"],
  ["Europe/Istanbul", "Istanbul, Türkiye"], ["Africa/Cairo", "Cairo, Egypt"], ["Africa/Lagos", "Lagos, Nigeria"],
  ["Africa/Johannesburg", "Johannesburg, South Africa"], ["America/Sao_Paulo", "São Paulo, Brazil"],
  ["America/New_York", "New York, USA"], ["America/Toronto", "Toronto, Canada"], ["America/Chicago", "Chicago, USA"],
  ["America/Denver", "Denver, USA"], ["America/Mexico_City", "Mexico City, Mexico"],
  ["America/Los_Angeles", "Los Angeles, USA"], ["America/Vancouver", "Vancouver, Canada"],
];

/* ---------------- utils ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// open a <dialog> modally — closing first if it's already open (re-entering the same sheet from a
// stacked context would otherwise throw InvalidStateError on Safari/Firefox, or silently update the
// hidden dialog underneath on Chromium). Brings the sheet to the front with its fresh content.
const showSheet = d => { if (!d) return; if (d.open) d.close(); d.showModal(); d.querySelectorAll(".sheet-body").forEach(b => b.scrollTop = 0); };
// A collapsible section inside a sheet that opens off-screen feels like nothing happened — scroll it into view.
document.addEventListener("toggle", e => {
  const d = e.target;
  if (d.tagName === "DETAILS" && d.open && d.closest(".sheet-body")) requestAnimationFrame(() => d.scrollIntoView({ behavior: "smooth", block: "nearest" }));
}, true);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// real SVG flags (self-hosted) — emoji regional-indicator flags don't render on Windows, where the
// whole flag-heavy UI would degrade to "BR"/"US" letter boxes. alt falls back to the code if a file 404s.
function flag(code) {
  if (!code) return "";
  return `<img class="flagimg" src="assets/flags/${code}.svg" alt="${esc(S.teams?.[code]?.name || "")}" loading="lazy" decoding="async">`;
}
// consistent inline-SVG content icons (replacing eclectic emoji in stat/record headings). The thematic
// ⚽ / ${TROPHY} / ★ are kept as-is. Stroke style matches the UI's SVG chrome.
const _ico = p => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = {
  spark: _ico('<path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/>'),
  net: _ico('<rect x="3" y="7" width="18" height="11" rx="1"/><path d="M3 11h18M3 14.5h18M8 7v11M13 7v11M18 7v11"/>'),
  bolt: _ico('<path d="M13 2 5 13.5h6l-1 8.5 9-12.5h-6z"/>'),
  clock: _ico('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/>'),
  glove: _ico('<path d="M8.5 13V8a1.5 1.5 0 0 1 3 0M11.5 12V6a1.5 1.5 0 0 1 3 0v6M14.5 11.5V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6 5 5 0 0 1-5-5l-1-2.6a1.5 1.5 0 0 1 2.6-1.4l.9 1.5"/>'),
  ball: _ico('<circle cx="12" cy="12" r="9"/><path d="M12 9l2.85 2.07-1.09 3.36h-3.52L9.15 11.07z"/><path d="M12 9V4.5M14.85 11.07l3.7-1.3M13.76 14.43l1.8 3.1M10.24 14.43l-1.8 3.1M9.15 11.07l-3.7-1.3"/>'),
  trophy: _ico('<path d="M7 4h10v4.5a5 5 0 0 1-10 0z"/><path d="M7 6.3H4.6A2.2 2.2 0 0 0 7 8.6M17 6.3h2.4A2.2 2.2 0 0 1 17 8.6M12 13.5v2.8M9.5 19.5h5M10 16.3h4"/>'),
  people: _ico('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6M17.2 13.6a5.5 5.5 0 0 1 3.3 5.9"/>'),
  link: _ico('<path d="M10.6 13.4a3.4 3.4 0 0 0 4.8 0l2.4-2.4a3.4 3.4 0 0 0-4.8-4.8l-1.2 1.2M13.4 10.6a3.4 3.4 0 0 0-4.8 0L6.2 13a3.4 3.4 0 0 0 4.8 4.8l1.2-1.2"/>'),
  camera: _ico('<rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.3"/><path d="M8.5 7l1.2-2.2h4.6L15.5 7"/>'),
  tap: _ico('<path d="M9 11.2V6a1.5 1.5 0 0 1 3 0v4M12 10V8a1.5 1.5 0 0 1 3 0v2.5M15 10.5v-1a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-.7a4 4 0 0 1-2.9-1.2L7 16a1.45 1.45 0 0 1 2.1-2l.9.9"/>'),
  subs: _ico('<path d="M4 9h12M13 6l3 3-3 3M20 15H8M11 12l-3 3 3 3"/>'),       // two opposing arrows — substitution
  compare: _ico('<path d="M4 20h16M7.5 20v-6M12 20V5M16.5 20v-9"/>'),         // bars — compare two players
};
const TROPHY = `<span class="ico-gold">${ICO.trophy}</span>`;   // gold-tinted trophy (replaces the old emoji)
const fmt = (iso, opts) => new Intl.DateTimeFormat("en", { timeZone: tz(), ...opts }).format(new Date(iso));
const timeStr = iso => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
// The matches LIST groups by the real, technical calendar date in the visitor's timezone — Sunday's matches under
// "Sunday", a 2am-Monday kickoff under "Monday". Straightforward and correct.
const dayKey = iso => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = iso => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
// The "viewing day" is slate-aware — it rolls over at ~10am LOCAL, not midnight — so the TICKER and MATCH OF THE DAY
// treat a night's football as one block even when it runs past midnight (for Dubai the WC slate is 8pm–8am, India
// 9pm–9am, with a long match-free gap through the local daytime where 10am sits). Only those two use it; the list
// above stays on the calendar date.
const DAY_ROLLOVER_H = 10;
// en-CA → "2026-06-14": a SORTABLE practical-day key (used for equality + ordering by the ticker window + match-of-day).
const viewDay = iso => new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.parse(iso) - DAY_ROLLOVER_H * 36e5));
// uniform offset label everywhere ("GMT+4", "GMT-5", "GMT+5:30") — not the mixed EST/IST/GMT+N that "short" gives
const tzShort = () => {
  try { return new Intl.DateTimeFormat("en", { timeZone: tz(), timeZoneName: "shortOffset" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value.replace(/^GMT$/, "GMT+0"); }
  catch { return tz(); }
};
const tzOffsetLabel = zone => {
  try {
    const p = new Intl.DateTimeFormat("en", { timeZone: zone === "auto" ? AUTO_TZ : zone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return p.find(x => x.type === "timeZoneName").value.replace(/^GMT$/, "GMT+0");   // GMT everywhere (matches tzShort), incl. GMT+0 for London
  } catch { return ""; }
};
// numeric GMT offset in minutes (handles DST + half-hour zones) — used to order the picker west→east
const tzMinutes = zone => { try { const v = new Intl.DateTimeFormat("en", { timeZone: zone === "auto" ? AUTO_TZ : zone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value; const mm = v.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/); return mm ? (mm[1] === "-" ? -1 : 1) * (+mm[2] * 60 + (+mm[3] || 0)) : 0; } catch { return 0; } };
// friendly CITY name for the active zone — from the ZONES list if listed, else the IANA city. Always a city
// (never a country/region) so every place the timezone is shown reads the same way.
const tzCity = () => (ZONES.find(z => z[0] === tz())?.[1]) || tz().split("/").pop().replace(/_/g, " ");

/* ---------------- results / resolution ---------------- */
// scores (results.json, polled) + heavy detail (details.json, fetched on change) are merged into
// S.matchData so every renderer keeps reading one object per match via res().
const res = m => S.matchData[m.id] || null;
function rebuildMatchData() {
  const r = S.results.matches || {}, d = S.details.matches || {}, out = {};
  for (const id in d) out[id] = { ...d[id] };
  for (const id in r) out[id] = { ...(out[id] || {}), ...r[id] };   // fresh scores win over (possibly older) detail
  S.matchData = out;
  applyKickoffs();
}
// openfootball's static kickoff times can drift hours from the real FIFA slate; the scores Action persists the
// feed's true kickoff as `ko` (results.json) when it differs. Overlay it onto each match's `utc` so countdowns,
// day-grouping, sorting and the live hero all agree with reality — every renderer reads `m.utc`, so one overlay
// fixes them all. The original static time is kept in `_utc0` so the overlay is idempotent and reverts if `ko` clears.
function applyKickoffs() {
  if (!S.matches) return;
  const now = Date.now();
  for (const m of S.matches) {
    if (m._utc0 === undefined) m._utc0 = m.utc;
    const md = S.matchData[m.id];
    let ko = md?.ko;
    // Use the feed's corrected kickoff (`ko`) when it drifted from openfootball's static time; otherwise the
    // static time. We deliberately do NOT synthesize a kickoff from `now − feed_minute` for a live match — the
    // free feed's minute is unreliable and that estimate drifted the displayed kickoff (e.g. showing 03:51 for
    // a match that kicked off at 03:00). The authoritative `ko` lands within a poll or two and fixes any wrong
    // static time on its own.
    m.utc = ko || m._utc0;
  }
}
const ST = { SCHED: "SCHED", LIVE: "LIVE", HT: "HT", FT: "FT" };
function status(m) {
  const r = res(m);
  // The FIFA feed is authoritative for status — trust it. (We used to promote a "started by our clock but
  // still SCHED" match to LIVE to mask feed lag, but openfootball's static kickoff times don't always match
  // the real schedule, so that faked a live 0–0 on the wrong match. The feed says which game is actually live.)
  if (r?.st) {
    // A feed stuck on LIVE/HT long past any real match length is stale (the score loop lagged or stopped) — treat it
    // as finished so the hero stops showing it "live" and it drops into Earlier results. Group ≈ 90+HT+stoppage
    // (~125′); knockouts allow extra time + penalties (~160′).
    if ((r.st === ST.LIVE || r.st === ST.HT) && Date.now() - +new Date(m.utc) > (m.stage === "group" ? 125 : 160) * 60000) return ST.FT;
    return r.st;
  }
  // no feed row yet (only before the very first Action run): best-effort from the scheduled time
  return new Date(m.utc) <= new Date() && new Date() - new Date(m.utc) < 3 * 3600e3 ? ST.LIVE : ST.SCHED;
}
// live match clock: exact minute from the feed if present, else an estimate from kickoff
// (the free feed often only flags "live" with no minute). Estimate allows for a 15′ half-time.
function clockStr(m, r) {
  if (r && r.min != null) return r.min + "′";
  const real = Math.floor((Date.now() - new Date(m.utc).getTime()) / 60000);
  if (real < 0) return "";
  const est = real <= 45 ? real : Math.max(46, real - 15);
  return (est >= 90 ? "90+" : est) + "′";
}
function slotInfo(m, side) {
  const s = m[side];
  const r = res(m);
  const code = s.team || (r && r[side === "home" ? "ht" : "at"]) || winnerFeed(s);
  if (code && S.teams[code]) return { code, name: S.teams[code].name };
  return { name: s.ph || "TBD", ph: true, short: s.short };
}
function winnerFeed(s) {
  const num = s.feeds || s.feedsL;
  if (!num) return null;
  const fm = S.matches.find(x => x.num === num && x.stage !== "group");
  if (!fm) return null;
  const r = res(fm);
  if (!r || r.st !== ST.FT) return null;
  if (r.h === r.a && r.hp == null && r.ap == null) return null;   // FT level but penalties not in the feed yet — leave unresolved, don't guess (and propagate) a winner
  const hWin = r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1));
  const h = slotInfo(fm, "home").code, a = slotInfo(fm, "away").code;
  if (!h || !a) return null;
  return s.feeds ? (hWin ? h : a) : (hWin ? a : h);
}
const isFavMatch = m => S.fav && (slotInfo(m, "home").code === S.fav || slotInfo(m, "away").code === S.fav);
const matchHasTeam = (m, code) => slotInfo(m, "home").code === code || slotInfo(m, "away").code === code;

// a team's last-5 finished results, oldest→newest: [{o:"W"|"D"|"L", gf, ga, m, opp}]
function teamForm(code) {
  return S.matches
    .filter(m => matchHasTeam(m, code) && status(m) === ST.FT && res(m)?.h != null)
    .sort((a, b) => a.utc.localeCompare(b.utc)).slice(-5)
    .map(m => {
      const r = res(m), home = slotInfo(m, "home").code === code;
      const gf = home ? r.h : r.a, ga = home ? r.a : r.h;
      let o = gf > ga ? "W" : gf < ga ? "L" : "D";
      if (gf === ga && r.hp != null) o = (home ? r.hp > r.ap : r.ap > r.hp) ? "W" : "L";
      return { o, gf, ga, m, opp: slotInfo(m, home ? "away" : "home") };
    });
}
function formChips(code) {
  const f = teamForm(code);
  if (!f.length) return "";
  return `<span class="form" aria-label="Recent form">${f.map(x =>
    `<span class="form-d is-${x.o.toLowerCase()}" title="${x.o} ${x.gf}–${x.ga} v ${esc(x.opp.name || x.opp.code || "")}">${x.o}</span>`).join("")}</span>`;
}

/* ---------------- calendar (.ics) export — client-side, kickoffs in UTC ---------------- */
const CAL_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
// webcal:// URL to a committed static calendar (data/ics/…) for an auto-updating subscription.
// Derived from the current page so it works wherever the site is hosted.
const webcalURL = file => "webcal://" + location.origin.replace(/^https?:\/\//, "") + location.pathname.replace(/[^/]*$/, "") + "data/ics/" + file;
const icsEsc = s => String(s).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
const icsStamp = iso => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function icsFold(line) { let o = ""; while (line.length > 73) { o += line.slice(0, 73) + "\r\n "; line = line.slice(73); } return o + line; }
function matchVEVENT(m) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const title = `${h.code ? h.name : slotText(m, "home", h)} v ${a.code ? a.name : slotText(m, "away", a)}`;
  const stage = m.group ? `Group ${m.group}` : m.round;
  const start = icsStamp(m.utc), end = icsStamp(new Date(new Date(m.utc).getTime() + 115 * 60000).toISOString());
  return [
    "BEGIN:VEVENT", `UID:wc26-m${m.num}@wc26.site`, `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${start}`, `DTEND:${end}`,
    icsFold(`SUMMARY:${icsEsc(title + " — " + stage)}`),
    icsFold(`LOCATION:${icsEsc(m.stadium + ", " + m.city)}`),
    icsFold(`DESCRIPTION:${icsEsc("FIFA World Cup 2026 · " + stage + " · Match " + m.num)}`),
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT60M", icsFold(`DESCRIPTION:${icsEsc(title + " kicks off in 1 hour")}`), "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}
function downloadICS(matches, name) {
  if (!matches.length) return;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WC26//Companion//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    icsFold(`X-WR-CALNAME:${icsEsc(name)}`), ...matches.map(matchVEVENT), "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[^\w]+/g, "-").toLowerCase().replace(/^-|-$/g, "") + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- standings ---------------- */
// rank a group's rows by FIFA regulations art.13: points → head-to-head (points/GD/goals among the teams level
// on points) → overall GD → overall goals → FIFA World Ranking. (Reg step 2f, conduct/cards, isn't reliably in
// the free feed, so it's omitted — the ranking step decides the rest. Never alphabetical.)
function fifaSort(rows, gm, statuses) {
  const sts = statuses || [ST.FT];
  const gd = r => r.gf - r.ga;
  const byPts = {}; rows.forEach(r => (byPts[r.pts] || (byPts[r.pts] = [])).push(r));
  const out = [];
  for (const pts of Object.keys(byPts).map(Number).sort((a, b) => b - a)) {
    const cohort = byPts[pts];
    if (cohort.length > 1) {
      const set = new Set(cohort.map(r => r.code)), h = {};
      cohort.forEach(r => h[r.code] = { pts: 0, gd: 0, gf: 0 });
      for (const m of gm) {
        const r = res(m); if (!r || r.h == null || !sts.includes(r.st)) continue;
        const H = m.home.team, A = m.away.team; if (!set.has(H) || !set.has(A)) continue;     // matches AMONG the tied cohort only
        h[H].gf += r.h; h[H].gd += r.h - r.a; h[A].gf += r.a; h[A].gd += r.a - r.h;
        if (r.h > r.a) h[H].pts += 3; else if (r.h < r.a) h[A].pts += 3; else { h[H].pts++; h[A].pts++; }
      }
      cohort.sort((x, y) =>
        h[y.code].pts - h[x.code].pts || h[y.code].gd - h[x.code].gd || h[y.code].gf - h[x.code].gf ||   // step 1: head-to-head
        gd(y) - gd(x) || y.gf - x.gf ||                                                                  // step 2: overall GD, goals
        tiebreakRank(x.code) - tiebreakRank(y.code));                                                    // step 3: FIFA World Ranking
    }
    out.push(...cohort);
  }
  return out;
}
function standings(group) {
  const rows = {};
  const gm = S.matches.filter(m => m.group === group);
  gm.forEach(m => [m.home.team, m.away.team].forEach(c => {
    if (c && !rows[c]) rows[c] = { code: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }));
  gm.forEach(m => {
    const r = res(m);
    if (!r || r.st !== ST.FT || r.h == null) return;
    const H = rows[m.home.team], A = rows[m.away.team];
    if (!H || !A) return;
    H.p++; A.p++; H.gf += r.h; H.ga += r.a; A.gf += r.a; A.ga += r.h;
    if (r.h > r.a) { H.w++; A.l++; H.pts += 3; }
    else if (r.h < r.a) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  });
  return fifaSort(Object.values(rows), gm);
}

// "what each team needs" — enumerate every remaining-result combo in a group.
// Ranks use points only, with ties resolved pessimistically (worst) for guarantees and
// optimistically (best) for elimination, so claims hold regardless of goal difference.
function groupOutlook(g) {
  const gm = S.matches.filter(m => m.group === g);
  const codes = [...new Set(gm.flatMap(m => [m.home.team, m.away.team]).filter(Boolean))];
  if (codes.length < 4) return null;
  const done = m => res(m)?.st === ST.FT && res(m)?.h != null;
  const played = gm.filter(done), rem = gm.filter(m => !done(m));
  if (!played.length || !rem.length) return null;          // only meaningful once underway, before it's settled
  const base = {}; codes.forEach(c => base[c] = 0);
  played.forEach(m => { const r = res(m); if (r.h > r.a) base[m.home.team] += 3; else if (r.h < r.a) base[m.away.team] += 3; else { base[m.home.team]++; base[m.away.team]++; } });

  const ranksFor = (fixed, pool) => {                      // worst(pessimistic)+best(optimistic) rank per team
    const range = {}; codes.forEach(c => range[c] = { B: 4, W: 1 });
    const combos = Math.pow(3, pool.length);
    for (let i = 0; i < combos; i++) {
      const pts = { ...base, ...fixed }; let x = i;
      for (const m of pool) { const o = x % 3; x = (x - o) / 3;
        if (o === 0) pts[m.home.team] += 3; else if (o === 1) { pts[m.home.team]++; pts[m.away.team]++; } else pts[m.away.team] += 3; }
      codes.forEach(c => {
        const above = codes.filter(k => k !== c && pts[k] > pts[c]).length;
        const eq = codes.filter(k => k !== c && pts[k] === pts[c]).length;
        range[c].B = Math.min(range[c].B, 1 + above);
        range[c].W = Math.max(range[c].W, 1 + above + eq);
      });
    }
    return range;
  };

  const range = ranksFor({}, rem);
  const nmOf = c => S.teams[c]?.name || c;
  return codes.map(c => {
    const { B, W } = range[c];
    let status, k;
    if (W <= 1) { status = "Group winners — confirmed"; k = "q"; }
    else if (W <= 2) { status = "Through to the last 32"; k = "q"; }
    else if (B <= 2) { status = "Still in the top-two race"; k = "live"; }
    else if (B === 3) { status = "3rd place — chasing a best-eight spot"; k = "third"; }
    else { status = "Eliminated"; k = "out"; }
    // concrete "what they need" — resolvable once a team has a single group game left to play, naming the
    // opponent and the exact result. winW/drawW = worst finish if they win/draw; winB = best finish if they win.
    let need = "";
    const mine = rem.filter(m => m.home.team === c || m.away.team === c);
    if (mine.length === 1 && W > 1 && B <= 3) {
      const mc = mine[0], opp = mc.home.team === c ? mc.away.team : mc.home.team, others = rem.filter(m => m !== mc), on = nmOf(opp);
      const winW = ranksFor({ [c]: base[c] + 3, [opp]: base[opp] }, others)[c].W;
      const drawW = ranksFor({ [c]: base[c] + 1, [opp]: base[opp] + 1 }, others)[c].W;
      const winB = ranksFor({ [c]: base[c] + 3, [opp]: base[opp] }, others)[c].B;
      if (W <= 2) need = `already through — ${on} decides top spot`;
      else if (drawW <= 2) need = `a draw with ${on} is enough for the top 2`;
      else if (winW <= 2) need = `beat ${on} to be sure of the top 2`;
      else if (winB <= 2) need = `beat ${on}, then hope other results help`;
      else need = `a win over ${on} keeps best-eight hopes alive`;
    }
    return { code: c, status, k, need };
  }).sort((a, b) => standings(g).findIndex(r => r.code === a.code) - standings(g).findIndex(r => r.code === b.code));
}
function groupOutlookHTML(g) {
  const o = groupOutlook(g);
  if (!o) return "";
  const open = S.fav && groupOf(S.fav) === g ? " open" : "";   // auto-expand the favourite's group
  return `<details class="outlook"${open}><summary><span class="ear-tri">▸</span> What each team needs</summary>
    <div class="outlook-body">${o.map(t => `<div class="ol-row ol-${t.k} ${t.code === S.fav ? "is-fav" : ""}">
      <span class="fl">${flag(t.code)}</span><span class="ol-name">${esc(S.teams[t.code]?.name || t.code)}</span>
      <span class="ol-status">${t.status}${t.need ? ` · <b>${t.need}</b>` : ""}</span></div>`).join("")}</div></details>`;
}

/* ---------------- theming ---------------- */
function applyTheme(animateFrom) {
  const root = document.documentElement;
  const t = S.fav && S.teams[S.fav];
  const k1 = t ? t.c1 : "", k2 = t ? t.c2 : "";   // raw kit colours (used as-is for confetti)
  root.style.setProperty("--acc1", t ? readableAccent(k1, k2) : "var(--pitch)");   // contrast-guarded accent for text/buttons
  root.style.setProperty("--acc2", t ? (tooLight(k2) ? "#0D1B2A" : k2) : "#0D1B2A");
  $("#teamChipFlag").innerHTML = t ? flag(S.fav) : "⚽";
  $("#teamChipName").textContent = t ? t.name : "Pick a team";
  if (animateFrom && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const sw = $("#themeSweep"), r = animateFrom.getBoundingClientRect();
    sw.style.left = r.left + r.width / 2 - innerWidth + "px";
    sw.style.top = r.top + r.height / 2 - innerHeight + "px";
    sw.style.width = innerWidth * 2 + "px"; sw.style.height = innerHeight * 2 + "px";
    sw.classList.remove("go"); void sw.offsetWidth; sw.classList.add("go");
    confetti(k1 || "#0BA360", k2 || "#E8B931");
  }
}
const tooLight = hex => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 200;
};
// WCAG relative luminance + contrast ratio, used to keep the team-themed accent readable on paper.
const relLum = hex => { const n = parseInt(hex.slice(1), 16); const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
const contrastRatio = (a, b) => { const x = relLum(a) + .05, y = relLum(b) + .05; return x > y ? x / y : y / x; };
const scaleRGB = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = i => Math.max(0, Math.min(255, Math.round(i * f))); return "#" + ((1 << 24) + (c(n >> 16 & 255) << 16) + (c(n >> 8 & 255) << 8) + c(n & 255)).toString(16).slice(1); };
// pick the team kit colour that reads best on the paper background, then darken it until it clears a
// 3.5:1 contrast ratio — so bright mid-tones (orange, sky-blue) stay on-brand but legible, and pale
// kits (yellow/white) fall back to their darker secondary rather than a washed-out accent.
function readableAccent(c1, c2) {
  const PAPER = "#FAFBF9";
  const best = [c1, c2].filter(Boolean).sort((a, b) => contrastRatio(b, PAPER) - contrastRatio(a, PAPER))[0] || "#0BA360";
  let f = 1; while (f > 0.15 && contrastRatio(scaleRGB(best, f), PAPER) < 3.5) f -= 0.05;
  return scaleRGB(best, f);
}

/* ---------------- confetti ---------------- */
function confetti(c1, c2, origin) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("#confetti"), ctx = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const ox = origin?.x ?? innerWidth / 2, oy = origin?.y ?? innerHeight * .25;
  const ps = Array.from({ length: 110 }, () => ({
    x: ox + (Math.random() - .5) * 120, y: oy,
    vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 3,
    s: Math.random() * 7 + 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
    c: [c1, c2, "#FFFFFF", "#E8B931"][Math.random() * 4 | 0],
  }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .32; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 85);
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (++t < 90) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ---------------- football + goal celebration ---------------- */
// Spinning live/goal ball: the classic black-&-white football (Wikimedia Commons "Soccerball.svg", CC0 / public domain).
const BALL = `<img src="assets/football.svg" alt="" decoding="async">`;
const ballSVG = cls => `<span class="ball ${cls || ""}" aria-hidden="true">${BALL}</span>`;

function goalCelebration(code) {
  const t = code && S.teams[code];
  confetti(t ? t.c1 : "#0BA360", t ? t.c2 : "#E8B931");
  goalHorn();
  const toast = document.createElement("div");
  toast.className = "goal-toast";
  toast.innerHTML = `${ballSVG("goal-ball")}<div class="goal-txt"><b>GOAL!</b>${code ? `<span>${flag(code)} ${esc(S.teams[code].name)}</span>` : ""}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2700);
}
// compare previous vs new results; fire a celebration when a LIVE score ticks up
function celebrateGoals(prev, now) {
  let celebrated = false;   // one visual horn/confetti per refresh, but announce every goal + status change for screen readers
  for (const id in now) {
    const a = prev[id], b = now[id]; if (!a || !b) continue;
    const m = S.matches.find(x => x.id === id); if (!m) continue;
    const hs = slotInfo(m, "home"), as = slotInfo(m, "away");
    const score = `${hs.name} ${b.h ?? 0}, ${as.name} ${b.a ?? 0}`;
    // a new goal — counts even when this poll also flipped the match to FT (the late winner), which the old guard missed
    if (((b.h || 0) + (b.a || 0)) > ((a.h || 0) + (a.a || 0)) && [ST.LIVE, ST.HT, ST.FT].includes(b.st)) {
      const scorer = slotInfo(m, (b.h || 0) > (a.h || 0) ? "home" : "away").code;
      if (!celebrated) { goalCelebration(scorer); maybeNotifyGoal(m, b, scorer); celebrated = true; }
      announce(`Goal! ${S.teams[scorer]?.name || ""}. ${score}.`);   // raw text — announce() sets textContent
    } else if (a.st !== b.st && b.st === ST.HT) announce(`Half-time. ${score}.`);
    else if (a.st !== b.st && b.st === ST.FT) announce(`Full time. ${score}.`);
  }
}
// polite screen-reader live region; clear-then-set so an identical message re-announces
function announce(msg) {
  const el = $("#liveAnnounce"); if (!el) return;
  el.textContent = ""; requestAnimationFrame(() => { el.textContent = msg; });
}
/* ---------------- match alerts (opt-in, while the tab is open) ---------------- */
// Goals + kickoff reminders for the favourite team. No push backend — these fire from the same 60s
// poll while the page is open, and only when the tab is in the background (when you're looking at the
// page, the on-screen toast/horn already signal a goal).
function notifyEnabled() { return localStorage.getItem("wc26.notify") === "on" && "Notification" in window && Notification.permission === "granted"; }
function notify(title, body) {
  if (!notifyEnabled() || !document.hidden) return;
  try { new Notification(title, { body, icon: "assets/icon-192.png", tag: "wc26", renotify: true }); } catch { /* blocked mid-session */ }
}
function maybeNotifyGoal(m, r, scorerCode) {
  if (!isFavMatch(m)) return;
  const nm = s => s.code ? (S.teams[s.code]?.name || s.code) : (s.name || "TBD");
  notify(scorerCode === S.fav ? "⚽ GOAL — your team!" : "Goal conceded", `${nm(slotInfo(m, "home"))} ${r.h}–${r.a} ${nm(slotInfo(m, "away"))}`);
}
const _koAlerted = new Set();
function checkKickoffAlert() {
  if (!notifyEnabled() || !S.fav) return;
  const now = Date.now();
  for (const m of S.matches) {
    if (!isFavMatch(m) || status(m) !== ST.SCHED || _koAlerted.has(m.id)) continue;
    const mins = (+new Date(m.utc) - now) / 60000;
    if (mins > 0 && mins <= 6) {
      _koAlerted.add(m.id);
      const opp = slotInfo(m, slotInfo(m, "home").code === S.fav ? "away" : "home");
      notify(`⏰ ${S.teams[S.fav].name} kick off soon`, `vs ${opp.code ? S.teams[opp.code]?.name : (opp.name || "TBD")} · ${timeStr(m.utc)}`);
    }
  }
}

/* ---------------- ticker ---------------- */
function renderTicker() {
  // Two practical days at once: the PREVIOUS day's final scores + the CURRENT day's matches (kickoff times →
  // live → finals as they play). At each ~10am boundary the window slides forward one day — today's finals become
  // the "previous", tomorrow's fixtures become the new "current". Always relevant: what just happened + what's next.
  const cur = viewDay(new Date().toISOString());
  const byDay = {};
  for (const m of S.matches) (byDay[viewDay(m.utc)] ??= []).push(m);
  const days = Object.keys(byDay).sort();
  const curDay = byDay[cur] ? cur : days.find(d => d > cur);                                   // today's slate, or the next one with matches
  const prevDay = curDay ? [...days].reverse().find(d => d < curDay) : days[days.length - 1];  // last completed slate
  const todays = [...(byDay[prevDay] || []), ...(byDay[curDay] || [])].sort((a, b) => a.utc.localeCompare(b.utc));
  const wrap = $("#ticker");
  if (!todays.length) { wrap.hidden = true; return; }
  const item = m => {
    const h = slotInfo(m, "home"), a = slotInfo(m, "away"), r = res(m), st = status(m);
    const mid = [ST.LIVE, ST.HT].includes(st)
      ? `<span class="tk-live">● ${r?.h ?? 0}–${r?.a ?? 0}</span>`
      : st === ST.FT ? (r?.h != null ? `<b>${r.h}–${r.a}</b> FT` : `<b>FT</b>`)
      : `<span class="tk-acc">${timeStr(m.utc)}</span>`;
    const nm = s => s.code ? `${flag(s.code)} ${esc(S.teams[s.code]?.name || s.code)}` : "TBD";
    return `<span class="ticker-item">${nm(h)} ${mid} ${nm(a)}</span>`;
  };
  const sep = '<span class="tk-sep">／</span>';
  const track = $("#tickerTrack");
  const built = todays.map(item).join(sep);
  track.classList.remove("is-static");
  track.innerHTML = built;
  wrap.hidden = false;
  // scroll as a seamless marquee whenever the content is wider than the strip (any number of matches);
  // only centre it static when it genuinely fits — so nothing ever gets clipped. (reading scrollWidth forces layout)
  if (track.scrollWidth > wrap.clientWidth + 4) {
    track.innerHTML = built + sep + built;   // duplicate → the -50% translate loops seamlessly
  } else {
    track.classList.add("is-static");
  }
}
const shortName = code => {
  const n = S.teams[code]?.name || code;
  return n.length > 11 ? (code.includes("-") ? code.slice(3) : code) : n;
};

/* ---------------- render: shared match card ---------------- */
function matchCard(m, i, opts = {}) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const r = res(m), st = status(m);
  const fav = isFavMatch(m);
  const stageL = m.group ? `Group ${m.group}` : m.round;
  const live = st === ST.LIVE || st === ST.HT;
  const score = r && r.h != null;   // a real, feed-reported scoreline
  const sh = r?.h ?? 0, sa = r?.a ?? 0;   // display score — a live match with no goal data shows 0–0
  const winH = score && st === ST.FT && (r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1)));
  const winA = score && st === ST.FT && (r.a > r.h || (r.h === r.a && (r.ap ?? -1) > (r.hp ?? -1)));
  const badge = st === ST.LIVE ? `<span class="badge live">${clockStr(m, r) || "Live"}</span>`
    : st === ST.HT ? `<span class="badge live">HT</span>`
    : st === ST.FT ? `<span class="badge ft">FT</span>`
    : "";   // scheduled: kickoff time already shows on the left — don't repeat it on the right
  const teamRow = (s, key, lost) =>
    `<div class="mcard-team ${s.ph ? "is-ph" : ""} ${lost ? "is-lost" : ""}">` +
    `<span class="fl">${s.code ? flag(s.code) : "·"}</span><span>${esc(slotText(m, key, s))}</span></div>`;
  const sv = isSaved(m.id);
  // The card body is the primary button; the save-star is a SIBLING <button>, not nested inside it
  // (nesting two interactive controls is invalid ARIA — screen readers announce it ambiguously). The
  // .mcard-wrap carries the list spacing + entrance animation and is the positioning context for the star.
  return `<div class="mcard-wrap" style="--i:${i}">
    <div class="mcard ${fav ? "is-fav" : ""}" role="button" tabindex="0" data-mid="${m.id}">
    <div class="mcard-row">
      <div class="mcard-time">${timeStr(m.utc)}<small>${fmt(m.utc, { day: "numeric", month: "short" })}</small></div>
      <div class="mcard-teams">${teamRow(h, "home", winA)}${teamRow(a, "away", winH)}</div>
      <div class="mcard-right">${(score || live)
        ? `<div class="mcard-score${live ? " is-live" : ""}"><span class="${winA ? "lo" : ""}">${sh}</span><span class="${winH ? "lo" : ""}">${sa}</span>${r?.hp != null ? `<span class="pens">(${r.hp}–${r.ap} pens)</span>` : ""}</div>${live ? badge : ""}`
        : badge}</div>
    </div>
    ${(() => { const s = matchStakes(m); return s && s.definitive ? `<div class="mcard-stake">${s.lines[0]}</div>` : ""; })()}
    ${opts.sub !== false ? `<div class="mcard-sub"><span class="grp">${esc(stageL)}</span><span>${esc(m.stadium)}</span><span>${esc(m.city)}</span><span class="mcard-go">Details ›</span></div>` : ""}
    </div>
    <button class="mcard-star ${sv ? "is-on" : ""}" data-save="${m.id}" aria-pressed="${sv}" aria-label="${sv ? "Remove from saved" : "Save match"}" title="${sv ? "Saved" : "Save match"}">${sv ? "★" : "☆"}</button>
  </div>`;
}
// split a starting XI into {gk, bands[]} using its formation string (fallback: coarse positions)
function formationRows(side) {
  const ps = (side.xi || []).slice();
  if (ps.length < 11) return null;
  const gk = ps.find(p => p[2] === 0) || ps[0];
  const out = ps.filter(p => p !== gk);
  let lines = String(side.f || "").split(/[-–]/).map(n => parseInt(n, 10)).filter(n => n > 0);
  if (lines.reduce((s, n) => s + n, 0) !== out.length) lines = null;     // formation doesn't fit → fall back
  let bands;
  if (lines) { bands = []; let i = 0; for (const n of lines) { bands.push(out.slice(i, i + n)); i += n; } }
  else bands = [1, 2, 3].map(pp => out.filter(p => p[2] === pp)).filter(b => b.length);
  return { gk, bands };
}
const lastName = n => { const t = String(n || "").trim().split(/\s+/); return t[t.length - 1] || String(n || ""); };
function pitchSide(side, s, home) {
  const fr = formationRows(side); if (!fr) return null;
  const c1 = (s.code && S.teams[s.code]?.c1) || "#1f2937", c2 = (s.code && S.teams[s.code]?.c2) || "#ffffff";
  const nb = fr.bands.length;
  const dot = (p, x, depth) => {                                        // depth 0 = own goal, 1 = halfway
    const top = home ? 96 - depth * 44 : 4 + depth * 44;               // home bottom half, away top half
    const left = home ? x : 100 - x;
    const photo = playerPhoto(p[1], s.code);
    const face = photo
      ? `<span class="pp-dot pp-photo" style="background-image:url('${photo}')"><i>${p[0] ?? ""}</i></span>`
      : `<span class="pp-dot">${p[0] ?? ""}</span>`;
    return `<div class="pp pp-clk" data-player="${esc(p[1])}|${s.code}" role="button" tabindex="0" style="left:${left}%;top:${top}%;--pc:${c1};--pt:${c2}">${face}<span class="pp-name">${esc(lastName(p[1]))}</span></div>`;
  };
  let html = dot(fr.gk, 50, 0.06);                                     // keep GK just off the goal line
  fr.bands.forEach((band, bi) => {
    const depth = (bi + 1) / (nb + 0.5);                              // last line stops short of halfway
    band.forEach((p, pi) => html += dot(p, (pi + 1) / (band.length + 1) * 100, depth));
  });
  return html;
}
function xiPanel(xi, h, a) {
  const ph = pitchSide(xi.h, h, true), pa = pitchSide(xi.a, a, false);
  if (ph && pa) {
    const tag = (s, side) => `<span class="pitch-team"><span class="fl">${s.code ? flag(s.code) : ""}</span>${esc(s.name)}${side.f ? ` <b>${esc(side.f)}</b>` : ""}</span>`;
    return `<div class="pitch-head">${tag(h, xi.h)}${tag(a, xi.a)}</div>
      <div class="pitch"><svg class="pitch-lines" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1" y="1" width="98" height="148"/><line x1="1" y1="75" x2="99" y2="75"/>
        <circle cx="50" cy="75" r="11"/><circle class="pf" cx="50" cy="75" r="0.9"/>
        <rect x="28" y="1" width="44" height="22"/><rect x="40" y="1" width="20" height="8"/>
        <rect x="28" y="127" width="44" height="22"/><rect x="40" y="141" width="20" height="8"/>
      </svg>${ph}${pa}</div>
      ${(xi.h.coach || xi.a.coach) ? `<div class="pitch-coaches"><span>${xi.h.coach ? "Coach · " + esc(xi.h.coach) : ""}</span><span>${xi.a.coach ? "Coach · " + esc(xi.a.coach) : ""}</span></div>` : ""}`;
  }
  const col = (side, s) => `<div class="xi-col">
    <div class="xi-head"><span>${s.code ? flag(s.code) : ""} ${esc(s.name)}</span>${side.f ? `<b>${esc(side.f)}</b>` : ""}</div>
    ${(side.xi || []).map(p => `<div class="xi-p"><span>${p[0] ?? ""}</span>${esc(p[1] || "")}</div>`).join("")}
    ${side.coach ? `<div class="xi-coach">Coach · ${esc(side.coach)}</div>` : ""}
  </div>`;
  return `<div class="mcard-xi">${col(xi.h, h)}${col(xi.a, a)}</div>`;
}
// goals/cards/subs timeline for the match modal (from results `ev`)
const EV_ICON = {
  G: ICO.ball, P: ICO.ball, OG: ICO.ball,
  Y: `<span class="tl-card y" aria-hidden="true"></span>`,
  R: `<span class="tl-card r" aria-hidden="true"></span>`,
  S: `<span class="tl-sub">${ICO.subs}</span>`,
};
function evText(e, code) {
  const P = (n, cls) => `<span class="${cls} tl-clk" data-player="${esc(n)}|${code}" role="button" tabindex="0">${esc(n)}</span>`;
  if (e.k === "S") return `${e.on ? P(e.on, "tl-p tl-in") : ""}${e.off ? P(e.off, "tl-off tl-out") : ""}`;
  const tag = e.k === "P" ? ` <span class="tl-x">pen</span>` : e.k === "OG" ? ` <span class="tl-x">o.g.</span>` : "";
  return `${e.p ? P(e.p, "tl-p") : ""}${tag}${e.a ? P(e.a, "tl-off") : ""}`;
}
function mdTimeline(r, hc, ac) {
  if (!r?.ev?.length) return "";
  const rows = r.ev.map(e => {
    // `tm` is the team the event counts FOR; for an own goal that's the beneficiary, but the scorer belongs to
    // the OTHER team — so link the player to their real side, else the tap opens the wrong team and the photo misses.
    const scorerCode = e.k === "OG" ? (e.tm === "h" ? ac : hc) : (e.tm === "h" ? hc : ac);
    return `<div class="tl ${e.tm === "h" ? "is-h" : "is-a"}${["G", "P", "OG"].includes(e.k) ? " is-goal" : ""}">
    <div class="tl-min">${esc(e.t || "")}</div>
    <span class="tl-ev"><span class="tl-tx">${evText(e, scorerCode)}</span>${EV_ICON[e.k] ? `<span class="tl-ic">${EV_ICON[e.k]}</span>` : ""}</span>
  </div>`;
  }).join("");
  return `<div class="eyebrow">Match events</div><div class="md-tl">${rows}</div>`;
}
const STAT_ROWS = [
  ["poss", "Possession", "%"],
  ["sh", "Shots"], ["sot", "On target"], ["blk", "Blocked"],
  ["sv", "Saves"], ["cor", "Corners"], ["off", "Offsides"],
  ["pass", "Passes"], ["cross", "Crosses"], ["lball", "Long balls"],
  ["tkl", "Tackles"], ["intc", "Interceptions"], ["clr", "Clearances"],
  ["fls", "Fouls"], ["yc", "Yellow cards"],
];
const statBar = ([hv, av], label, suf = "") => {
  const tot = (hv + av) || 1, hp = Math.round(hv / tot * 100);
  return `<div class="st-row">
    <span class="st-v${hv >= av ? " st-hi" : ""}">${hv}${suf}</span>
    <span class="st-label">${label}</span>
    <span class="st-v st-v-a${av >= hv ? " st-hi" : ""}">${av}${suf}</span>
    <span class="st-bar"><i class="st-h" style="width:${hp}%"></i><i class="st-a" style="width:${100 - hp}%"></i></span>
  </div>`;
};
function mdStats(r) {
  if (!r?.stats) return "";
  const s = r.stats, parts = [];
  for (const [k, label, suf] of STAT_ROWS) {
    if (!Array.isArray(s[k])) continue;
    parts.push(statBar(s[k], label, suf));
    // derive pass accuracy from the accurate/total counts (ESPN's passPct ships as a 0-1 fraction, so we don't store it)
    if (k === "pass" && Array.isArray(s.passT) && s.passT[0] && s.passT[1])
      parts.push(statBar([Math.round(s.pass[0] / s.passT[0] * 100), Math.round(s.pass[1] / s.passT[1] * 100)], "Pass accuracy", "%"));
  }
  if (!parts.length) return "";
  // summarize-then-expand: lead the popup with a one-line headline; the full 16-stat panel + performers are one tap deep
  const head = Array.isArray(s.poss) ? `${s.poss[0]}%–${s.poss[1]}% possession · ${parts.length} stats` : `${parts.length} stats`;
  return `<details class="md-fold"><summary><span>Match stats</span><small>${head}</small></summary>
    <div class="md-fold-body"><div class="md-stats">${parts.join("")}</div>${mdLeaders(r)}</div></details>`;
}
// per-team standout performers (top shooter / passer / defender / keeper) — names are display-only
function mdLeaders(r) {
  if (!r?.lead?.length) return "";
  const CAT = [["totalShots", "Shots"], ["accuratePasses", "Passes"], ["defensiveInterventions", "Defensive actions"], ["saves", "Saves"]];
  const byCat = {}; for (const L of r.lead) (byCat[L.k] ||= []).push(L);
  const rows = CAT.filter(([k]) => byCat[k]).map(([k, label]) =>
    `<div class="ld-row"><span class="ld-cat">${label}</span><span class="ld-ps">${byCat[k].map(L => `<span class="ld-p">${flag(L.c)} <b>${esc(L.n)}</b> <em>${esc(L.v)}</em></span>`).join("")}</span></div>`).join("");
  return rows ? `<div class="eyebrow">Key performers</div><div class="md-leaders">${rows}</div>` : "";
}
const evMin = s => { const m = String(s || "").match(/(\d+)(?:'?\+(\d+))?/); return m ? +m[1] + (m[2] ? +m[2] / 100 : 0) : 0; };
// "match flow" — the running lead (home − away) over the timeline, as a signed area
// kit colours off the shirt can be near-white or near-black — invisible on the card. Nudge each into a
// readable band for the current theme so the match-flow fill (and its legend swatch) always reads.
function flowColor(hex) {
  let c = String(hex || "").replace("#", "");
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  if (c.length !== 6) return currentDark() ? "#9FB2C4" : "#5B6B7A";
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (!currentDark() && lum > 0.68) { const f = 0.58 / lum; r *= f; g *= f; b *= f; }            // light kit on paper → darken
  else if (currentDark() && lum < 0.34) { const t = 165; r += (t - r) * 0.55; g += (t - g) * 0.55; b += (t - b) * 0.55; } // dark kit on dark card → lift
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
function mdFlow(r, h, a) {
  if (!r) return "";   // no data row yet (scheduled match / empty results.json / offline) — guard like mdStats/mdTimeline
  const goals = (r.ev || []).filter(e => ["G", "P", "OG"].includes(e.k));
  if (goals.length < 2) return "";
  const end = Math.max(90, ...goals.map(g => evMin(g.t)));
  let lead = 0; const pts = [[0, 0]];
  goals.forEach(g => { pts.push([evMin(g.t), lead]); lead += g.tm === "h" ? 1 : -1; pts.push([evMin(g.t), lead]); });
  pts.push([end, lead]);
  const maxAbs = Math.max(1, ...pts.map(p => Math.abs(p[1])));
  const W = 100, H = 44, mid = H / 2, sx = m => (m / end * W).toFixed(1), sy = v => (mid - v / maxAbs * (mid - 4)).toFixed(1);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0])} ${sy(p[1])}`).join(" ");
  const area = `M0 ${mid} ` + pts.map(p => `L${sx(p[0])} ${sy(p[1])}`).join(" ") + ` L${W} ${mid} Z`;
  const hc = flowColor((h.code && S.teams[h.code]?.c1) || "#0BA360"), ac = flowColor((a.code && S.teams[a.code]?.c1) || "#5B6B7A");
  const gid = `flowg-${h.code || "h"}${a.code || "a"}`;
  return `<div class="eyebrow">Match flow</div>
    <div class="md-flow"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
        <stop offset="0" stop-color="${hc}" stop-opacity=".92"/><stop offset="48%" stop-color="${hc}" stop-opacity=".26"/>
        <stop offset="52%" stop-color="${ac}" stop-opacity=".26"/><stop offset="1" stop-color="${ac}" stop-opacity=".92"/></linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" class="flow-mid"/><path d="${line}" class="flow-line"/></svg>
    <div class="flow-legend"><span><i style="background:${hc}"></i>${esc(h.code ? h.name : "Home")} ahead</span>
      <span>${esc(a.code ? a.name : "Away")} ahead<i style="background:${ac}"></i></span></div></div>`;
}
const STAGE_NAME = { r32: "Round of 32", r16: "Round of 16", qf: "Quarter-final", sf: "Semi-final", final: "Final", third: "3rd place" };
// narrative breadcrumb of where this match's winner goes, all the way to the final
function koPath(m) {
  if (!m || m.stage === "group") return "";
  const tgt = {}, byNum = {};
  S.matches.forEach(x => { byNum[x.num] = x; if (x.stage !== "group") [x.home, x.away].forEach(s => { if (s.feeds) tgt[s.feeds] = x.num; }); });
  const chain = []; for (let n = m.num; n != null && byNum[n] && !chain.includes(byNum[n]); n = tgt[n]) chain.push(byNum[n]);
  if (chain.length < 2) return "";
  const steps = chain.slice(1).map(x => `${STAGE_NAME[x.stage] || x.stage}<small>M${x.num}</small>`);
  return `<div class="md-kopath"><span class="kp-label">Winner's road →</span> ${steps.join(`<span class="kp-arr">›</span>`)}</div>`;
}
// win-probability — a bivariate-Poisson goals model. Team strength is each side's World Football Elo rating
// (seeded snapshot in teams.json), nudged by current-tournament form; the Elo gap sets the goal supremacy that
// splits the two scoring rates. Scorelines are summed with a Dixon-Coles low-score correction (independent
// Poisson under-counts draws). In-play, the rates scale to the minutes remaining and the live scoreline is
// carried as a head-start. A clearly-labelled model estimate — not a feed/betting value.
const _FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];
const _pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / _FACT[k];
const DC_RHO = 0.11;   // Dixon-Coles draw-inflation parameter (their paper lands ~0.13 for low-scoring leagues)
// Dixon-Coles τ: nudges the four low scores independent Poisson gets wrong (mutual caution correlates 0-0/1-1 up).
const _dcTau = (x, y, lh, la) =>
  x === 0 && y === 0 ? 1 - lh * la * DC_RHO :
  x === 0 && y === 1 ? 1 + lh * DC_RHO :
  x === 1 && y === 0 ? 1 + la * DC_RHO :
  x === 1 && y === 1 ? 1 - DC_RHO : 1;
function teamRating(code) {
  const t = S.teams[code]; if (!t) return 1700;
  // base = seeded World Football Elo; nudge by in-tournament form, bounded so a couple of group games can't
  // swamp the prior (≈ a dynamic-Elo update of ±100 max — a few points per goal, a few more per result).
  const base = t.elo || 1700;
  const g = groupOf(code), r = g ? standings(g).find(x => x.code === code) : null;
  const form = r ? Math.max(-100, Math.min(100, r.pts * 6 + (r.gf - r.ga) * 5)) : 0;
  return base + form;
}
const liveMinute = (m, r) => r?.st === ST.HT ? 45 : Math.max(1, Math.min(95, Math.round((Date.now() - +new Date(m.utc)) / 60000)));
function winProb(m) {
  const hc = slotInfo(m, "home").code, ac = slotInfo(m, "away").code, st = status(m), r = res(m);
  if (!hc || !ac || st === ST.FT) return null;           // need both teams; the result is already known at FT
  const live = st === ST.LIVE || st === ST.HT;
  // Elo gap → goal supremacy. ~300 Elo ≈ a one-goal edge; clamped so blowout priors stay sane. mu = per-side
  // base rate (≈ half the ~2.7 World Cup goals/game). Neutral venues — no home-advantage term (hosts aside).
  const sup = Math.max(-2.5, Math.min(2.5, (teamRating(hc) - teamRating(ac)) / 300)), mu = 1.35;
  const remFrac = live ? Math.max(0.02, 1 - liveMinute(m, r) / 90) : 1;
  const lamH = Math.max(0.18, mu + sup / 2) * remFrac, lamA = Math.max(0.18, mu - sup / 2) * remFrac;
  const lead = live && r && r.h != null ? r.h - r.a : 0;
  let pH = 0, pD = 0, pA = 0;
  for (let rh = 0; rh < 9; rh++) for (let ra = 0; ra < 9; ra++) {
    // DC correction applies to the actual final score, so only pre-match (live sums *remaining* goals on top of
    // the current lead, where the low-score semantics don't hold). Its effect in-play is negligible anyway.
    const p = _pois(rh, lamH) * _pois(ra, lamA) * (live ? 1 : _dcTau(rh, ra, lamH, lamA)), fin = lead + rh - ra;
    if (fin > 0) pH += p; else if (fin < 0) pA += p; else pD += p;
  }
  const tot = pH + pD + pA || 1;
  return { h: pH / tot, d: pD / tot, a: pA / tot, live };
}
function winProbBlock(m) {
  const wp = winProb(m); if (!wp) return "";
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const ph = Math.round(wp.h * 100), pd = Math.round(wp.d * 100), pa = 100 - ph - pd;
  return `<div class="eyebrow">Win probability <span class="wp-est">${wp.live ? "live estimate" : "pre-match estimate"}</span></div>
    <div class="wp">
      <div class="wp-bar" role="img" aria-label="${esc(h.name)} ${ph}%, draw ${pd}%, ${esc(a.name)} ${pa}%">
        <span class="wp-h" style="width:${ph}%"></span><span class="wp-d" style="width:${pd}%"></span><span class="wp-a" style="width:${pa}%"></span></div>
      <div class="wp-legend"><span class="wp-lh"><b>${ph}%</b> ${flag(h.code)} ${esc(h.name)}</span><span class="wp-ld">Draw <b>${pd}%</b></span><span class="wp-la">${esc(a.name)} ${flag(a.code)} <b>${pa}%</b></span></div>
      <p class="wp-note">A Poisson model from each team's <b>strength rating</b> (World Football Elo) and <b>current-tournament form</b>${wp.live ? ", updated by the live score and minutes left" : ""} — not a betting line.</p>
    </div>`;
}
/* ---------------- stakes explainer ----------------
   Plain-language "what this result means for qualification" on group matches. Pure points-based reasoning over
   every still-possible W/D/L of the group's unfinished matches, so each claim survives goal-difference tiebreaks;
   where the cut IS GD-dependent we don't fake a call — we fall back to the live standing. No new data. */
function _basePts(g) {                                    // FT-only points — the definite base
  const pts = {}; groupTeams(g).forEach(c => pts[c] = 0);
  for (const m of S.matches) if (m.group === g && status(m) === ST.FT) {
    const r = res(m); if (!r || r.h == null) continue;
    if (r.h > r.a) pts[m.home.team] += 3; else if (r.h < r.a) pts[m.away.team] += 3;
    else { pts[m.home.team]++; pts[m.away.team]++; }
  }
  return pts;
}
// For team X: over every W/D/L of the group's unfinished matches (optionally fixing match `fixId` to `fixOut`),
// is X *guaranteed* top-two (≤1 other team can reach its points) and/or *out* of top-two (≥2 teams beat it)?
function _qualScan(g, X, fixId, fixOut) {
  const teams = groupTeams(g), rem = S.matches.filter(m => m.group === g && status(m) !== ST.FT);
  let allTop2 = true, allOut = true;
  const rec = (i, pts) => {
    if (i === rem.length) {
      const px = pts[X]; let ge = 0, gt = 0;
      for (const t of teams) if (t !== X) { if (pts[t] >= px) ge++; if (pts[t] > px) gt++; }
      if (ge > 1) allTop2 = false;     // someone else could match/beat X → not guaranteed top-two here
      if (gt < 2) allOut = false;      // fewer than two strictly above → X could still be top-two here
      return;
    }
    const m = rem[i], h = m.home.team, a = m.away.team;
    for (const o of (fixId && m.id === fixId ? [fixOut] : ["h", "d", "a"])) {
      const np = { ...pts };
      if (o === "h") np[h] += 3; else if (o === "a") np[a] += 3; else { np[h]++; np[a]++; }
      rec(i + 1, np);
    }
  };
  rec(0, _basePts(g));
  return { clinched: allTop2, out: allOut };
}
function _provRows(g) {                                    // FT + in-play points/GD/GF per team in a group
  const rows = {}; groupTeams(g).forEach(c => rows[c] = { code: c, pts: 0, gd: 0, gf: 0 });
  for (const m of S.matches) if (m.group === g) {
    const r = res(m); if (!r || r.h == null || ![ST.FT, ST.LIVE, ST.HT].includes(r.st)) continue;
    const H = rows[m.home.team], A = rows[m.away.team]; if (!H || !A) continue;
    H.gf += r.h; A.gf += r.a; H.gd += r.h - r.a; A.gd += r.a - r.h;
    if (r.h > r.a) H.pts += 3; else if (r.h < r.a) A.pts += 3; else { H.pts++; A.pts++; }
  }
  return rows;
}
// "as it stands" positions. The final tiebreak is the alphabetical code, so a single team's position is only
// meaningful when it isn't dead-level with a neighbour — callers (matchStakes) must guard for that.
function _provPos(g) {                                    // FT + in-play provisional positions ("as it stands")
  const pos = {};
  Object.values(_provRows(g)).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.code.localeCompare(y.code))
    .forEach((r, i) => pos[r.code] = i + 1);
  return pos;
}
function matchStakes(m) {
  if (m.stage !== "group" || !m.group || status(m) === ST.FT) return null;
  const g = m.group, H = m.home.team, A = m.away.team;
  if (!H || !A || !S.matches.some(x => x.group === g && status(x) === ST.FT && res(x)?.h != null)) return null;
  const nm = c => `<b>${esc(S.teams[c]?.name || c)}</b>`;
  const say = code => {
    if (_qualScan(g, code).clinched) return `${nm(code)} are through to the Round of 32.`;
    if (_qualScan(g, code).out) return `${nm(code)} can no longer finish in the top two.`;
    const win = code === H ? "h" : "a", lose = code === H ? "a" : "h";
    if (_qualScan(g, code, m.id, "d").clinched) return `A draw is enough to send ${nm(code)} through.`;
    if (_qualScan(g, code, m.id, win).clinched) return `Win and ${nm(code)} are through.`;
    if (_qualScan(g, code, m.id, lose).out) return `${nm(code)} drop out of the top two if they lose.`;
    if (_qualScan(g, code, m.id, win).out) return `Even a win can't lift ${nm(code)} into the top two.`;
    return null;
  };
  const lines = [say(H), say(A)].filter(Boolean);
  if (lines.length) return { lines, definitive: true };          // crisp qualification call
  // "As it stands" positions are only meaningful for teams that have actually played — a team on 0
  // games is "Nth" purely by tiebreak among everyone tied on 0 points, which misreads as a real standing.
  const counted = x => { const r = res(x); return r && r.h != null && [ST.FT, ST.LIVE, ST.HT].includes(r.st); };
  const playedIn = code => S.matches.some(x => x.group === g && (x.home.team === code || x.away.team === code) && counted(x));
  const pH = playedIn(H), pA = playedIn(A);
  if (!pH && !pA) return { lines: [`Both sides open their Group ${g} campaign.`], definitive: false };
  // A team's "position" is only real if it isn't dead-level with ANY other group member: when teams tie on
  // points/GD/goals the order is decided purely by the alphabetical code tiebreak, which misreads as a real
  // standing (the "Ecuador 3rd at 0–0" bug — and it also bites when a side is level with a THIRD team, not just
  // its opponent, e.g. a group that opens with four draws). In that case say "level", never an ordinal.
  const R = _provRows(g);
  const levelWithAny = c => Object.values(R).some(o => o.code !== c && o.pts === R[c].pts && o.gd === R[c].gd && o.gf === R[c].gf);
  if (pH && pA && R[H] && R[A] && R[H].pts === R[A].pts && R[H].gd === R[A].gd && R[H].gf === R[A].gf)
    return { lines: [`${nm(H)} and ${nm(A)} are level in Group ${g} so far.`], definitive: false };
  const p = _provPos(g), parts = [];
  if (pH) parts.push(levelWithAny(H) ? `${nm(H)} are level on points` : `${nm(H)} are ${ordinal(p[H])}`);
  if (pA) parts.push(levelWithAny(A) ? `${nm(A)} are level on points` : `${nm(A)} are ${ordinal(p[A])}`);
  return { lines: [`As it stands, ${parts.join(" and ")} in Group ${g}.`], definitive: false };
}
function stakesBlock(m) {
  const s = matchStakes(m); if (!s) return "";
  return `<div class="eyebrow">What's at stake</div><ul class="stakes">${s.lines.map(l => `<li>${l}</li>`).join("")}</ul>`;
}
function openMatch(id) {
  const m = S.matches.find(x => x.id === id); if (!m) return;
  const h = slotInfo(m, "home"), a = slotInfo(m, "away"), r = res(m), st = status(m);
  const live = st === ST.LIVE || st === ST.HT;
  const score = r && r.h != null;
  const stageL = m.group ? `Group ${m.group}` : m.round;
  const sv = isSaved(id);
  const statusTag = st === ST.LIVE ? `<span class="md-tag live">● Live ${clockStr(m, r)}</span>`
    : st === ST.HT ? `<span class="md-tag live">Half-time</span>`
    : st === ST.FT ? `<span class="md-tag ft">Full time</span>`
    : `<span class="md-tag soon">Upcoming</span>`;   // time/date live in the meta row below — no need to repeat it
  const side = (s, key) => `<div class="md-team ${s.code === S.fav ? "is-fav" : ""}">
      <span class="md-flag">${s.code ? flag(s.code) : "·"}</span>
      <span class="md-name ${s.ph ? "is-ph" : ""}">${esc(slotText(m, key, s))}</span>
      ${s.code ? `<span class="md-teaminfo">${esc(S.teams[s.code].conf || "")}${S.teams[s.code].titles ? ` · ${TROPHY} ${S.teams[s.code].titles}` : ""}</span>` : ""}
      ${s.code && formChips(s.code) ? `<span class="md-form">${formChips(s.code)}</span>` : ""}</div>`;
  const squadLinks = [h, a].filter(s => s.code)
    .map(s => `<button class="md-squad-link" data-squad="${s.code}"><span class="fl">${flag(s.code)}</span> ${esc(s.name)} ›</button>`).join("");
  const mid = (score || live)
    ? `<div class="md-score">${r?.h ?? 0}<span>–</span>${r?.a ?? 0}</div>${r?.hp != null ? `<div class="md-pens">${r.hp}–${r.ap} on penalties</div>` : ""}`
    : `<div class="md-vs">VS</div>`;
  const liveNow = st === ST.LIVE || st === ST.HT;
  // lineups on the formation pitch — promoted above the timeline while a match is live (the XI is the headline then)
  const xiBlock = r?.xi ? `<div class="eyebrow">${liveNow ? "Line-ups" : "Starting XI"}</div>${xiPanel(r.xi, h, a)}` : "";
  $("#matchTitle").innerHTML = `<span class="md-stage">${esc(stageL)}</span>`;
  $("#matchBody").innerHTML = `
    <div class="md-tagrow">${statusTag}
      <div class="md-actions">
        <button class="md-cal" data-cal="${id}" aria-label="Add to calendar" title="Add this match to your calendar">${CAL_SVG}</button>
        <button class="md-save ${sv ? "is-on" : ""}" data-save="${id}" aria-pressed="${sv}" aria-label="${sv ? "Remove from saved" : "Save match"}" title="${sv ? "Saved" : "Save match"}">${sv ? "★" : "☆"}</button>
      </div>
    </div>
    <div class="md-teams">${side(h, "home")}<div class="md-mid">${mid}</div>${side(a, "away")}</div>
    ${koPath(m)}
    ${stakesBlock(m)}
    ${winProbBlock(m)}
    ${liveNow ? xiBlock : ""}
    ${r?.ev?.length ? mdTimeline(r, h.code, a.code) : (r?.gh?.length || r?.ga?.length) ? `<div class="md-goals">
      <div class="md-goals-col">${(r.gh || []).map(g => `<div class="md-goal">${ICO.ball} ${esc(g)}</div>`).join("")}</div>
      <div class="md-goals-col away">${(r.ga || []).map(g => `<div class="md-goal">${esc(g)} ${ICO.ball}</div>`).join("")}</div>
    </div>` : ""}
    ${mdStats(r)}
    ${mdFlow(r, h, a)}
    ${mdReport(m)}
    ${mdCommentaryShell(m)}
    <div class="md-meta">
      <span>${fmt(m.utc, { weekday: "long", day: "numeric", month: "long" })}</span>
      <span>${timeStr(m.utc)}</span>
      <span>${esc(m.stadium)}</span>
      <span>${esc(m.city)}</span>
      ${r?.facts?.att ? `<span>${ICO.people} ${(+r.facts.att).toLocaleString()} in</span>` : ""}
      ${r?.facts?.ref ? `<span>Referee · ${esc(r.facts.ref)}</span>` : ""}
    </div>
    ${liveNow || !r?.xi ? "" : `<details class="md-fold"><summary><span>Starting XI</span><small>${esc([r.xi.h?.f, r.xi.a?.f].filter(Boolean).join(" v ")) || "line-ups & formations"}</small></summary><div class="md-fold-body">${xiPanel(r.xi, h, a)}</div></details>`}
    ${squadLinks ? `<div class="md-squads">${squadLinks}</div>` : ""}`;
  const md = $("#matchDialog"); md.dataset.openMid = id; showSheet(md);   // openMid (not data-mid) so the global match-open click handler never matches the dialog itself
  // live commentary is per-match; fetch it when the section is open (it opens by default for live games)
  const comm = $("#mdComm", md);
  if (comm) {
    const loadComm = async () => {
      if (!comm.open || comm.dataset.loaded) return;
      comm.dataset.loaded = "1";
      const body = $("#mdCommBody", md);
      body.innerHTML = `<div class="md-comm-spin">Loading commentary…</div>`;
      body.innerHTML = renderCommentary(await loadCommentary(m.num));
    };
    comm.addEventListener("toggle", loadComm);
    if (comm.open) loadComm();   // <details open> doesn't fire toggle on render — kick it off manually
  }
}

/* ---------------- render: matches (today + full calendar) ---------------- */
let cdTimer = null, prevCd = {};
// The hero area. Stacked (vertical), not a swipe carousel: when two games kick off at once both stay visible
// at a glance with zero gestures — a carousel would hide the second match behind an undiscoverable swipe and
// add interaction cost for no benefit when there are only ever a handful. A header labels the count when >1.
function heroStack(liveMatches, nextM) {
  if (!liveMatches.length) return nextM ? heroBlock(nextM, false) : "";
  const head = liveMatches.length > 1
    ? `<div class="hero-stack-head">${ballSVG("live-ball")} ${liveMatches.length} matches live now</div>` : "";
  return head + `<div class="hero-stack">${liveMatches.map(m => heroBlock(m, true)).join("")}</div>`;
}
function heroBlock(heroM, isLive) {
  const h = slotInfo(heroM, "home"), a = slotInfo(heroM, "away"), r = res(heroM);
  return `<div class="hero" data-mid="${heroM.id}" role="button" tabindex="0" aria-label="Match details">
    <div class="hero-tag ${isLive ? "is-live" : ""}">
      ${isLive ? `${ballSVG("live-ball")} Live now` : `${isFavMatch(heroM) ? "Your team · " : ""}Next kickoff`}
      <span style="color:var(--ink-soft);font-weight:600">— ${esc(heroM.group ? "Group " + heroM.group : heroM.round)}</span>
      <span class="hero-actions">
        <span class="hero-go">Details ›</span>
      </span>
    </div>
    <div class="hero-teams">
      <div class="hero-side"><span class="hero-flag">${h.code ? flag(h.code) : "·"}</span><span class="hero-name">${esc(h.name)}</span></div>
      <div class="hero-mid">${isLive
        ? `<span class="hero-score">${r?.h ?? 0}–${r?.a ?? 0}</span><span class="hero-livechip">${r?.st === ST.HT ? "Half-time" : (clockStr(heroM, r) || "Live")}</span>`
        : `<span class="hero-vs">VS</span>`}</div>
      <div class="hero-side"><span class="hero-flag">${a.code ? flag(a.code) : "·"}</span><span class="hero-name">${esc(a.name)}</span></div>
    </div>
    ${(() => { const s = matchStakes(heroM); return s ? `<div class="hero-stakes">${s.lines[0]}</div>` : ""; })()}
    ${!isLive ? `<div class="countdown" id="cd" data-utc="${heroM.utc}">
      ${["h", "m"].map((k, i) => `${i ? `<span class="cd-sep" aria-hidden="true">:</span>` : ""}<div class="cd-cell"><span class="cd-num" data-k="${k}">–</span><span class="cd-lab">${{ h: "hrs", m: "min" }[k]}</span></div>`).join("")}
    </div>` : ""}
    <div class="hero-meta">
      <span><b>${timeStr(heroM.utc)}</b></span>
      <span>${esc(heroM.stadium)}</span><span>${esc(heroM.city)}</span>
      <span>${fmt(heroM.utc, { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
  </div>`;
}
// "Match of the day" — the marquee fixture among the next slate of upcoming/live games, scored by
// stage weight + the two teams' World Cup pedigree + a host bonus. A rolling window over the next few
// fixtures (not a local-day boundary) so a late-night kickoff isn't shoved into "tomorrow" by the tz.
const MOTD_STAGE = { group: 0, r32: 3, r16: 4, qf: 6, sf: 8, third: 5, final: 12 };
const HOSTS = ["CA", "MX", "US"];
// how marquee a fixture is: stage weight + the two teams' current strength (Elo) + historic pedigree (titles) +
// a host bonus. Elo is the main team-quality signal — titles alone can't rank a Netherlands–Croatia tie (both
// 0 titles) above a minnows game; the closeness of the two sides also nudges a balanced heavyweight clash up.
function prestige(m) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const eh = S.teams[h.code]?.elo || 1500, ea = S.teams[a.code]?.elo || 1500;
  const strength = (eh + ea - 3000) / 80;          // combined quality, ~0 (minnows) … ~14 (two giants)
  const even = h.code && a.code ? Math.max(0, 3 - Math.abs(eh - ea) / 120) : 0;   // closely-matched = more marquee
  const titles = (S.teams[h.code]?.titles || 0) + (S.teams[a.code]?.titles || 0);
  const host = HOSTS.includes(h.code) || HOSTS.includes(a.code) ? 1 : 0;
  return (MOTD_STAGE[m.stage] || 0) + strength + even + titles + host + (!!h.code + !!a.code);   // prefer known fixtures
}
const marqueeOf = list => list.length ? list.slice().sort((a, b) => prestige(b) - prestige(a) || a.utc.localeCompare(b.utc))[0] : null;
// the marquee of TODAY's remaining fixtures — "today" is the visitor's local day (same one the ticker uses), so
// it's never a tomorrow match mislabelled "of the day", and it re-computes when you change timezone. Null on a
// rest day with nothing left to play (the hero's next-kickoff card carries the gap instead).
function matchOfDay() {
  const todayK = viewDay(new Date().toISOString());
  return marqueeOf(S.matches.filter(m => status(m) !== ST.FT && viewDay(m.utc) === todayK));
}
function motdBanner(m) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const nm = (s, side) => s.code ? esc(s.name) : esc(slotText(m, side, s));
  return `<button class="motd" data-mid="${m.id}" aria-label="Match of the day — details">
    <span class="motd-tag">★ Match of the day</span>
    <span class="motd-fix"><span class="fl">${h.code ? flag(h.code) : "·"}</span>${nm(h, "home")}<i>v</i>${nm(a, "away")}<span class="fl">${a.code ? flag(a.code) : "·"}</span></span>
    <span class="motd-meta"><b>${timeStr(m.utc)}</b> · ${esc(m.group ? "Group " + m.group : m.round)} · ${esc((m.city || "").split(",")[0])}</span>
  </button>`;
}
function renderMatches() {
  const el = $("#view-matches");
  const now = new Date();
  const todayK = dayKey(now.toISOString());
  // Simultaneous kickoffs are normal at a World Cup — the final round of every group plays its two games at
  // the same time — so don't pick one "the" live match; surface them all. When nothing's live, a single
  // next-kickoff card carries the countdown.
  const liveMatches = S.matches.filter(m => [ST.LIVE, ST.HT].includes(status(m)))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const nextM = liveMatches.length ? null
    // include a SCHED match whose kickoff just passed (feed not yet flipped to LIVE) so the hero never goes blank
    // in that gap; the countdown clamps to 0 and re-polls. Bounded to ~2.5h overdue so a stuck fixture isn't pinned.
    : S.matches.filter(m => status(m) === ST.SCHED && new Date(m.utc).getTime() > now.getTime() - 9e6).sort((a, b) => a.utc.localeCompare(b.utc))[0];
  const heroIds = new Set([...liveMatches.map(m => m.id), ...(nextM ? [nextM.id] : [])]);
  const f = S.filters;
  let list = S.matches.slice().sort((a, b) => a.utc.localeCompare(b.utc));
  if (f.stage === "group") list = list.filter(m => m.stage === "group");
  if (f.stage === "ko") list = list.filter(m => m.stage !== "group");
  if (f.team) list = list.filter(m => matchHasTeam(m, f.team));
  if (f.saved) list = list.filter(m => isSaved(m.id));

  // 1A: finished games go into a collapsible "Earlier results"; live + upcoming show below
  const dayGroups = arr => { const d = {}; arr.forEach(m => (d[dayKey(m.utc)] ??= []).push(m)); return Object.entries(d).map(([k, ms]) => `<div class="dayhead ${k === todayK ? "is-today" : ""}">${dayLabel(ms[0].utc)} <small>${ms.length} match${ms.length > 1 ? "es" : ""}</small></div>` + ms.map((m, i) => matchCard(m, Math.min(i, 8))).join("")).join(""); };
  const past = list.filter(m => status(m) === ST.FT);
  const ahead = list.filter(m => status(m) !== ST.FT);

  const motd = matchOfDay();   // skip if it's already a hero card (live/next) — no point showing it twice
  el.innerHTML =
    heroStack(liveMatches, nextM) +
    (motd && !heroIds.has(motd.id) ? motdBanner(motd) : "") +
    `<div class="filters">
      <select class="fsel ${f.stage !== "all" ? "is-on" : ""}" id="stageSel" aria-label="Filter by stage">
        ${[["all", "All 104 matches"], ["group", "Group stage"], ["ko", "Knockouts"]].map(([k, l]) =>
          `<option value="${k}" ${f.stage === k ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <div class="tsel ${f.team ? "is-on" : ""}" id="teamSelWrap">
        <button type="button" class="fsel tsel-btn" id="teamSelBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Filter by team">
          ${f.team ? `<span class="fl">${flag(f.team)}</span><span class="tsel-cur">${esc(S.teams[f.team].name)}</span>` : `<span class="tsel-cur">All teams</span>`}
        </button>
        <div class="tsel-pop" id="teamSelPop" hidden>
          <input class="tsel-search" id="teamSelSearch" type="search" placeholder="Search 48 teams…" autocomplete="off">
          <div class="tsel-list" id="teamSelList" role="listbox" aria-label="Teams"></div>
        </div>
      </div>
      <button class="fbtn ${f.saved ? "is-on" : ""}" data-saved>★ Saved${S.saved.size ? ` <b>${S.saved.size}</b>` : ""}</button>
    </div>` +
    (f.saved && S.saved.size ? `<button class="saved-cal" data-cal-saved>${CAL_SVG} Add ${S.saved.size} saved match${S.saved.size > 1 ? "es" : ""} to calendar</button>` : "") +
    (past.length ? `<details class="earlier"><summary><span class="ear-tri">▸</span> Earlier results <b>${past.length}</b><span class="ear-hint">view</span></summary><div class="ear-body">${dayGroups(past)}</div></details>` : "") +
    (ahead.length ? dayGroups(ahead) : (past.length ? "" : `<div class="empty">No matches for this filter.</div>`));

  startCountdown();
  const ss = $("#stageSel", el); if (ss) ss.onchange = () => { f.stage = ss.value; renderMatches(); };
  const tb = $("#teamSelBtn", el);
  if (tb) {
    tb.onclick = () => { $("#teamSelPop").hidden ? openTeamSel() : closeTeamSel(); };
    $("#teamSelSearch", el).oninput = e => renderTeamSelList(e.target.value);
    // keyboard: the role="listbox" implies arrow-key traversal — wire it (↓/↑ move, Enter selects, ↑ off the top returns to search)
    $("#teamSelPop", el).onkeydown = e => {
      if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
      const opts = $$("#teamSelList .tsel-opt", el), cur = opts.indexOf(document.activeElement);
      if (!opts.length) return;
      if (e.key === "Enter") { if (cur >= 0) { e.preventDefault(); opts[cur].click(); } return; }
      e.preventDefault();
      if (cur === 0 && e.key === "ArrowUp") return $("#teamSelSearch", el).focus();
      const next = cur < 0 ? (e.key === "ArrowDown" ? 0 : opts.length - 1) : Math.max(0, Math.min(opts.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1)));
      opts[next].focus();
    };
  }
  const sb = $("[data-saved]", el); if (sb) sb.onclick = () => { f.saved = !f.saved; renderMatches(); };
  const scb = $("[data-cal-saved]", el); if (scb) scb.onclick = () => downloadICS(S.matches.filter(m => isSaved(m.id)).sort((a, b) => a.utc.localeCompare(b.utc)), "My World Cup 2026 matches");
  requestAnimationFrame(updateJumpNow);
}
// custom searchable team filter (favourite pinned on top, then alphabetical)
function teamSelOptions(q = "") {
  const f = S.filters, ql = q.trim().toLowerCase();
  const fav = (S.fav && S.teams[S.fav]) ? S.fav : null;
  const opt = (val, name, lead, sel, tag = "") =>
    `<button type="button" class="tsel-opt${sel ? " is-sel" : ""}" role="option" aria-selected="${sel}" data-v="${val}">`
    + `${lead}<span class="tsel-opt-name">${name}${tag}</span>${sel ? `<span class="tsel-tick" aria-hidden="true">✓</span>` : ""}</button>`;
  let html = "";
  if (!ql || "all teams".includes(ql))
    html += opt("", "All teams", `<span class="tsel-globe" aria-hidden="true">🌍</span>`, f.team === "");
  if (fav && S.teams[fav].name.toLowerCase().includes(ql))
    html += opt(fav, esc(S.teams[fav].name), `<span class="fl">${flag(fav)}</span>`, f.team === fav, ` <span class="tsel-favtag" aria-hidden="true">★</span>`);
  const alpha = Object.keys(S.teams).filter(c => c !== fav)
    .sort((a, b) => S.teams[a].name.localeCompare(S.teams[b].name))
    .filter(c => S.teams[c].name.toLowerCase().includes(ql));
  if (alpha.length && html) html += `<div class="tsel-div" role="presentation"></div>`;
  html += alpha.map(c => opt(c, esc(S.teams[c].name), `<span class="fl">${flag(c)}</span>`, f.team === c)).join("");
  return html || `<div class="tsel-empty">No teams found</div>`;
}
function renderTeamSelList(q = "") {
  const l = $("#teamSelList"); if (!l) return;
  l.innerHTML = teamSelOptions(q);
  $$("#teamSelList .tsel-opt").forEach(b => b.onclick = () => { S.filters.team = b.dataset.v; renderMatches(); });
}
function openTeamSel() {
  const pop = $("#teamSelPop"); if (!pop) return;
  pop.hidden = false;
  $("#teamSelBtn")?.setAttribute("aria-expanded", "true");
  $("#teamSelWrap")?.classList.add("open");
  const s = $("#teamSelSearch"); if (s) { s.value = ""; renderTeamSelList(""); s.focus(); }
}
function closeTeamSel() {
  const pop = $("#teamSelPop"); if (!pop || pop.hidden) return;
  pop.hidden = true;
  $("#teamSelBtn")?.setAttribute("aria-expanded", "false");
  $("#teamSelWrap")?.classList.remove("open");
}
// floating "jump to today/live" control.
// We target the first *match card* of the live/today group, not the day header:
// headers are position:sticky, so their offsetTop / getBoundingClientRect are unreliable.
function jumpTarget() {
  const v = $("#view-matches"); if (!v || S.view !== "matches") return null;
  const liveM = S.matches.find(m => [ST.LIVE, ST.HT].includes(status(m)));
  if (liveM) { const c = v.querySelector(`.mcard[data-mid="${liveM.id}"]`); if (c) return { el: c, head: null, live: true }; }
  // there can be two "today" headers — one inside the collapsed "Earlier results" <details> and one in
  // the upcoming list. Target the upcoming (visible) one, never the collapsed one.
  const heads = [...v.querySelectorAll(".dayhead.is-today")];
  const head = heads.find(h => !h.closest("details")) || heads[0];
  if (head) {
    let card = head.nextElementSibling;
    while (card && !card.classList.contains("mcard")) card = card.nextElementSibling;
    return { el: card || head, head, live: false };  // card is non-sticky → accurate geometry
  }
  return null;
}
const STICK = () => ($(".topbar")?.offsetHeight || 56) + ($(".tabs")?.offsetHeight || 48);
// publish the real pinned-chrome heights as CSS vars so the sticky day-headers pin exactly under the
// tabs (the old hardcoded 60px/105px assumed a taller bar) — keeps "jump to today" landing pixel-true.
function setChromeVars() {
  const bar = $(".topbar")?.offsetHeight || 56, tabs = $(".tabs")?.offsetHeight || 46;
  const r = document.documentElement.style;
  r.setProperty("--h-bar", bar + "px");
  r.setProperty("--h-chrome", (bar + tabs) + "px");
}
function updateJumpNow() {
  const btn = $("#jumpNow"); if (!btn) return;
  const t = jumpTarget();
  if (!t) { btn.hidden = true; return; }
  const vp = t.el.getBoundingClientRect().top;               // viewport-relative (target is non-sticky)
  btn.hidden = !(vp < STICK() - 60 || vp > innerHeight - 24); // show only when it's well off-screen
  btn.classList.toggle("is-live", t.live);
  $("#jnLabel").textContent = t.live ? "Live" : "Today";
}
function scrollToNow() {
  const t = jumpTarget(); if (!t) return;
  // land the day header just under the sticky chrome; the card sits right below it
  const headH = t.head ? t.head.offsetHeight : 0;
  const y = t.el.getBoundingClientRect().top + scrollY - STICK() - headH - 8;
  scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}
function startCountdown() {
  clearInterval(cdTimer); prevCd = {};
  const cd = $("#cd"); if (!cd) return;
  const target = new Date(cd.dataset.utc);
  const tickFn = () => {
    let s = Math.max(0, Math.floor((target - new Date()) / 1000));
    const v = { h: s / 3600 | 0, m: s / 60 % 60 | 0, s: s % 60 };   // hours run past 24 (no separate days box)
    $$(".cd-num", cd).forEach(n => {
      const k = n.dataset.k, val = String(v[k]).padStart(2, "0");
      if (prevCd[k] !== val) { n.textContent = val; n.classList.remove("tick"); void n.offsetWidth; n.classList.add("tick"); prevCd[k] = val; }
    });
    if (s === 0) { clearInterval(cdTimer); setTimeout(refreshResults, 4000); }
  };
  tickFn(); cdTimer = setInterval(tickFn, 1000);
}

/* ---------------- render: teams (my team + all 48) ---------------- */
function myTeamBlock() {
  const t = S.teams[S.fav];
  const mine = S.matches.filter(isFavMatch).sort((a, b) => a.utc.localeCompare(b.utc));
  const group = mine.find(m => m.group)?.group;
  const tbl = group ? standings(group) : [];
  const pos = tbl.findIndex(r => r.code === S.fav) + 1;
  const played = tbl.find(r => r.code === S.fav)?.p || 0;
  const upcoming = mine.filter(m => status(m) === ST.SCHED);
  const done = mine.filter(m => status(m) !== ST.SCHED);
  return `
    <div class="team-hero"><span class="fl">${flag(S.fav)}</span>
      <div><h2>${esc(t.name)}</h2>
      <p>${t.conf ? esc(t.conf) + " · " : ""}Group ${group || "—"}${t.titles ? ` · <b style="color:var(--gold)">${TROPHY} ${t.titles}</b>` : ""}${played ? ` · currently <b>${ordinal(pos)}</b> after ${played} match${played > 1 ? "es" : ""}` : ""}</p>
      ${formChips(S.fav) ? `<div class="th-form">Recent form ${formChips(S.fav)}</div>` : ""}</div>
      <button class="btn ghost team-change" id="ctaChange">Change</button></div>
    ${mine.length ? `<div class="team-actions"><button class="btn ghost ics-btn" id="icsTeam">${CAL_SVG} Add ${esc(t.name)}'s matches to calendar</button></div>` : ""}
    ${done.length ? `<div class="eyebrow">Played</div>` + done.map((m, i) => matchCard(m, i)).join("") : ""}
    <div class="eyebrow">Fixtures</div>
    ${upcoming.length ? upcoming.map((m, i) => matchCard(m, i)).join("") : `<div class="empty">No scheduled fixtures — check the bracket for their knockout path.</div>`}
    ${group ? `<div class="eyebrow">Group ${group}</div><div class="gwrap">${groupTable(group, 0)}</div>${groupOutlookHTML(group)}
      <div class="legend"><span class="l1"><i></i>Top 2 advance</span><span class="l3"><i></i>3rd — possible best-8 spot</span></div>` : ""}
    ${squadSection(S.fav)}`;
}
function renderTeams() {
  const el = $("#view-teams");
  const head = S.fav
    ? myTeamBlock()
    : `<div class="pick-cta">
        <span style="font-size:42px;color:var(--pitch);display:inline-flex">${ICO.ball}</span>
        <span class="big">Who are you backing?</span>
        <span style="color:var(--ink-soft);font-size:13.5px;max-width:300px">Pick a team — the site takes their colors, pins their matches and tracks their road to the final.</span>
        <button class="btn" id="ctaPick">Choose your team</button></div>`;
  const grid = Object.keys(S.teams)
    .sort((a, b) => S.teams[a].name.localeCompare(S.teams[b].name))
    .map(c => `<button class="teamcard ${c === S.fav ? "is-fav" : ""}" data-squad="${c}" title="${esc(S.teams[c].name)}${S.teams[c].titles ? ` — ${S.teams[c].titles}× World Cup champion` : ""}">
      <span class="fl">${flag(c)}</span><span class="tc-name">${esc(S.teams[c].name)}</span>${S.teams[c].titles ? `<span class="tc-cup" aria-label="${S.teams[c].titles} World Cup titles">${TROPHY} ${S.teams[c].titles}</span>` : ""}<span class="tc-grp">${groupOf(c) || ""}</span></button>`).join("");
  el.innerHTML = head + `<div class="eyebrow">All teams <span style="color:var(--ink-soft);font-weight:600">— tap for detail</span></div><div class="teamsgrid">${grid}</div>`;
  const cta = $("#ctaPick", el); if (cta) cta.onclick = () => $("#teamDialog").showModal();
  const chg = $("#ctaChange", el); if (chg) chg.onclick = () => $("#teamDialog").showModal();
  const ics = $("#icsTeam", el);
  if (ics) ics.onclick = () => downloadICS(
    S.matches.filter(isFavMatch).sort((a, b) => a.utc.localeCompare(b.utc)),
    `${S.teams[S.fav].name} · World Cup 2026`);
}
// authoritative head coach: curated teams.json value (web-verified, all 48), API-squad coach as a fallback
const teamCoach = code => S.teams[code]?.coach || S.squads?.[code]?.coach || "";
const initials = n => (n || "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
function rosterMarkup(sq, code) {
  const groups = { GK: "Goalkeepers", DF: "Defenders", MF: "Midfielders", FW: "Forwards" };
  const byPos = p => sq.players.filter(x => x.pos === p);
  return `<div class="roster">${Object.entries(groups).map(([p, label]) => {
    const ps = byPos(p);
    return ps.length ? `<div class="roster-pos"><h5>${label} <span>${ps.length}</span></h5>
      ${ps.map(x => { const nm = x.name.replace(" (captain)", ""), ph = bestPhoto(nm, code);
        return `<div class="roster-row" data-player="${esc(nm)}|${code}" role="button" tabindex="0">
        <span class="rnum">${x.n ?? "·"}</span>
        <span class="rface"${ph ? ` style="background-image:url('${ph}')"` : ""}>${ph ? "" : flag(code)}</span>
        <span class="rname">${esc(nm)}${x.name.includes("(captain)") ? `<i class="cpt">C</i>` : ""}${x.club ? `<small>${esc(x.club)}</small>` : ""}</span>
        ${x.caps != null ? `<span class="rstat">${x.caps}<i>caps</i>${x.goals ? `<em>${x.goals} g</em>` : ""}</span>` : ""}
      </div>`; }).join("")}</div>` : "";
  }).join("")}</div>`;
}
function squadSection(code) {
  const sq = S.squads?.[code], coach = teamCoach(code);
  if (!sq) return `<div class="eyebrow">Squad</div><div class="empty">Squad not published yet — check back closer to kickoff.</div>`;
  return `<div class="eyebrow">Squad — ${sq.players.length} players${coach ? ` · Coach <b style="color:var(--ink)">&nbsp;${esc(coach)}</b>` : ""}</div>
    ${rosterMarkup(sq, code)}`;
}
// World Cup pedigree (titles · best finish · appearances) + the head coach — the "what this team is about" header
function teamOverview(code) {
  const t = S.teams[code]; if (!t) return "";
  const titles = t.titles || 0, debut = t.best === "First appearance";
  const [finish, yr] = (t.best || "").split(" · ");
  const coach = teamCoach(code);
  const tiles = [
    t.apps != null ? `<div class="tp"><b>${t.apps}</b><span>World Cup${t.apps !== 1 ? "s" : ""}</span></div>` : "",
    titles ? `<div class="tp tp-gold"><b>${titles}×</b><span>Champion${titles !== 1 ? "s" : ""}</span></div>` : "",
    `<div class="tp tp-wide"><b>${esc(debut ? "Debut" : finish)}</b><span>${debut ? "First World Cup" : `Best finish${yr ? ` · ${esc(yr)}` : ""}`}</span></div>`,
  ].filter(Boolean).join("");
  return `<div class="ts-ped">${tiles}</div>
    ${coach ? `<div class="ts-coach"><span class="ts-coach-badge">${esc(initials(coach))}</span><span class="ts-coach-tx"><i>Head coach</i><b>${esc(coach)}</b></span></div>` : ""}`;
}
// a player's record at THIS World Cup — counted from the team's played matches (tolerant name match vs feed names)
function playerWC(name, code) {
  let g = 0, a = 0, y = 0, rc = 0, apps = 0, starts = 0, cs = 0, ga = 0;
  for (const m of S.matches) {
    if (!matchHasTeam(m, code) || status(m) === ST.SCHED) continue;
    const r = res(m); if (!r) continue;
    const side = slotInfo(m, "home").code === code ? "h" : slotInfo(m, "away").code === code ? "a" : null;
    if (!side) continue;
    const xi = r.xi?.[side]?.xi || [];
    const inXI = xi.some(p => sameName(p[1], name));
    const onBench = (r.ev || []).some(e => e.tm === side && e.k === "S" && e.on && sameName(e.on, name));
    if (inXI || onBench) apps++;
    // clean sheets / goals conceded while the player STARTED — shared by the keeper and the back line,
    // approximated to the match's final score (the same simplification the keeper leaderboard uses)
    if (inXI && r.h != null) {
      starts++; const conceded = side === "h" ? r.a : r.h; ga += conceded; if (conceded === 0) cs++;
    }
    for (const e of (r.ev || [])) {
      if (e.tm !== side) continue;
      if (["G", "P"].includes(e.k) && e.p && sameName(e.p, name)) g++;
      if (e.a && sameName(e.a, name)) a++;
      if (e.k === "Y" && e.p && sameName(e.p, name)) y++;
      if (e.k === "R" && e.p && sameName(e.p, name)) rc++;
    }
  }
  return { g, a, y, rc, apps, starts, cs, ga };
}
// Team detail sheet — overview, recent form, every fixture (results + upcoming), the group
// standing + qualification outlook, and the full squad (collapsible). Tapping a team anywhere
// (grid, group table, leaderboards, match modal) opens this; match cards inside drill deeper.
// minutes & rotation, built from each match's starting XI (xi) + substitutions (ev). Approximate
// minutes (nominal 90' full-time): a starter not subbed = 90, subbed off at t = t, a sub on at t = 90−t.
function teamRotation(code) {
  const ms = S.matches.filter(m => matchHasTeam(m, code) && status(m) === ST.FT && res(m)?.xi).sort((a, b) => a.utc.localeCompare(b.utc));
  if (!ms.length) return null;
  const grid = ms.map(m => {
    const r = res(m), side = slotInfo(m, "home").code === code ? "h" : "a";
    const xi = new Set((r.xi[side]?.xi || []).map(p => p[1]));
    const off = {}, on = {};
    for (const e of (r.ev || [])) if (e.tm === side && e.k === "S") { if (e.off) off[e.off] = evMin(e.t); if (e.on) on[e.on] = evMin(e.t); }
    return { xi, off, on, opp: slotInfo(m, side === "h" ? "away" : "home"), num: m.num };
  });
  const featured = new Set(); grid.forEach(g => { g.xi.forEach(n => featured.add(n)); Object.keys(g.on).forEach(n => featured.add(n)); });
  const players = [...featured].map(name => {
    let mins = 0, starts = 0, subs = 0;
    const cells = grid.map(g => {
      if (g.xi.has(name)) { starts++; const o = g.off[name]; if (o != null) { mins += Math.round(o); return { k: "P", t: `M${g.num}: started, off ${Math.round(o)}'` }; } mins += 90; return { k: "S", t: `M${g.num}: started (90')` }; }
      if (g.on[name] != null) { subs++; mins += Math.max(0, 90 - Math.round(g.on[name])); return { k: "U", t: `M${g.num}: on ${Math.round(g.on[name])}'` }; }
      return { k: "-", t: `M${g.num}: unused` };
    });
    return { name, code, mins, starts, subs, cells };
  }).sort((a, b) => b.mins - a.mins || b.starts - a.starts || a.name.localeCompare(b.name));
  return { matches: ms.length, players };
}
function rotationSection(code) {
  const R = teamRotation(code);
  if (!R) return "";
  const row = p => { const ph = playerPhoto(p.name, p.code);
    return `<div class="rt-row" data-player="${esc(p.name)}|${p.code}" role="button" tabindex="0">
      ${ph ? `<span class="lead-face" style="background-image:url('${ph}')"></span>` : `<span class="fl">${flag(p.code)}</span>`}
      <span class="rt-name">${esc(p.name)}<small>${p.starts} start${p.starts !== 1 ? "s" : ""}${p.subs ? ` · ${p.subs} sub` : ""}</small></span>
      <span class="rt-cells">${p.cells.map(c => `<span class="rt-cell s-${c.k}" title="${esc(c.t)}"></span>`).join("")}</span>
      <span class="rt-min">${p.mins}<small>min</small></span></div>`; };
  return `<details class="ts-squad rt-block"><summary><span>Minutes &amp; rotation</span><small>${R.matches} match${R.matches !== 1 ? "es" : ""}</small></summary>
    <div class="rt-list">${R.players.map(row).join("")}</div>
    <div class="rt-legend"><span><i class="rt-cell s-S"></i>Started</span><span><i class="rt-cell s-P"></i>Subbed off</span><span><i class="rt-cell s-U"></i>Off the bench</span><span><i class="rt-cell s--"></i>Unused</span></div></details>`;
}
// a team's "playing style" fingerprint — five identity axes, each a bar showing where the team sits among
// the field (min-max percentile over teams that have a match-stats line). It's a shape, not a ranking.
function styleSection(code) {
  const me = tournamentStats().style, mine = me.find(x => x.code === code);
  if (!mine || me.length < 4) return "";
  const AXES = [["poss", "Possession", v => v.toFixed(0) + "%"], ["passAcc", "Passing", v => v.toFixed(0) + "%"],
    ["directness", "Direct play", v => v.toFixed(0) + "%"], ["pressPg", "Pressing", v => v.toFixed(0) + "/g"], ["shotsPg", "Attacking", v => v.toFixed(1) + "/g"]];
  const pct = key => { const vs = me.map(x => x[key]), lo = Math.min(...vs), hi = Math.max(...vs); return hi > lo ? Math.round((mine[key] - lo) / (hi - lo) * 100) : 50; };
  const rows = AXES.map(([key, label, fmt]) => `<div class="sty-row"><span class="sty-lbl">${label}</span><span class="sty-bar"><i style="width:${pct(key)}%"></i></span><span class="sty-v">${fmt(mine[key])}</span></div>`).join("");
  return `<div class="eyebrow">Playing style</div><div class="sty-card">${rows}<p class="sty-hint">Where ${esc(S.teams[code].name)} ranks among teams with match stats — a fuller bar means more than its rivals, not "better".</p></div>`;
}
function openTeam(code) {
  const t = S.teams[code]; if (!t) return;
  const all = S.matches.filter(m => matchHasTeam(m, code)).sort((a, b) => a.utc.localeCompare(b.utc));
  const group = groupOf(code), tbl = group ? standings(group) : [];
  const pos = tbl.findIndex(r => r.code === code) + 1, played = tbl.find(r => r.code === code)?.p || 0;
  const done = all.filter(m => status(m) !== ST.SCHED), upcoming = all.filter(m => status(m) === ST.SCHED);
  const sq = S.squads?.[code], isFav = code === S.fav;
  $("#teamSheetTitle").innerHTML = `<span class="fl">${flag(code)}</span> ${esc(t.name)}`;
  $("#teamSheetBody").innerHTML = `
    <div class="ts-meta">${t.conf ? esc(t.conf) : ""}${group ? ` · Group ${group}` : ""}${played ? ` · <b>${ordinal(pos)}</b> after ${played} match${played > 1 ? "es" : ""}` : ""}</div>
    ${teamOverview(code)}
    ${isFav
      ? `<div class="ts-fav-tag">★ Your team</div>`
      : `<button class="ts-setfav" data-follow="${code}">★ Make ${esc(t.name)} my team</button>`}
    ${formChips(code) ? `<div class="ts-form">Recent form ${formChips(code)}</div>` : ""}
    ${styleSection(code)}
    ${sq ? `<details class="ts-squad" open><summary><span>Squad</span><small>${sq.players.length} players${teamCoach(code) ? ` · ${esc(teamCoach(code))}` : ""}</small></summary>${rosterMarkup(sq, code)}</details>`
        : `<div class="eyebrow">Squad</div><div class="empty">${esc(t.name)}'s squad isn't published yet — check back closer to kickoff.</div>`}
    ${done.length ? `<div class="eyebrow">Results</div>${done.map((m, i) => matchCard(m, i)).join("")}` : ""}
    ${upcoming.length ? `<div class="eyebrow">Fixtures</div>${upcoming.map((m, i) => matchCard(m, i)).join("")}` : (done.length ? "" : `<div class="empty">Fixtures to be confirmed.</div>`)}
    ${group ? `<div class="eyebrow">Group ${group}</div><div class="gwrap">${groupTable(group, 0)}</div>${groupOutlookHTML(group)}
      <div class="legend"><span class="l1"><i></i>Top 2 advance</span><span class="l3"><i></i>3rd — possible best-8 spot</span></div>` : ""}
    ${roadSection(code)}
    ${rotationSection(code)}`;
  showSheet($("#teamSheet"));
}
// best-effort match of a feed name (e.g. "Julian QUINONES") to a squad entry (names come from a different feed)
function squadBio(name, code) {
  const sq = S.squads?.[code]; if (!sq?.players) return null;
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
  const surname = name.split(/\s+/).filter(w => w && w === w.toUpperCase()).join("");
  const nn = norm(name), ns = norm(surname);
  return sq.players.find(x => { const xn = norm(x.name); return xn === nn || (ns.length > 2 && (xn.includes(ns) || ns.includes(xn))); }) || null;
}
// tap a player name anywhere (timeline, lineup, Golden Boot, squad) → a compact profile.
// Uses live-match context (XI position + what they did) only when a match modal is actually open.
// join a player to their ESPN per-match box score (pstats keys are raw ESPN names) — exact, then unique surname
function matchPstat(name, ps) {
  if (!ps) return null;
  const nn = normName(name);
  for (const k in ps) if (normName(k) === nn) return ps[k];
  const sur = surnameOf(name), bySur = Object.keys(ps).filter(k => surnameOf(k) === sur);
  return bySur.length === 1 ? ps[bySur[0]] : null;   // don't guess when a surname is shared
}
const PL_BOX = [["sh", "Shots"], ["sot", "On target"], ["g", "Goals"], ["a", "Assists"], ["sv", "Saves"], ["ga", "Conceded"], ["fa", "Fouls won"], ["fc", "Fouls"], ["of", "Offside"]];
function openPlayer(name, code) {
  const team = S.teams[code];
  const md = $("#matchDialog");
  const m = (md?.open && md.dataset.openMid) ? S.matches.find(x => x.id === md.dataset.openMid) : null;
  const r = m && res(m);
  const bio = squadBio(name, code);
  const photo = bestPhoto(name, code) || bio?.photo || "";
  let num = null, pos = "";
  if (r?.xi && m) {
    const side = slotInfo(m, "home").code === code ? "h" : "a";
    const row = (r.xi[side]?.xi || []).find(p => p[1] === name);
    if (row) { num = row[0]; pos = ["Goalkeeper", "Defender", "Midfielder", "Forward"][row[2]] || ""; }
  }
  if (bio) { if (num == null && bio.n != null) num = bio.n; if (!pos && bio.pos) pos = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" }[bio.pos] || ""; }
  const wc = playerWC(name, code);   // this-tournament record, counted from the team's played matches
  const isGK = pos === "Goalkeeper" || bio?.pos === "GK";   // keepers: clean sheets / conceded, not goals / assists
  const isDF = pos === "Defender" || bio?.pos === "DF";     // defenders: clean sheets + goals (assists are rarely their story)
  const acts = (r?.ev || []).filter(e => [e.p, e.a, e.on, e.off].includes(name)).map(e => {
    const mn = esc(e.t || "");
    if (["G", "P", "OG"].includes(e.k)) return `<span class="pl-act">${ICO.ball} ${mn}${e.k === "P" ? " pen" : e.k === "OG" ? " o.g." : ""}${e.a === name && e.p !== name ? " · assist" : ""}</span>`;
    if (e.k === "Y") return `<span class="pl-act"><i class="tl-card y"></i> ${mn}</span>`;
    if (e.k === "R") return `<span class="pl-act"><i class="tl-card r"></i> ${mn}</span>`;
    if (e.k === "S") return `<span class="pl-act">${e.on === name ? "▲ on" : "▼ off"} ${mn}</span>`;
    return "";
  }).join("");
  const box = matchPstat(name, r?.pstats);   // ESPN per-match box score for this player, if a match is open
  const boxHtml = box ? PL_BOX.filter(([k]) => box[k]).map(([k, label]) => `<span class="pl-stat"><b>${box[k]}</b>${label}</span>`).join("") : "";
  $("#playerTitle").textContent = name;   // real dialog name for screen readers (was a generic "Player")
  $("#playerBody").innerHTML = `
    <div class="pl">
      ${photo ? `<span class="pl-face" style="background-image:url('${photo}')"></span>` : `<span class="pl-face pl-flag">${code ? flag(code) : "·"}</span>`}
      <div class="pl-meta">
        <b class="pl-name">${esc(name)}</b>
        <span class="pl-team">${code ? flag(code) + " " : ""}${esc(team?.name || code || "")}</span>
        ${(num != null || pos) ? `<span class="pl-pos">${num != null ? "#" + num : ""}${num != null && pos ? " · " : ""}${pos}</span>` : ""}
      </div>
    </div>
    ${bio && (bio.club || bio.caps != null) ? `<div class="pl-bio">
      ${bio.club ? `<span><i>Club</i>${esc(bio.club)}</span>` : ""}
      ${bio.caps != null ? `<span><i>Caps</i>${bio.caps}</span>` : ""}
      ${bio.goals ? `<span><i>Career goals</i>${bio.goals}</span>` : ""}
    </div>` : ""}
    ${wc.apps ? `<div class="eyebrow">This World Cup</div><div class="pl-wc">
      <div class="pw"><b>${wc.apps}</b><span>Played</span></div>
      ${isGK
        ? `<div class="pw"><b>${wc.cs}</b><span>Clean sheet${wc.cs !== 1 ? "s" : ""}</span></div>
      <div class="pw"><b>${wc.ga}</b><span>Conceded</span></div>`
        : isDF
        ? `<div class="pw"><b>${wc.cs}</b><span>Clean sheet${wc.cs !== 1 ? "s" : ""}</span></div>
      <div class="pw"><b>${wc.g}</b><span>Goal${wc.g !== 1 ? "s" : ""}</span></div>`
        : `<div class="pw"><b>${wc.g}</b><span>Goal${wc.g !== 1 ? "s" : ""}</span></div>
      <div class="pw"><b>${wc.a}</b><span>Assist${wc.a !== 1 ? "s" : ""}</span></div>`}
      <div class="pw"><b class="pw-cards">${wc.y || wc.rc ? `${wc.y ? `<span class="cc cc-y">${wc.y}</span>` : ""}${wc.rc ? `<span class="cc cc-r">${wc.rc}</span>` : ""}` : "0"}</b><span>Cards</span></div>
    </div>` : ""}
    ${(boxHtml || acts) ? `<div class="eyebrow">In this match</div>${boxHtml ? `<div class="pl-box">${boxHtml}</div>` : ""}${acts ? `<div class="pl-acts">${acts}</div>` : ""}` : ""}
    <button class="pl-compare" data-compare-seed="${esc(name)}|${code}">${ICO.compare} Compare with another player</button>`;
  const cmpBtn = $("#playerBody [data-compare-seed]");
  if (cmpBtn) cmpBtn.onclick = () => { const [n, c] = cmpBtn.dataset.compareSeed.split("|"); $("#playerDialog").close(); openCompareSearch({ name: n, code: c }); };
  showSheet($("#playerDialog"));
}
const ordinal = n => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/* ---------------- global search (teams · players · matches) ---------------- */
// Result rows reuse the existing data-squad / data-player / data-mid delegation, so a tap
// opens the right sheet; #searchResults' own listener just closes the overlay first.
let SIDX = null;
function buildSearchIndex() {
  const teams = Object.keys(S.teams).map(c => ({ code: c, name: S.teams[c].name, conf: S.teams[c].conf || "" }));
  const players = [];
  for (const [code, sq] of Object.entries(S.squads || {}))
    for (const p of (sq.players || [])) players.push({ name: (p.name || "").replace(" (captain)", ""), code, club: p.club || "" });
  const matches = S.matches.map(m => {
    const h = slotInfo(m, "home"), a = slotInfo(m, "away");
    return { id: m.id, hc: h.code, ac: a.code,
      hn: h.code ? S.teams[h.code].name : slotText(m, "home", h),
      an: a.code ? S.teams[a.code].name : slotText(m, "away", a),
      stage: m.group ? "Group " + m.group : (m.round || ""), city: (m.city || "").split(",")[0] };
  });
  return { teams, players, matches };
}
let compareSeed = null;   // when set, the search overlay is in "pick a player to compare" mode
function openSearch() { compareSeed = null; openSearchOverlay(); }
function openCompareSearch(seed) { compareSeed = seed; openSearchOverlay(); }
function openSearchOverlay() {
  SIDX = buildSearchIndex();
  const inp = $("#searchInput");
  inp.value = ""; inp.placeholder = compareSeed ? `Compare ${compareSeed.name} with…` : "Teams, players, matches…";
  renderSearch("");
  showSheet($("#searchDialog"));
  $("#searchResults").onclick = e => {              // close, then let the doc handler open the target…
    const cmp = e.target.closest("[data-compare]");  // …unless we're in compare mode and a player was picked
    if (cmp) { const [n, c] = cmp.dataset.compare.split("|"); const seed = compareSeed; compareSeed = null; $("#searchDialog").close(); openCompare(seed, { name: n, code: c }); return; }
    $("#searchDialog").close();
  };
  setTimeout(() => inp.focus(), 60);
}
function renderSearch(raw) {
  const q = raw.trim().toLowerCase(), res = $("#searchResults"), cmp = !!compareSeed;
  const tname = c => esc(S.teams[c]?.name || c);
  if (!q) { res.innerHTML = `<div class="sr-hint">${cmp ? `Pick a player to compare with <b>${esc(compareSeed.name)}</b>.` : "Jump to any team, player or match."}</div>`; return; }
  const has = s => (s || "").toLowerCase().includes(q);
  // relevance: a word that *starts* with the query beats a mid-word hit (so "mess" → Messi, not a club coincidence)
  const rank = s => { const n = (s || "").toLowerCase(); return n.startsWith(q) ? 0 : n.split(/\s+/).some(w => w.startsWith(q)) ? 1 : 2; };
  const byRank = key => (a, b) => rank(key(a)) - rank(key(b)) || key(a).localeCompare(key(b));
  const players = SIDX.players.filter(p => (has(p.name) || has(p.club)) && !(cmp && p.name === compareSeed.name && p.code === compareSeed.code)).sort(byRank(p => p.name)).slice(0, cmp ? 12 : 8);
  const playerRowHtml = (p, attr) => { const ph = playerPhoto(p.name, p.code);
    return `<button class="sr-row" ${attr}>${ph ? `<span class="lead-face" style="background-image:url('${ph}')"></span>` : `<span class="fl">${flag(p.code)}</span>`}<span class="sr-name">${esc(p.name)}<small>${flag(p.code)} ${tname(p.code)}${p.club ? ` · ${esc(p.club)}` : ""}</small></span></button>`; };
  if (cmp) {   // compare mode: players only, tapping picks the second player
    res.innerHTML = players.length ? `<div class="sr-label">Compare with…</div>` + players.map(p => playerRowHtml(p, `data-compare="${esc(p.name)}|${p.code}"`)).join("") : `<div class="sr-hint">No players match “${esc(raw.trim())}”.</div>`;
    return;
  }
  const teams = SIDX.teams.filter(t => has(t.name) || t.code.toLowerCase() === q || has(t.conf)).sort(byRank(t => t.name)).slice(0, 6);
  const matches = SIDX.matches.filter(m => has(m.hn) || has(m.an) || has(m.city) || has(m.stage)).slice(0, 6);
  const teamHtml = teams.length ? `<div class="sr-label">Teams</div>` + teams.map(t =>
    `<button class="sr-row" data-squad="${t.code}"><span class="fl">${flag(t.code)}</span><span class="sr-name">${esc(t.name)}<small>${esc(t.conf)}</small></span></button>`).join("") : "";
  const playerHtml = players.length ? `<div class="sr-label">Players</div>` + players.map(p => playerRowHtml(p, `data-player="${esc(p.name)}|${p.code}"`)).join("") : "";
  const matchHtml = matches.length ? `<div class="sr-label">Matches</div>` + matches.map(m =>
    `<button class="sr-row" data-mid="${m.id}"><span class="sr-vs">${m.hc ? flag(m.hc) : "•"}${m.ac ? flag(m.ac) : "•"}</span><span class="sr-name">${esc(m.hn)} <i>v</i> ${esc(m.an)}<small>${esc(m.stage)}${m.city ? ` · ${esc(m.city)}` : ""}</small></span></button>`).join("") : "";
  res.innerHTML = (teamHtml + playerHtml + matchHtml) || `<div class="sr-hint">No teams, players or matches match “${esc(raw.trim())}”.</div>`;
}
// feed scorer names (e.g. "Cyle LARIN") and squad names (e.g. "Cyle Larin") differ in case and
// sometimes fullness — match tolerantly so a player picked from search still finds their feed stats.
function sameName(a, b) {
  if (a === b) return true;
  const x = normName(a), y = normName(b);
  return x === y || (x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)));
}
// a player's tournament + career line, for the comparison view
function playerStats(name, code, ts) {
  const hit = list => list.find(p => p.code === code && sameName(p.name, name));
  const sc = hit(ts.scorers), as = hit(ts.assisters), bk = hit(ts.booked), ke = hit(ts.keepers);
  const bio = squadBio(name, code) || {};
  return { goals: sc?.goals || 0, assists: sc?.assists ?? as?.assists ?? 0, y: bk?.y || 0, r: bk?.r || 0, cs: ke?.cs || 0,
    caps: bio.caps, careerGoals: bio.goals, club: bio.club, pos: bio.pos, photo: bestPhoto(name, code) || bio.photo || "" };
}
// head-to-head comparison of two players (reuses the player dialog)
function openCompare(a, b) {
  if (!a || !b) return;
  const ts = tournamentStats();
  const A = playerStats(a.name, a.code, ts), B = playerStats(b.name, b.code, ts);
  const POS = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" };
  const head = (p, side) => `<div class="cmp-p">
    ${p.photo ? `<span class="pl-face" style="background-image:url('${p.photo}')"></span>` : `<span class="pl-face pl-flag">${flag(side.code)}</span>`}
    <b>${esc(side.name)}</b><span>${flag(side.code)} ${esc(S.teams[side.code]?.name || side.code)}</span>${p.pos ? `<span class="cmp-pos">${POS[p.pos] || p.pos}</span>` : ""}</div>`;
  const row = (label, av, bv, hi = true) => {
    const an = +av || 0, bn = +bv || 0;
    return `<div class="cmp-row"><span class="cmp-a ${hi && an > bn ? "win" : ""}">${av ?? "–"}</span><span class="cmp-lbl">${label}</span><span class="cmp-b ${hi && bn > an ? "win" : ""}">${bv ?? "–"}</span></div>`;
  };
  $("#playerTitle").textContent = "Compare";
  $("#playerBody").innerHTML = `<div class="cmp">
    <div class="cmp-head">${head(A, a)}<span class="cmp-vs">vs</span>${head(B, b)}</div>
    <div class="eyebrow">This tournament</div>
    <div class="cmp-rows">
      ${row("Goals", A.goals, B.goals)}
      ${row("Assists", A.assists, B.assists)}
      ${row("Clean sheets", A.cs, B.cs)}
      ${row("Yellow cards", A.y, B.y, false)}
      ${row("Red cards", A.r, B.r, false)}
    </div>
    ${(A.caps != null || B.caps != null || A.club || B.club) ? `<div class="eyebrow">Career</div><div class="cmp-rows">
      ${row("Caps", A.caps, B.caps)}
      ${row("Career goals", A.careerGoals, B.careerGoals)}
      <div class="cmp-row"><span class="cmp-a cmp-txt">${A.club ? esc(A.club) : "–"}</span><span class="cmp-lbl">Club</span><span class="cmp-b cmp-txt">${B.club ? esc(B.club) : "–"}</span></div>
    </div>` : ""}
    <button class="pl-compare" data-recompare="${esc(a.name)}|${a.code}">${ICO.compare} Compare ${esc(a.name)} with someone else</button></div>`;
  const re = $("#playerBody [data-recompare]");
  if (re) re.onclick = () => { const [n, c] = re.dataset.recompare.split("|"); $("#playerDialog").close(); openCompareSearch({ name: n, code: c }); };
  showSheet($("#playerDialog"));
}

/* ---------------- render: groups ---------------- */
const TABLE_COLS = `<colgroup><col class="c-name"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-gd"><col class="c-pts"></colgroup>`;
function groupTable(g, i) {
  const rows = standings(g);
  const started = S.matches.some(x => x.group === g && status(x) === ST.FT && res(x)?.h != null);
  const qtag = code => {                                  // through / out-of-top-two markers (same engine as the stakes line)
    if (!started) return "";
    const q = _qualScan(g, code);
    return q.clinched ? `<span class="qx qx-in" title="Through to the Round of 32">Q</span>`
      : q.out ? `<span class="qx qx-out" title="Can no longer finish in the top two">out</span>` : "";
  };
  return `<div class="gtable" style="--i:${i}"><h4>Group <span>${g}</span></h4>
    <table>${TABLE_COLS}<thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>
    ${rows.map((r, idx) => `<tr class="${idx < 2 ? "q1" : idx === 2 ? "q3" : ""} ${r.code === S.fav ? "is-fav" : ""}" data-g="${g}" data-code="${r.code}">
      <td class="tname" title="View ${esc(S.teams[r.code].name)}" data-squad="${r.code}" role="button" tabindex="0"><span class="fl">${flag(r.code)}</span>${esc(S.teams[r.code].name)}${qtag(r.code)}</td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join("")}
    </tbody></table></div>`;
}
// the 48-team format sends 8 of the 12 third-placed teams through — a ranking that's impossible to
// eyeball across 12 separate tables. Rank them by FIFA's third-place criteria (pts → GD → GF) and
// draw the cut line after the 8th. Pure client math, no extra data.
function thirdPlaceRace() {
  const rows = [];
  for (const g of GROUPS) { const t = standings(g)[2]; if (t) rows.push({ group: g, code: t.code, pts: t.pts, gd: t.gf - t.ga, gf: t.gf }); }
  return rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || tiebreakRank(a.code) - tiebreakRank(b.code));
}
function thirdRaceHTML() {
  const anyPlayed = S.matches.some(m => m.group && status(m) === ST.FT && res(m)?.h != null);
  const rows = thirdPlaceRace();
  if (!anyPlayed || rows.length < 3) return "";
  const sign = n => (n > 0 ? "+" : "") + n;
  return `<div class="eyebrow">Race for the best third places</div>
    <div class="third-race">${rows.map((r, i) => `<div class="tr-row ${i < 8 ? "tr-in" : "tr-out"} ${r.code === S.fav ? "is-fav" : ""}" data-squad="${r.code}" role="button" tabindex="0">
      <span class="tr-rank">${i + 1}</span><span class="fl">${flag(r.code)}</span>
      <span class="tr-name">${esc(S.teams[r.code]?.name || r.code)}<small>Group ${r.group}</small></span>
      <span class="tr-gd">${sign(r.gd)}</span><span class="tr-pts">${r.pts}<small>pts</small></span></div>${i === 7 && rows.length > 8 ? `<div class="tr-cut"><span>Top 8 advance</span></div>` : ""}`).join("")}</div>
    <p class="sim-ko-hint">Ranked by points, then goal difference, then goals scored — the eight best of twelve reach the Round of 32.</p>`;
}
// read-only "if the groups ended today" Round-of-32 — resolved purely from live standings (group
// winners/runners-up + the best-8 thirds routed through FIFA's slot constraints). Never touches the
// user's saved prediction; that interactive bracket lives in Predict.
function projectedR32() {
  const order = {}; GROUPS.forEach(g => order[g] = standings(g).map(r => r.code));
  const thirds = thirdPlaceRace().slice(0, 8).map(r => r.code);
  const alloc = allocateThirdsPure(r32ThirdSlots(), thirds.map(code => ({ code, g: groupOf(code) })));
  const side = (m, s) => {
    if (s.team) return s.team;
    const sh = s.short || "";
    if (/^[12][A-L]$/.test(sh)) { const o = order[sh[1]] || []; return sh[0] === "1" ? o[0] : o[1]; }
    if (sh.startsWith("3rd")) return alloc ? alloc[m.id + ":" + (s === m.home ? "home" : "away")] : null;
    return null;
  };
  return S.matches.filter(m => m.stage === "r32").sort((a, b) => a.num - b.num)
    .map(m => ({ m, h: side(m, m.home), a: side(m, m.away) }));
}
function projR32HTML() {
  const allDone = GROUPS.every(g => S.matches.filter(x => x.group === g).every(x => status(x) === ST.FT));
  const anyPlayed = S.matches.some(m => m.group && status(m) === ST.FT && res(m)?.h != null);
  if (!anyPlayed) return "";
  const ties = projectedR32();
  const cell = (code, sh) => code && S.teams[code]
    ? `<span class="fl">${flag(code)}</span><span class="pj-nm">${esc(S.teams[code].name)}</span>`
    : `<span class="fl">·</span><span class="pj-nm pj-tbd">${esc(sh || "TBD")}</span>`;
  const rows = ties.map(({ m, h, a }) => `<button class="pj-row" data-mid="${m.id}">
    <span class="pj-side">${cell(h, m.home.short)}</span><span class="pj-v">v</span><span class="pj-side pj-r">${cell(a, m.away.short)}</span></button>`).join("");
  return `<details class="proj"${allDone ? " open" : ""}><summary><span>Projected Round of 32</span><small>if the groups ended today</small></summary>
    <div class="proj-body">${rows}</div>
    <p class="sim-ko-hint">Live group winners &amp; runners-up plus the best-8 third places, routed through FIFA's slot rules. Make your own calls in <b>Predict</b>.</p></details>`;
}
// a team's current-standings strength (for projecting knockout winners)
function teamStrength(code) {
  const g = groupOf(code); if (!g) return -1;
  const r = standings(g).find(x => x.code === code);
  return r ? r.pts * 1000 + (r.gf - r.ga) * 10 + r.gf : -1;
}
// project the whole knockout bracket from live standings: winner of every match = the stronger team
// (ties → the "home"/upper slot). Returns { W: matchNum→winnerCode }.
function projectBracket() {
  const W = {};
  const str = c => (c ? (S.teams[c]?.elo || 0) : -1);   // project knockout winners by Elo (matches-played-agnostic), not the partial group table
  const pick = (h, a) => (h && a) ? (str(h) >= str(a) ? h : a) : (h || a || null);
  for (const { m, h, a } of projectedR32()) W[m.num] = pick(h, a);
  S.matches.filter(m => ["r16", "qf", "sf", "final"].includes(m.stage)).sort((x, y) => x.num - y.num)
    .forEach(m => { const side = s => s.team || (s.feeds ? W[s.feeds] : null); W[m.num] = pick(side(m.home), side(m.away)); });
  return W;
}
// a team's projected route to the final from where they currently sit: their R32 tie, then each
// onward round assuming they keep winning, with the opponent = the projected winner of the other side.
function roadToFinal(code) {
  const r32 = projectedR32().find(t => t.h === code || t.a === code);
  if (!r32) return null;                                    // not projected into the Round of 32
  const W = projectBracket();
  const feedsTo = {}; S.matches.forEach(m => ["home", "away"].forEach(s => { if (m[s]?.feeds) feedsTo[m[s].feeds] = m.num; }));
  const byNum = n => S.matches.find(m => m.num === n);
  const path = [{ m: r32.m, opp: r32.h === code ? r32.a : r32.h }];
  let cur = r32.m, guard = 0;
  while (guard++ < 6) {
    const nextNum = feedsTo[cur.num]; if (!nextNum) break;  // the final feeds nowhere
    const nm = byNum(nextNum); if (!nm || nm.stage === "third") break;
    const sib = [nm.home, nm.away].find(s => s.feeds && s.feeds !== cur.num);
    path.push({ m: nm, opp: sib ? W[sib.feeds] : null });
    cur = nm;
  }
  return { code, path, reachesFinal: cur.stage === "final" };
}
function roadSection(code) {
  // only project a team's route once they've actually played — before that, standings are all level
  // and any "road" would be arbitrary tiebreak noise.
  const teamPlayed = S.matches.some(m => matchHasTeam(m, code) && status(m) === ST.FT && res(m)?.h != null);
  if (!teamPlayed) {
    const next = S.matches.filter(m => matchHasTeam(m, code) && status(m) === ST.SCHED).sort((a, b) => a.utc.localeCompare(b.utc))[0];
    return `<div class="eyebrow">Road to the final</div><div class="empty">${esc(S.teams[code]?.name || code)}'s projected route opens once they kick off${next ? ` — first up ${fmt(next.utc, { weekday: "short", day: "numeric", month: "short" })}` : ""}.</div>`;
  }
  const road = roadToFinal(code);
  if (!road) return `<div class="eyebrow">Road to the final</div><div class="empty">As it stands, ${esc(S.teams[code]?.name || code)} are projected to miss the Round of 32 — a couple of group wins flips that.</div>`;
  const t = S.teams[code];
  const rows = road.path.map(({ m, opp }) => {
    const oc = opp && S.teams[opp];
    return `<button class="road-row" data-mid="${m.id}">
      <span class="road-rd">${esc(m.round)}</span>
      <span class="road-body">
        <span class="road-opp">${oc ? `<i>vs</i> <span class="fl">${flag(opp)}</span>${esc(S.teams[opp].name)}` : `<i>vs the projected winners</i>`}</span>
        <span class="road-meta">${fmt(m.utc, { day: "numeric", month: "short" })} · ${esc((m.city || "").split(",")[0])}</span>
      </span></button>`;
  }).join("");
  return `<div class="eyebrow">Road to the final${road.reachesFinal ? " ${TROPHY}" : ""}</div>
    <div class="road">${rows}</div>
    <p class="sim-ko-hint">Projected from live standings — assumes ${esc(t.name)} keep winning; opponents are the stronger projected team in each tie.</p>`;
}
function renderGroups() {
  const el = $("#view-groups");
  const prev = {};                                          // capture row positions for a FLIP when standings reorder
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) el.querySelectorAll("tr[data-code]").forEach(tr => prev[tr.dataset.g + tr.dataset.code] = tr.getBoundingClientRect().top);
  el.innerHTML =
    `<div class="gwrap">${GROUPS.map((g, i) => `<div class="gcol">${groupTable(g, i)}${groupOutlookHTML(g)}</div>`).join("")}</div>
     <div class="legend"><span class="l1"><i></i>Top 2 advance to the Round of 32</span><span class="l3"><i></i>3rd place — eight best advance</span><button class="legend-about" data-about>ⓘ How the format works</button></div>
     ${thirdRaceHTML()}
     ${projR32HTML()}`;
  if (!reduce && Object.keys(prev).length) el.querySelectorAll("tr[data-code]").forEach(tr => {
    const old = prev[tr.dataset.g + tr.dataset.code]; if (old == null) return;
    const dy = old - tr.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    tr.style.transition = "none"; tr.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => { tr.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)"; tr.style.transform = ""; });
  });
}

// human label for an unresolved knockout slot fed by another match's winner/loser
const STAGE_SHORT = { r32: "R32", r16: "R16", qf: "QF", sf: "SF", final: "Final" };
function feedLabel(num, loser) {
  const m = S.matches.find(x => x.num === num && x.stage !== "group");
  if (!m) return (loser ? "Loser " : "Winner ") + "M" + num;
  const peers = S.matches.filter(x => x.stage === m.stage).sort((a, b) => a.num - b.num);
  const idx = peers.indexOf(m) + 1;
  const sh = STAGE_SHORT[m.stage] || m.stage.toUpperCase();
  return (loser ? "Loser " : "Winner ") + sh + "-" + idx;
}
function slotText(m, side, si) {
  if (!si.ph) return si.name;                         // a real team is known
  const slot = m[side];
  if (slot.feeds) return feedLabel(slot.feeds, false); // "Winner QF1"
  if (slot.feedsL) return feedLabel(slot.feedsL, true);// "Loser SF1" (third-place)
  return si.name;                                      // group placeholder — the friendly "Runner-up Group A" (not the terse "2A")
}
// position every bracket card at the vertical midpoint of its feeder matches (a true bracket tree)
function layoutBracket(scope) {
  const bracket = scope.querySelector(".bracket");
  if (!bracket) return;
  const els = {};
  bracket.querySelectorAll(".bm[data-num]").forEach(el => els[el.dataset.num] = el);
  const nums = Object.keys(els);
  if (!nums.length) return;
  const cardH = els[nums[0]].offsetHeight || 70, step = cardH + 18;
  const byNum = {};
  S.matches.forEach(m => { if (m.stage !== "group") byNum[m.num] = m; });
  const y = {};
  let leaf = 0;
  (function place(num) {
    if (y[num] != null) return y[num];
    const m = byNum[num]; if (!m) return 0;
    const kids = [m.home.feeds, m.away.feeds].filter(Boolean);
    if (!kids.length) { return y[num] = (leaf++) * step; }      // R32 leaf
    const cy = kids.map(place);
    return y[num] = cy.reduce((s, v) => s + v, 0) / cy.length;  // midpoint of feeders
  })((S.matches.find(m => m.stage === "final") || {}).num);
  const third = S.matches.find(m => m.stage === "third");
  if (third) y[third.num] = leaf * step;                        // consolation match sits at the bottom
  let H = 0;
  Object.entries(y).forEach(([num, val]) => {
    const el = els[num]; if (!el) return;
    el.style.position = "absolute"; el.style.top = val + "px";
    H = Math.max(H, val + el.offsetHeight); // use each card's real height (3rd-place card is taller)
  });
  bracket.querySelectorAll(".bcol-matches").forEach(c => {
    c.style.position = "relative"; c.style.height = H + "px";
    const w = c.querySelector(".bm")?.offsetWidth; if (w) c.style.width = w + "px";
  });
  drawBracketLines(scope);
}
// draw orthogonal connector lines between feeder matches and their target (winner advances)
function drawBracketLines(scope) {
  const bracket = scope.querySelector(".bracket");
  const svg = scope.querySelector(".bracket-lines");
  if (!bracket || !svg) return;
  const W = bracket.scrollWidth, H = bracket.scrollHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  const br = bracket.getBoundingClientRect(), pos = {};
  bracket.querySelectorAll(".bm[data-num]").forEach(el => {
    const r = el.getBoundingClientRect();
    pos[el.dataset.num] = { left: r.left - br.left, right: r.right - br.left, cy: r.top - br.top + r.height / 2 };
  });
  let d = "";
  S.matches.filter(m => m.stage !== "group" && m.stage !== "third").forEach(m => {
    const tgt = pos[m.num]; if (!tgt) return;
    [m.home, m.away].forEach(s => {
      const src = s.feeds && pos[s.feeds]; if (!src) return; // winner-advance links only
      const midX = src.right + (tgt.left - src.right) / 2;
      d += `M${src.right} ${src.cy} H${midX} V${tgt.cy} H${tgt.left} `;
    });
  });
  svg.innerHTML = d ? `<path d="${d}"/>` : "";
}
/* ============================================================
   SIMULATOR — order groups, pick thirds, tap winners
   ============================================================ */
const saveSim = () => localStorage.setItem("wc26.sim", JSON.stringify(S.sim));
// encode the whole prediction into a short URL-safe string (and back)
function encodeSim() {
  const json = JSON.stringify({ o: S.sim.order, t: S.sim.thirds, k: S.sim.ko });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeSim(str) {
  try {
    const json = decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
    const c = JSON.parse(json);
    if (!c || typeof c !== "object") return null;
    return { order: c.o && typeof c.o === "object" ? c.o : {}, thirds: Array.isArray(c.t) ? c.t : [], ko: c.k && typeof c.k === "object" ? c.k : {} };
  } catch { return null; }
}
function flashToast(msg) {
  let t = $("#flashToast");
  if (!t) { t = document.createElement("div"); t.id = "flashToast"; t.className = "flash-toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
}
/* compact prediction codec (~23 bytes → ~31-char link); decode falls back to the old JSON format */
const FACT = [1, 1, 2, 6, 24];
const groupTeams = g => [...new Set(S.matches.filter(m => m.group === g).flatMap(m => [m.home.team, m.away.team]).filter(Boolean))].sort();
function permToIndex(order, canon) {
  const pool = canon.slice(); let idx = 0;
  for (let i = 0; i < canon.length; i++) { const p = pool.indexOf(order[i]); if (p < 0) return 0; idx += p * FACT[canon.length - 1 - i]; pool.splice(p, 1); }
  return idx;
}
function indexToPerm(idx, canon) {
  const pool = canon.slice(), out = [];
  for (let i = 0; i < canon.length; i++) { const f = FACT[canon.length - 1 - i], p = Math.min(Math.floor(idx / f), pool.length - 1); idx %= f; out.push(pool[p]); pool.splice(p, 1); }
  return out;
}
const bytesToB64url = arr => btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlToBytes = str => Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const koOrder = () => S.matches.filter(m => m.stage !== "group").sort((a, b) => a.num - b.num);
function packSim() {
  const bytes = [1];                                                  // version 1
  for (const g of GROUPS) bytes.push(permToIndex(simOrder(g), groupTeams(g)) & 0xff);
  let mask = 0; GROUPS.forEach((g, i) => { if (S.sim.thirds.includes(simOrder(g)[2])) mask |= 1 << i; });
  bytes.push(mask & 0xff, (mask >> 8) & 0xff);
  const alloc = allocateThirds(); let acc = 0, bits = 0;
  for (const m of koOrder()) {
    const { h, a } = simSlots(m, alloc), w = S.sim.ko[m.num];
    acc |= (w === h ? 1 : w === a ? 2 : 0) << bits; bits += 2;
    while (bits >= 8) { bytes.push(acc & 0xff); acc >>= 8; bits -= 8; }
  }
  if (bits > 0) bytes.push(acc & 0xff);
  return bytesToB64url(bytes);
}
function applyPacked(bytes) {
  if (bytes[0] !== 1) return false;
  const order = {}; GROUPS.forEach((g, i) => { order[g] = indexToPerm(bytes[1 + i], groupTeams(g)); });
  S.sim.order = order;
  const mask = bytes[13] | (bytes[14] << 8), thirds = [];
  GROUPS.forEach((g, i) => { if (mask & (1 << i)) thirds.push(order[g][2]); });
  S.sim.thirds = thirds; S.sim.ko = {};
  const alloc = allocateThirds(); let acc = 0, bits = 0, idx = 15;
  for (const m of koOrder()) {                                        // num order → feeders resolved before they're needed
    while (bits < 2) { acc |= (bytes[idx++] || 0) << bits; bits += 8; }
    const v = acc & 3; acc >>= 2; bits -= 2;
    if (!v) continue;
    const { h, a } = simSlots(m, alloc), code = v === 1 ? h : a;
    if (code) S.sim.ko[m.num] = code;
  }
  return true;
}
// scrub a decoded (legacy-JSON) prediction so a hand-crafted #p= link can't inject fake team codes that would
// crash renderSim at S.teams[c].name — keep only real codes / valid group permutations.
function sanitizeSim(d) {
  const out = { order: {}, thirds: [], ko: {} };
  for (const g of GROUPS) {
    const canon = groupTeams(g), o = d.order?.[g];
    if (Array.isArray(o) && o.length === canon.length && new Set(o).size === o.length && o.every(c => canon.includes(c))) out.order[g] = o;
  }
  out.thirds = (Array.isArray(d.thirds) ? d.thirds : []).filter(c => typeof c === "string" && S.teams[c]);
  for (const [k, v] of Object.entries(d.ko || {})) if (/^\d+$/.test(k) && typeof v === "string" && S.teams[v]) out.ko[k] = v;
  return out;
}
function loadSharedSim(enc) {
  try { const b = b64urlToBytes(enc); if (b[0] === 1 && applyPacked(b)) return true; } catch { /* not compact → try JSON */ }
  const d = decodeSim(enc); if (d) { S.sim = sanitizeSim(d); return true; }
  return false;
}

function simOrder(g) {
  if (!S.sim.order[g] || S.sim.order[g].length !== 4) S.sim.order[g] = standings(g).map(r => r.code);
  return S.sim.order[g];
}
// parse allowed groups from a third-place slot short label "3rd A/B/C/D/F"
const thirdAllowed = s => (s.short || "").replace("3rd ", "").split("/");

// the 8 constrained "3rd …" R32 slots, each with its allowed groups
function r32ThirdSlots() {
  const slots = [];
  S.matches.filter(m => m.stage === "r32").forEach(m => ["home", "away"].forEach(side => {
    if ((m[side].short || "").startsWith("3rd")) slots.push({ key: m.id + ":" + side, allowed: thirdAllowed(m[side]) });
  }));
  return slots;
}
// assign chosen third-place teams to the constrained slots (backtracking); pure — no shared state.
// Returns {slotKey: code} or null if no valid assignment exists.
function allocateThirdsPure(slots, picks) {
  if (picks.length !== slots.length) return null;
  const used = new Array(picks.length).fill(false), assign = {};
  const order = slots.map((s, i) => i).sort((a, b) =>        // most-constrained slot first
    picks.filter(p => slots[a].allowed.includes(p.g)).length - picks.filter(p => slots[b].allowed.includes(p.g)).length);
  function bt(k) {
    if (k === order.length) return true;
    const s = slots[order[k]];
    for (let i = 0; i < picks.length; i++) {
      if (used[i] || !s.allowed.includes(picks[i].g)) continue;
      used[i] = true; assign[s.key] = picks[i].code;
      if (bt(k + 1)) return true;
      used[i] = false; delete assign[s.key];
    }
    return false;
  }
  return bt(0) ? assign : null;
}
// predictor's allocator — over the user's chosen thirds. Keeps the "impossible" sentinel its callers expect.
function allocateThirds() {
  const slots = r32ThirdSlots();
  const picks = S.sim.thirds.map(code => ({ code, g: groupOf(code) }));
  if (picks.length !== slots.length) return null;
  return allocateThirdsPure(slots, picks) || "impossible";
}
const groupOf = code => { const m = S.matches.find(m => m.group && (m.home.team === code || m.away.team === code)); return m?.group; };

// resolve both sides of a knockout match inside the simulation
function simSlots(m, alloc) {
  const side = s => {
    if (s.team) return s.team;
    const sh = s.short || "";
    if (/^[12][A-L]$/.test(sh)) { const o = simOrder(sh[1]); return sh[0] === "1" ? o[0] : o[1]; }
    if (sh.startsWith("3rd")) return alloc && alloc !== "impossible" ? alloc[m.id + ":" + (s === m.home ? "home" : "away")] : null;
    const num = s.feeds || s.feedsL;
    if (num) {
      const fm = S.matches.find(x => x.num === num && x.stage !== "group");
      const winner = S.sim.ko[num];
      if (!fm || !winner) return null;
      const fs = simSlots(fm, alloc);
      if (!fs.h || !fs.a) return null;
      return s.feeds ? winner : (winner === fs.h ? fs.a : fs.h);
    }
    return null;
  };
  return { h: side(m.home), a: side(m.away) };
}
// drop picks that are no longer reachable after upstream edits
function pruneSim() {
  const alloc = allocateThirds();
  S.matches.filter(m => m.stage !== "group").sort((a, b) => a.num - b.num).forEach(m => {
    const pick = S.sim.ko[m.num];
    if (pick == null) return;
    const { h, a } = simSlots(m, alloc);
    if (pick !== h && pick !== a) delete S.sim.ko[m.num];
  });
}
// pick a valid default set of 8 third-place teams so the knockout bracket is visible (and tappable) by default
function seedSimThirds() {
  GROUPS.forEach(g => { S.sim.order[g] = standings(g).map(r => r.code); });   // sync group order to live standings
  const all = GROUPS.map(g => S.sim.order[g][2]);
  const rank = c => { const r = standings(groupOf(c)).find(x => x.code === c) || {}; return (r.pts || 0) * 1000 + (r.gd || 0) * 10 + (r.gf || 0); };
  const ranked = all.slice().sort((a, b) => rank(b) - rank(a));
  S.sim.thirds = ranked.slice(0, 8);
  let guard = 0;
  while (allocateThirds() === "impossible" && guard++ < 200)
    S.sim.thirds = ranked.slice().sort(() => Math.random() - 0.5).slice(0, 8);
}

// score the saved prediction against reality: predicted group top-2 vs live standings, and KO winners vs results
function simScore() {
  const fts = S.matches.filter(m => status(m) === ST.FT && res(m)?.h != null);
  if (!fts.length) return null;
  let gSpots = 0, gTotal = 0;
  GROUPS.forEach(g => {
    if (!fts.some(m => m.group === g)) return;            // only score groups that have kicked off
    const pred = simOrder(g).slice(0, 2);
    const actual = standings(g).slice(0, 2).map(r => r.code);
    gTotal += 2; pred.forEach(c => { if (actual.includes(c)) gSpots++; });
  });
  let koHit = 0, koDecided = 0;
  S.matches.filter(m => m.stage !== "group").forEach(m => {
    const r = res(m); if (!(r && r.st === ST.FT && r.h != null)) return;
    const hc = slotInfo(m, "home").code, ac = slotInfo(m, "away").code; if (!hc || !ac) return;
    const homeWon = r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1));
    const pick = S.sim.ko[m.num];
    if (pick) { koDecided++; if (pick === (homeWon ? hc : ac)) koHit++; }
  });
  return gTotal || koDecided ? { gSpots, gTotal, koHit, koDecided } : null;
}
// a shareable champion card — drawn on a canvas (same-origin flag SVG → not tainted), then offered via
// the Web Share API (files) where supported, falling back to a download. Turns the prediction into reach.
function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
async function shareChampionImage(code) {
  const t = code && S.teams[code]; if (!t) { flashToast("Crown a champion first"); return; }
  try { await document.fonts.ready; } catch { /* fall back to system fonts */ }
  const W = 1080, H = 1080, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0c1a28"); g.addColorStop(1, "#08231b");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, col) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, H); };
  glow(170, 150, 460, "rgba(11,163,96,.34)"); glow(930, 940, 480, "rgba(232,185,49,.24)");
  x.textAlign = "center";
  x.fillStyle = "#E8B931"; x.font = "700 36px Archivo, sans-serif"; x.fillText("FIFA WORLD CUP 2026", W / 2, 132);
  x.fillStyle = "#9fb0bd"; x.font = "600 30px 'Instrument Sans', sans-serif"; x.fillText("MY PREDICTED CHAMPION", W / 2, 198);
  const img = new Image(); img.src = "assets/flags/" + code + ".svg";
  try { await img.decode(); } catch { /* draw without the flag */ }
  const fw = 420, fh = Math.round(fw * ((img.naturalHeight / img.naturalWidth) || 0.66)), fx = W / 2 - fw / 2, fy = 300;
  x.save(); rrect(x, fx, fy, fw, fh, 16); x.clip(); x.fillStyle = "#fff"; x.fillRect(fx, fy, fw, fh);
  if (img.complete && img.naturalWidth) x.drawImage(img, fx, fy, fw, fh); x.restore();
  x.lineWidth = 2; x.strokeStyle = "rgba(255,255,255,.22)"; rrect(x, fx, fy, fw, fh, 16); x.stroke();
  x.fillStyle = "#fff"; x.font = "900 96px Archivo, sans-serif"; x.fillText(t.name.toUpperCase(), W / 2, fy + fh + 152);
  x.fillStyle = "#1FD673"; x.font = "800 52px Archivo, sans-serif"; x.fillText("CHAMPIONS", W / 2, fy + fh + 226);
  x.fillStyle = "#7b8894"; x.font = "500 28px 'Spline Sans Mono', monospace"; x.fillText("July 19 · MetLife Stadium", W / 2, H - 112);
  x.fillStyle = "#5b6b7a"; x.font = "500 25px 'Spline Sans Mono', monospace"; x.fillText((location.host + location.pathname).replace(/\/$/, ""), W / 2, H - 62);
  c.toBlob(async blob => {
    if (!blob) { flashToast("Couldn't make the image"); return; }
    const file = new File([blob], "my-wc26-champion.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `My World Cup 2026 champion: ${t.name}` }); return; } catch { /* cancelled → fall through to download */ }
    }
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "my-wc26-champion.png"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000); flashToast("Champion card saved");
  }, "image/png");
}
function renderSim() {
  const el = $("#view-sim");
  // seed a valid default set of thirds so the knockout bracket is visible & tappable from the first visit
  // (done here, not at boot, so live standings are already loaded — order reflects real results)
  if (S.sim.thirds.length === 0) { seedSimThirds(); saveSim(); }
  const alloc = allocateThirds();
  const thirdsDone = S.sim.thirds.length === 8;
  const champ = S.sim.ko[104];

  const groupCard = (g, i) => {
    const order = simOrder(g);
    return `<div class="sgroup" style="--i:${i}"><h4>Group <span>${g}</span></h4>
      ${order.map((c, idx) => `<div class="srow ${idx < 2 ? "is-q" : idx === 2 ? "is-t" : ""}">
        <span class="pos">${idx + 1}</span><span class="fl">${flag(c)}</span>
        <span class="nm">${esc(S.teams[c].name)}</span>
        <button class="up" data-g="${g}" data-i="${idx}" ${idx === 0 ? "disabled" : ""} aria-label="Move ${esc(S.teams[c].name)} up">▲</button>
      </div>`).join("")}</div>`;
  };

  const thirdChips = GROUPS.map(g => {
    const c = simOrder(g)[2];
    const on = S.sim.thirds.includes(c);
    const off = !on && thirdsDone;
    return `<button class="tchip ${on ? "is-on" : ""} ${off ? "is-off" : ""}" data-third="${c}">
      <span class="fl">${flag(c)}</span>${esc(shortName(c))}<span class="gl">${g}</span></button>`;
  }).join("");

  const cols = [["r32", "Round of 32"], ["r16", "Round of 16"], ["qf", "Quarter-finals"], ["sf", "Semi-finals"], ["final", "Final"]];
  const third = S.matches.find(m => m.stage === "third");
  const need = 8 - S.sim.thirds.length;
  const simBracket = !thirdsDone ? `<div class="empty">Pick ${need} more third-placed team${need === 1 ? "" : "s"} above and your knockout bracket appears here — then tap your way to a champion.</div>`
    : alloc === "impossible" ? `<div class="empty">That combination of thirds can't fill the slots — swap one and try again.</div>`
    : `<div class="bracket-scroll"><div class="bracket"><svg class="bracket-lines" aria-hidden="true"></svg>
        ${cols.map(([st, title]) => {
          const inner = S.matches.filter(m => m.stage === st).sort((a, b) => a.num - b.num).map((m, i) => simMatch(m, i, alloc)).join("")
            + (st === "final" && third ? simMatch(third, 1, alloc) : "");
          return `<div class="bcol bcol-${st}"><div class="bcol-title">${title}</div><div class="bcol-matches">${inner}</div></div>`;
        }).join("")}
      </div></div>`;

  // prominent "north star": the champion you're building toward — tap to jump to the knockout bracket
  const koMatches = S.matches.filter(m => m.stage !== "group");
  const koPicked = koMatches.filter(m => S.sim.ko[m.num] != null).length;
  const champTeaser = `<button class="sim-goal ${champ ? "is-set" : ""}" id="simGoal" type="button">
    <span class="sg-cup">${TROPHY}</span>
    ${champ
      ? `<span class="sg-fl">${flag(champ)}</span><span class="sg-tx"><b>${esc(S.teams[champ].name)}</b><small>Your predicted world champions · tap to edit the bracket</small></span>`
      : `<span class="sg-tx"><b>Crown your champion</b><small>Tap a winner in each knockout tie, all the way to the final →</small></span>`}
    <span class="sg-prog" aria-label="${koPicked} of ${koMatches.length} ties picked">${koPicked}<i>/${koMatches.length}</i></span>
  </button>`;

  // how the prediction is tracking against real results (only once something has been played)
  // "Your call vs reality" scorecard removed from the UI for now (unclear to users); simScore() kept.
  el.innerHTML = `
    <div class="sim-intro">
      <h2>Call the whole tournament ${ICO.spark}</h2>
      <p>Order each group, pick the best third-placed teams, then tap winners all the way to the final — and crown your champion. Saves on this device.</p>
      <div class="sim-actions">
        <button class="btn ghost" id="simStandings"><span class="b-lg">Use live standings</span><span class="b-sm">Standings</span></button>
        <button class="btn ghost" id="simShuffle"><span class="b-lg">Shuffle it all</span><span class="b-sm">Shuffle</span></button>
        <button class="btn ghost" id="simReset"><span class="b-lg">Start over</span><span class="b-sm">Reset</span></button>
        <button class="btn" id="simShare">${ICO.link} Share prediction</button>
        ${champ ? `<button class="btn" id="simShareImg">${ICO.camera} Champion card</button>` : ""}
      </div>
    </div>
    ${champTeaser}
    <div class="eyebrow"><span class="step-n">1</span> Order the groups — top two go through</div>
    <div class="gwrap">${GROUPS.map(groupCard).join("")}</div>
    <div class="eyebrow"><span class="step-n">2</span> Best third-placed teams <span class="tcount">${S.sim.thirds.length}/8</span></div>
    <div class="thirds">${thirdChips}</div>
    <div class="eyebrow" id="simKoHead"><span class="step-n">3</span> Tap winners through to crown your champion ${TROPHY}</div>
    ${thirdsDone && alloc !== "impossible" ? `<p class="sim-ko-hint">${ICO.tap} Tap a team in any tie to send them through — winners flow left → right to the final.</p>` : ""}
    ${simBracket}
    ${champ ? championBanner(champ, true) : ""}`;

  const goal = $("#simGoal", el);
  if (goal) goal.onclick = () => $("#simKoHead", el)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // wire: move-up
  $$(".up", el).forEach(b => b.onclick = () => {
    const g = b.dataset.g, i = +b.dataset.i;
    const o = simOrder(g);
    [o[i - 1], o[i]] = [o[i], o[i - 1]];
    // moved team may no longer be the group's third → drop stale third picks
    S.sim.thirds = S.sim.thirds.filter(c => simOrder(groupOf(c))[2] === c);
    pruneSim(); saveSim(); renderSim();
    const row = $$(`.sgroup [data-g="${g}"]`, el)[i - 1]?.closest(".srow");
    row?.classList.add("just-moved");
  });
  // wire: thirds
  $$("[data-third]", el).forEach(b => b.onclick = () => {
    const c = b.dataset.third;
    const i = S.sim.thirds.indexOf(c);
    if (i >= 0) S.sim.thirds.splice(i, 1);
    else if (S.sim.thirds.length < 8) S.sim.thirds.push(c);
    pruneSim(); saveSim(); renderSim();
  });
  // wire: bracket picks
  $$("[data-pick]", el).forEach(r => r.onclick = e => {
    const [num, code] = r.dataset.pick.split("|");
    S.sim.ko[+num] = code;
    // re-rendering rebuilds the bracket — keep the user where they are (the bracket's horizontal
    // scroll would otherwise snap back to the Round-of-32 column) instead of yanking them left.
    const sc = el.querySelector(".bracket-scroll"), sx = sc ? sc.scrollLeft : 0, wy = window.scrollY;
    pruneSim(); saveSim(); renderSim();
    const nsc = el.querySelector(".bracket-scroll"); if (nsc) nsc.scrollLeft = sx;
    window.scrollTo(0, wy);
    if (+num === 104) {
      const t = S.teams[code];
      confetti(t.c1, t.c2, { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 });
    }
  });
  // wire: actions
  $("#simStandings").onclick = () => { S.sim = { order: {}, thirds: [], ko: {} }; seedSimThirds(); saveSim(); renderSim(); };
  $("#simShuffle").onclick = () => {
    GROUPS.forEach(g => S.sim.order[g] = simOrder(g).slice().sort(() => Math.random() - .5));
    const thirds = GROUPS.map(g => simOrder(g)[2]).sort(() => Math.random() - .5);
    S.sim.thirds = thirds.slice(0, 8); S.sim.ko = {};
    let alloc2 = allocateThirds(), guard = 0;
    while (alloc2 === "impossible" && guard++ < 60) { // reshuffle until allocatable
      S.sim.thirds = thirds.slice().sort(() => Math.random() - .5).slice(0, 8);
      alloc2 = allocateThirds();
    }
    // auto-pick random winners through the bracket
    S.matches.filter(m => m.stage !== "group").sort((a, b) => a.num - b.num).forEach(m => {
      const { h, a } = simSlots(m, allocateThirds());
      if (h && a) S.sim.ko[m.num] = Math.random() < .5 ? h : a;
    });
    saveSim(); renderSim();
    const c = S.teams[S.sim.ko[104]];
    if (c) confetti(c.c1, c.c2);
  };
  $("#simReset").onclick = () => { S.sim = { order: {}, thirds: [], ko: {} }; seedSimThirds(); saveSim(); renderSim(); };
  $("#simShare").onclick = async () => {
    const url = location.origin + location.pathname + "#p=" + packSim();
    try { await navigator.clipboard.writeText(url); flashToast("Prediction link copied — share it!"); }
    catch { prompt("Copy your prediction link:", url); }
  };
  $("#simShareImg")?.addEventListener("click", () => shareChampionImage(S.sim.ko[104]));
  layoutBracket(el);
}
function simMatch(m, i, alloc) {
  const { h, a } = simSlots(m, alloc);
  const pick = S.sim.ko[m.num];
  const row = (code, other) => {
    if (!code) return `<div class="bm-row"><span class="fl">·</span><span class="nm ph">awaiting pick</span></div>`;
    const isPick = pick === code, isOut = pick && pick !== code;
    return `<div class="bm-row pickable ${isPick ? "is-pick" : ""} ${isOut ? "is-out" : ""}" data-pick="${m.num}|${code}" role="button" tabindex="0">
      <span class="fl">${flag(code)}</span><span class="nm">${esc(S.teams[code].name)}${isPick && m.stage === "final" ? " ${TROPHY}" : ""}</span></div>`;
  };
  return `<div class="bm ${m.stage === "final" ? "is-final" : ""} ${m.stage === "third" ? "is-third" : ""}" style="--i:${i}" data-num="${m.num}">
    ${m.stage === "third" ? `<div class="bm-tag">3rd place</div>` : ""}
    ${row(h, a)}${row(a, h)}
    <div class="bm-label">M${m.num} · ${fmt(m.utc, { day: "numeric", month: "short" })} · ${esc(m.city.split(",")[0])}</div></div>`;
}
function championBanner(code, predicted) {
  const t = S.teams[code];
  return `<div class="champ">
    <span class="cup">${TROPHY}</span><span class="cfl">${flag(code)}</span>
    <h3>${esc(t.name)}</h3><p>${predicted ? "Your predicted champions" : "Champions of the world"} · July 19 · MetLife</p></div>`;
}

/* ---------------- tournament stats (team + player) ---------------- */
function tournamentStats() {
  const fts = S.matches.filter(m => status(m) === ST.FT && res(m)?.h != null);
  const gf = {}, ga = {}, poss = {}, possN = {}, sot = {}, sotN = {}, yel = {}, red = {}, played = {}, scorers = {}, assists = {}, pyel = {}, pred = {}, cs = {}, conf = {}, keepers = {}, tstat = {}, statN = {};
  const TSTAT_KEYS = ["sh", "pass", "passT", "cross", "lball", "tkl", "intc", "clr", "blk", "sv", "off", "fls"];   // richer ESPN team stats → leaderboards + style
  let goals = 0, totCards = 0;
  const rec = { bigWin: null, hiScore: null, fastG: null, lateG: null };   // superlatives
  const add = (o, k, n = 1) => { if (k) o[k] = (o[k] || 0) + n; };
  const addConf = (code, gfv, gav, diff) => {   // a team's match folded into its confederation's collective record
    const k = S.teams[code]?.conf; if (!k) return;
    const o = conf[k] || (conf[k] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    o.p++; o.gf += gfv; o.ga += gav;
    if (diff > 0) { o.w++; o.pts += 3; } else if (diff < 0) o.l++; else { o.d++; o.pts++; }
  };
  for (const m of fts) {
    const r = res(m), hc = slotInfo(m, "home").code, ac = slotInfo(m, "away").code;
    add(played, hc); add(played, ac);
    add(gf, hc, r.h); add(ga, hc, r.a); add(gf, ac, r.a); add(ga, ac, r.h);
    if (r.a === 0) add(cs, hc); if (r.h === 0) add(cs, ac);   // clean sheets (shutouts)
    // per-keeper: credit the starting GK (pos 0 in the lineup) with the shutout / goals conceded
    const gkOf = side => { const row = (r.xi?.[side]?.xi || []).find(p => p[2] === 0); return row ? row[1] : null; };
    [["h", hc, r.a], ["a", ac, r.h]].forEach(([side, code, conceded]) => {
      const gk = gkOf(side); if (!gk || !code) return;
      const k = gk + "\t" + code, o = keepers[k] || (keepers[k] = { app: 0, ga: 0, cs: 0 });
      o.app++; o.ga += conceded; if (conceded === 0) o.cs++;
    });
    addConf(hc, r.h, r.a, r.h - r.a); addConf(ac, r.a, r.h, r.a - r.h);
    goals += r.h + r.a;
    // records: biggest winning margin (tiebreak by total goals) + highest-scoring match
    const margin = Math.abs(r.h - r.a), total = r.h + r.a;
    const win = r.h >= r.a ? { w: hc, l: ac, ws: r.h, ls: r.a } : { w: ac, l: hc, ws: r.a, ls: r.h };
    if (margin > 0 && (!rec.bigWin || margin > rec.bigWin.margin || (margin === rec.bigWin.margin && total > rec.bigWin.total)))
      rec.bigWin = { mid: m.id, num: m.num, total, margin, ...win };
    if (total > 0 && (!rec.hiScore || total > rec.hiScore.total))
      rec.hiScore = { mid: m.id, num: m.num, total, hc, ac, h: r.h, a: r.a };
    for (const e of (r.ev || [])) {
      const tc = e.tm === "h" ? hc : ac;
      if ((e.k === "G" || e.k === "P") && e.p) {
        add(scorers, e.p + "\t" + tc); if (e.a) add(assists, e.a + "\t" + tc);   // own goals excluded from the Boot
        const mn = evMin(e.t);   // fastest / latest goal of the tournament (by the player who scored it)
        if (mn >= 1) {
          if (!rec.fastG || mn < rec.fastG.mn) rec.fastG = { name: e.p, code: tc, t: e.t, mn, mid: m.id };
          if (!rec.lateG || mn > rec.lateG.mn) rec.lateG = { name: e.p, code: tc, t: e.t, mn, mid: m.id };
        }
      }
      if (e.k === "Y") { add(yel, tc); totCards++; if (e.p) add(pyel, e.p + "\t" + tc); }
      else if (e.k === "R") { add(red, tc); totCards++; if (e.p) add(pred, e.p + "\t" + tc); }
    }
    if (r.stats?.poss) { add(poss, hc, r.stats.poss[0]); add(possN, hc); add(poss, ac, r.stats.poss[1]); add(possN, ac); }
    if (r.stats?.sot) { add(sot, hc, r.stats.sot[0]); add(sotN, hc); add(sot, ac, r.stats.sot[1]); add(sotN, ac); }
    if (r.stats) {   // accumulate the richer team stats (per-match averaged later, like FotMob)
      add(statN, hc); add(statN, ac);
      for (const k of TSTAT_KEYS) if (Array.isArray(r.stats[k])) { (tstat[k] ||= {}); add(tstat[k], hc, r.stats[k][0]); add(tstat[k], ac, r.stats[k][1]); }
    }
  }
  const split = k => { const i = k.indexOf("\t"); return [k.slice(0, i), k.slice(i + 1)]; };
  const scorerList = Object.entries(scorers).map(([k, g]) => { const [name, code] = split(k); return { name, code, goals: g, assists: assists[name + "\t" + code] || 0 }; })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
  const assistList = Object.entries(assists).map(([k, a]) => { const [name, code] = split(k); return { name, code, assists: a }; })
    .sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name));
  const bookedList = [...new Set([...Object.keys(pyel), ...Object.keys(pred)])].map(k => { const [name, code] = split(k); return { name, code, y: pyel[k] || 0, r: pred[k] || 0 }; })
    .sort((a, b) => b.r - a.r || b.y - a.y || a.name.localeCompare(b.name));
  const cardList = [...new Set([...Object.keys(yel), ...Object.keys(red)])]
    .map(c => ({ code: c, y: yel[c] || 0, r: red[c] || 0, v: (yel[c] || 0) + (red[c] || 0) }))
    .sort((a, b) => b.v - a.v || b.r - a.r);
  // team metrics are per-match (like FotMob) so a team that's played fewer games isn't ranked unfairly
  const perMatch = (tot, n) => Object.keys(tot).map(c => ({ code: c, v: tot[c] / (n[c] || 1) }));
  const pmT = fn => Object.keys(statN).map(c => ({ code: c, v: fn(c) / statN[c] })).sort((a, b) => b.v - a.v);   // per-game over teams with team-stats
  const g = (k, c) => tstat[k]?.[c] || 0;
  return {
    pulse: { goals, matches: fts.length, perMatch: fts.length ? goals / fts.length : 0, cards: totCards },
    records: rec,
    scorers: scorerList, assisters: assistList, booked: bookedList,
    teamCards: cardList,
    // FIFA fair-play points (a real group tiebreaker): −1 per yellow, −3 per red (we can't tell a
    // second-yellow from a straight red, so reds are flat −3). Ranked cleanest-first across played teams.
    fairPlay: Object.keys(played).map(c => ({ code: c, y: yel[c] || 0, r: red[c] || 0, pts: (yel[c] || 0) + (red[c] || 0) * 3 }))
      .sort((a, b) => a.pts - b.pts || a.y - b.y || a.code.localeCompare(b.code)),
    teamScored: perMatch(gf, played).sort((a, b) => b.v - a.v),
    teamConceded: perMatch(ga, played).sort((a, b) => a.v - b.v),
    cleanSheets: Object.entries(cs).map(([code, v]) => ({ code, v })).sort((a, b) => b.v - a.v),
    keepers: Object.entries(keepers).map(([k, o]) => { const [name, code] = split(k); return { name, code, ...o }; })
      .filter(x => x.cs > 0).sort((a, b) => b.cs - a.cs || a.ga - b.ga || b.app - a.app || a.name.localeCompare(b.name)),
    teamSot: perMatch(sot, sotN).sort((a, b) => b.v - a.v),
    possession: Object.keys(poss).map(c => ({ code: c, v: poss[c] / possN[c] })).filter(x => isFinite(x.v)).sort((a, b) => b.v - a.v),
    teamPassAcc: Object.keys(tstat.passT || {}).filter(c => tstat.passT[c]).map(c => ({ code: c, v: g("pass", c) / tstat.passT[c] * 100 })).sort((a, b) => b.v - a.v),
    teamDef: pmT(c => g("tkl", c) + g("intc", c)),     // tackles + interceptions per game
    teamSaves: pmT(c => g("sv", c)),
    teamCrosses: pmT(c => g("cross", c)),
    // a team's playing identity, for the style fingerprint (only teams that have a stats line)
    style: Object.keys(statN).filter(c => tstat.passT?.[c]).map(c => ({
      code: c, poss: poss[c] / (possN[c] || 1), passAcc: g("pass", c) / tstat.passT[c] * 100,
      directness: g("lball", c) / ((g("pass", c) + g("lball", c)) || 1) * 100,
      pressPg: (g("tkl", c) + g("intc", c)) / statN[c], shotsPg: g("sh", c) / statN[c],
    })),
    confeds: (() => {
      const teamCount = {}; Object.values(S.teams).forEach(t => { if (t.conf) teamCount[t.conf] = (teamCount[t.conf] || 0) + 1; });
      return Object.entries(conf).map(([k, o]) => ({ conf: k, teams: teamCount[k] || 0, ...o, ppg: o.p ? o.pts / o.p : 0, gpg: o.p ? o.gf / o.p : 0 }))
        .sort((a, b) => b.ppg - a.ppg || b.gpg - a.gpg || a.conf.localeCompare(b.conf));
    })(),
  };
}
let statsTab = "players";   // active Stats sub-section (persists across re-renders)
let _statsHTML = "";        // last rendered Stats markup — re-rendered only when it actually changes (see renderStats)
// FIFA World Ranking — June-2026 snapshot (top 50). A bare string = a qualified WC26 team (name/flag from
// teams.json); a [code,name] pair = a top-50 nation that did NOT make the field (its flag is self-hosted too).
// Rank is the array index + 1. The 11 finalists ranked outside the top 50 are derived (teams.json minus this list).
const FIFA_RANK = [
  "AR", "ES", "FR", "GB-ENG", "PT", "BR", "MA", "NL", "BE", "DE", "HR", ["IT", "Italy"],
  "CO", "MX", "SN", "UY", "US", "JP", "CH", "IR", ["DK", "Denmark"], "TR", "EC", "AT", "KR",
  ["NG", "Nigeria"], "AU", "DZ", "EG", "CA", "NO", ["UA", "Ukraine"], "CI", "PA",
  ["RU", "Russia"], ["PL", "Poland"], ["GB-WLS", "Wales"], "SE", ["HU", "Hungary"], "CZ", "PY", "GB-SCT",
  ["RS", "Serbia"], ["CM", "Cameroon"], "TN", "CD", ["SK", "Slovakia"], ["GR", "Greece"], ["VE", "Venezuela"], "UZ",
];
const FIFA_POS = {}; FIFA_RANK.forEach((e, i) => { FIFA_POS[typeof e === "string" ? e : e[0]] = i; });
// final group-stage tiebreak per FIFA regulations art.13 step 3 (FIFA World Ranking). Teams outside the top-50
// snapshot fall back to their Elo so it's still skill-based — never the alphabetical code.
const tiebreakRank = code => FIFA_POS[code] != null ? FIFA_POS[code] : 100 - (S.teams[code]?.elo || 0) / 100;
const CONF_FULL = { UEFA: "Europe", CONMEBOL: "South America", CONCACAF: "N. & C. America", AFC: "Asia", CAF: "Africa", OFC: "Oceania" };
function fifaRankingPanel() {
  const rk = S.fifaRanking;
  if (!rk?.length) {   // ranking file not loaded (stale cache / offline) — minimal fallback from teams.json
    const quals = Object.keys(S.teams).sort((a, b) => (S.teams[b].elo || 0) - (S.teams[a].elo || 0));
    return `<div class="eyebrow">World Cup field</div><div class="lead-card rk-list">${quals.map((c, n) => `<div class="rk-row" data-squad="${c}" role="button" tabindex="0"><span class="rk-num">${n + 1}</span><span class="fl">${flag(c)}</span><span class="rk-name">${esc(S.teams[c].name)}</span></div>`).join("")}</div>`;
  }
  const qCount = rk.filter(t => t.q).length;
  const row = t => `<div class="rk-row${t.q ? "" : " rk-nq"}"${t.q ? ` data-squad="${t.q}" role="button" tabindex="0"` : ""}>
    <span class="rk-num">${t.r ?? "—"}</span>
    <img class="rk-flag" loading="lazy" src="${esc(t.flag || "")}" alt="" width="26" height="17">
    <span class="rk-name">${esc(t.name)}</span>
    <span class="rk-conf" title="${CONF_FULL[t.conf] || ""}">${esc(t.conf || "")}</span>
    ${t.q ? `<span class="rk-q" title="Qualified for the 2026 World Cup">WC</span>` : ""}</div>`;
  return `<div class="eyebrow">FIFA World Ranking · all ${rk.length} teams</div>
    <div class="rk-filter">
      <button class="rk-fbtn is-on" data-rkf="all">All teams · ${rk.length}</button>
      <button class="rk-fbtn" data-rkf="q">World Cup · ${qCount}</button>
    </div>
    <div class="lead-card rk-list" id="rkList">${rk.map(row).join("")}</div>
    <p class="sim-ko-hint">Source: FIFA / Coca-Cola Men's World Ranking · the <b>WC</b> badge marks the 48 finalists · tap one for its page.</p>`;
}

function renderStats() {
  const el = $("#view-stats"), s = tournamentStats();
  if (!s.pulse.matches) { el.innerHTML = `<div class="rk-pre">Tournament stats — scorers, records, team form — fill in as matches kick off. Until then, here's the field by world ranking.</div>${fifaRankingPanel()}`; return; }
  const tile = (label, val) => `<div class="stat-tile"><span class="stat-val">${val}</span><span class="stat-lbl">${label}</span></div>`;
  const tname = c => esc(S.teams[c]?.name || c);
  // a player leaderboard row (photo + name + value), taps through to the player profile
  const playerRow = (p, i, val) => { const ph = playerPhoto(p.name, p.code); return `<div class="lead-row lead-player" data-player="${esc(p.name)}|${p.code}" role="button" tabindex="0">
    <span class="lead-rank">${i + 1}</span>${ph ? `<span class="lead-face" style="background-image:url('${ph}')"></span>` : `<span class="fl">${flag(p.code)}</span>`}
    <span class="lead-name">${esc(p.name)}<small>${flag(p.code)} ${tname(p.code)}</small></span>
    <span class="lead-v">${val}</span></div>`; };
  const scorerRow = (p, i) => playerRow(p, i, `${p.goals}<small>${p.assists ? `${p.assists} ast` : "&nbsp;"}</small>`);
  const assistRow = (p, i) => playerRow(p, i, `${p.assists}<small>assist${p.assists > 1 ? "s" : ""}</small>`);
  const keeperRow = (p, i) => playerRow(p, i, `${p.cs}<small>clean sheet${p.cs !== 1 ? "s" : ""}</small>`);
  const bookedRow = (p, i) => playerRow(p, i, `<span class="card-tally">${p.y ? `<span class="ct ct-y">${p.y}</span>` : ""}${p.r ? `<span class="ct ct-r">${p.r}</span>` : ""}</span>`);
  // suspension watch — derived from the same card tallies; a red or 2nd yellow = a ban next game
  const suspRow = (p, kind) => { const ph = playerPhoto(p.name, p.code); return `<div class="lead-row lead-player" data-player="${esc(p.name)}|${p.code}" role="button" tabindex="0">
    ${ph ? `<span class="lead-face" style="background-image:url('${ph}')"></span>` : `<span class="fl">${flag(p.code)}</span>`}
    <span class="lead-name">${esc(p.name)}<small>${flag(p.code)} ${tname(p.code)}</small></span>
    <span class="susp-tag ${kind === "ban" ? "is-ban" : "is-risk"}">${kind === "ban" ? (p.r > 0 ? "Sent off — banned" : "2 yellows — banned") : "On a yellow"}</span></div>`; };
  const suspended = s.booked.filter(p => p.r > 0 || p.y >= 2);
  const atRisk = s.booked.filter(p => p.r === 0 && p.y === 1);
  const suspHtml = (suspended.length || atRisk.length)
    ? `<div class="lead-card"><h4>Suspension watch</h4>${suspended.map(p => suspRow(p, "ban")).join("")}${atRisk.slice(0, 8).map(p => suspRow(p, "risk")).join("")}</div>` : "";
  const teamLead = (title, rows, fmt) => rows.length ? `<div class="lead-card"><h4>${title}</h4>${rows.slice(0, 5).map((x, i) => `<div class="lead-row" data-squad="${x.code}" role="button" tabindex="0">
    <span class="lead-rank">${i + 1}</span><span class="fl">${flag(x.code)}</span><span class="lead-name">${tname(x.code)}</span>
    <span class="lead-v">${fmt(x)}</span></div>`).join("")}</div>` : "";
  const perGame = x => `${x.v.toFixed(1)}<small>/ match</small>`;
  const fairLead = s.fairPlay.length ? `<div class="lead-card"><h4>Fair play</h4>${s.fairPlay.slice(0, 5).map((x, i) => `<div class="lead-row ${i === 0 ? "lead-fair-top" : ""}" data-squad="${x.code}" role="button" tabindex="0">
    <span class="lead-rank">${i + 1}</span><span class="fl">${flag(x.code)}</span><span class="lead-name">${tname(x.code)}</span>
    <span class="lead-v">${x.pts}<small>pts</small></span></div>`).join("")}</div>` : "";
  const cardLead = s.teamCards.length ? `<div class="lead-card"><h4>Team cards</h4>${s.teamCards.slice(0, 5).map((x, i) => `<div class="lead-row" data-squad="${x.code}" role="button" tabindex="0">
    <span class="lead-rank">${i + 1}</span><span class="fl">${flag(x.code)}</span><span class="lead-name">${tname(x.code)}</span>
    <span class="lead-v card-tally"><span class="ct ct-y" title="${x.y} yellow">${x.y}</span><span class="ct ct-r" title="${x.r} red">${x.r}</span></span></div>`).join("")}</div>` : "";

  // records / superlatives — each row taps through to its match or the player who scored
  const rc = s.records;
  const recRow = (ic, label, sub, val, attr) => `<div class="rec-row" ${attr} role="button" tabindex="0">
    <span class="rec-ic">${ic}</span><span class="rec-tx"><b>${label}</b><small>${sub}</small></span><span class="rec-v">${val}</span></div>`;
  const recItems = [];
  if (rc.bigWin) { const r = rc.bigWin; recItems.push(recRow(ICO.spark, "Biggest win", `${flag(r.w)} ${tname(r.w)} beat ${flag(r.l)} ${tname(r.l)}`, `${r.ws}–${r.ls}`, `data-mid="${r.mid}"`)); }
  if (rc.hiScore) { const r = rc.hiScore; recItems.push(recRow(ICO.net, "Most goals in a match", `${flag(r.hc)} ${tname(r.hc)} v ${flag(r.ac)} ${tname(r.ac)}`, `${r.h}–${r.a}<small>${r.total} goals</small>`, `data-mid="${r.mid}"`)); }
  if (rc.fastG) { const r = rc.fastG; recItems.push(recRow(ICO.bolt, "Fastest goal", `${flag(r.code)} ${esc(r.name)}`, esc(r.t), `data-player="${esc(r.name)}|${r.code}"`)); }
  if (rc.lateG) { const r = rc.lateG; recItems.push(recRow(ICO.clock, "Latest goal", `${flag(r.code)} ${esc(r.name)}`, esc(r.t), `data-player="${esc(r.name)}|${r.code}"`)); }
  const recordsHtml = recItems.length
    ? `<div class="lead-card rec-card">${recItems.join("")}</div><p class="sim-ko-hint">Tap a record to jump to the match or player.</p>`
    : `<div class="empty">Records fill in as matches are played.</div>`;

  // confederation breakdown — each confederation's collective record, ranked by points per game
  const CONF_LABEL = { UEFA: "Europe", CONMEBOL: "South America", CONCACAF: "N. & C. America", AFC: "Asia", CAF: "Africa", OFC: "Oceania" };
  const confHtml = s.confeds.length ? `<div class="eyebrow">By confederation</div>
    <div class="lead-card conf-card">${s.confeds.map((c, i) => `<div class="conf-row">
      <span class="conf-rank">${i + 1}</span>
      <span class="conf-name">${CONF_LABEL[c.conf] || c.conf}<small>${c.conf} · ${c.teams} team${c.teams > 1 ? "s" : ""}</small></span>
      <span class="conf-rec">${c.w}<i>W</i> ${c.d}<i>D</i> ${c.l}<i>L</i></span>
      <span class="conf-ppg">${c.ppg.toFixed(2)}<small>pts/gm</small></span></div>`).join("")}</div>
    <p class="sim-ko-hint">Combined record of each confederation's teams, ranked by points per game.</p>` : "";

  // sections behind a segmented sub-nav so the tab grows down (not into one endless scroll)
  const sections = [
    ["players", "Players", `
      ${s.scorers.length ? `<div class="eyebrow">${ICO.ball} Golden Boot</div><div class="lead-card lead-scorers">${s.scorers.slice(0, 12).map(scorerRow).join("")}</div>` : ""}
      ${s.assisters.length ? `<div class="eyebrow">Playmakers · assists</div><div class="lead-card lead-scorers">${s.assisters.slice(0, 8).map(assistRow).join("")}</div>` : ""}
      ${s.keepers.length ? `<div class="eyebrow">${ICO.glove} Goalkeepers · clean sheets</div><div class="lead-card lead-scorers">${s.keepers.slice(0, 8).map(keeperRow).join("")}</div>` : ""}
      ${!s.scorers.length && !s.assisters.length ? `<div class="empty">No goals yet — the Golden Boot race starts with the first goal.</div>` : ""}`],
    ["teams", "Teams", `<div class="lead-grid">
      ${teamLead("Attack", s.teamScored, perGame)}
      ${teamLead("Defence", s.teamConceded, perGame)}
      ${teamLead("Clean sheets", s.cleanSheets, x => x.v)}
      ${teamLead("Possession", s.possession, x => x.v.toFixed(1) + "%")}
      ${teamLead("Shots on target", s.teamSot, perGame)}
      ${teamLead("Pass accuracy", s.teamPassAcc, x => x.v.toFixed(0) + "%")}
      ${teamLead("Defensive actions", s.teamDef, perGame)}
      ${teamLead("Crosses", s.teamCrosses, perGame)}
      ${teamLead("Saves", s.teamSaves, perGame)}
    </div>`],
    ["discipline", "Discipline", `<div class="lead-grid">
      ${suspHtml}
      ${cardLead}
      ${fairLead}
      ${s.booked.length ? `<div class="lead-card"><h4>Booked players</h4>${s.booked.slice(0, 8).map(bookedRow).join("")}</div>` : ""}
    </div>${s.fairPlay.length ? `<p class="sim-ko-hint">Fair play points — −1 a yellow, −3 a red — are a real group tiebreaker; fewer is cleaner. A red or second yellow also means a one-match ban (single yellows clear after the quarter-finals).</p>` : ""}`],
    ["records", "Records", recordsHtml],
    ["tournament", "Tournament", `<div class="stat-tiles">
      ${tile("Goals", s.pulse.goals)}${tile("Matches", s.pulse.matches)}
      ${tile("Goals / match", s.pulse.perMatch.toFixed(2))}${tile("Cards", s.pulse.cards)}
    </div>${confHtml}`],
    ["rankings", "Rankings", fifaRankingPanel()],
  ];
  if (!sections.some(([k]) => k === statsTab)) statsTab = "players";
  const out = `<div class="substat-nav">${sections.map(([k, label]) => `<button class="substat ${k === statsTab ? "is-on" : ""}" data-stat="${k}">${label}</button>`).join("")}</div>`
    + sections.map(([k, , html]) => `<div class="substat-panel" data-panel="${k}"${k === statsTab ? "" : " hidden"}>${html}</div>`).join("");
  // a live match rewrites results.json every poll (the minute ticks), which re-renders the active view. If the
  // Stats markup is byte-identical, keep the existing DOM — otherwise a tap mid-poll lands on a freshly-swapped row.
  if (out === _statsHTML && el.firstChild) return;
  _statsHTML = out;
  el.innerHTML = out;
  $$(".substat", el).forEach(b => b.onclick = () => {
    statsTab = b.dataset.stat;
    $$(".substat", el).forEach(x => x.classList.toggle("is-on", x.dataset.stat === statsTab));
    $$(".substat-panel", el).forEach(p => p.hidden = p.dataset.panel !== statsTab);
  });
  // FIFA-ranking filter (All / World Cup) — a CSS class toggle, no re-render
  $$(".rk-fbtn", el).forEach(b => b.onclick = () => {
    $("#rkList", el)?.classList.toggle("q-only", b.dataset.rkf === "q");
    $$(".rk-fbtn", el).forEach(x => x.classList.toggle("is-on", x === b));
  });
}

/* ---------------- match report + live commentary (rendered inside the match popup) ---------------- */
// full credited write-up for a finished match (reports.json arrives a little after full time)
function mdReport(m) {
  if ([ST.LIVE, ST.HT].includes(status(m))) return "";   // a live game shows commentary instead, never the report
  const rp = report(m); if (!rp || !(rp.rep?.length || rp.hl)) return "";
  const paras = (rp.rep || []).map(p => `<p>${esc(p)}</p>`).join("");
  const credit = (rp.src || rp.by) ? `<div class="md-credit">Report: ${rp.by ? esc(rp.by) + " · " : ""}${rp.url ? `<a href="${esc(rp.url)}" target="_blank" rel="noopener noreferrer">${esc(rp.src || "source")} ↗</a>` : esc(rp.src || "")}</div>` : "";
  return `<div class="eyebrow">Match report</div><div class="md-report">${rp.hl ? `<h4>${esc(rp.hl)}</h4>` : ""}${paras}${credit}</div>`;
}
// live commentary — only while a match is in play; finished matches get the report above instead
function mdCommentaryShell(m) {
  if (![ST.LIVE, ST.HT].includes(status(m))) return "";
  return `<details class="md-comm" id="mdComm" open><summary><span>Live commentary</span><small class="md-comm-hint">● updating</small></summary><div class="md-comm-body" id="mdCommBody"></div></details>`;
}
function renderCommentary(c) {
  if (!c || !c.items?.length) return `<div class="empty">No commentary published for this match.</div>`;
  // ESPN ships terse VAR strings (e.g. "VAR Decision: Other Decision Cancelled.") — badge them and say it plainly
  const clarify = t => {
    const m = /^VAR Decision:\s*(.+?)\.?\s*$/i.exec(t || "");
    if (!m) return esc(t || "");
    let d = m[1].trim();
    if (/^other decision cancelled$/i.test(d)) d = "an on-field decision was overturned after review";
    return `<b class="cm-var">VAR</b> ${esc(d)}`;
  };
  const row = it => {
    const isVar = /^VAR Decision:/i.test(it.x || "");
    return `<div class="cm-row${it.k ? ` cm-${esc(it.k)}` : ""}${isVar ? " cm-var-row" : ""}">${it.t ? `<span class="cm-t">${esc(it.t)}</span>` : `<span class="cm-t cm-t-x"></span>`}<span class="cm-x">${isVar ? clarify(it.x) : esc(it.x || "")}</span></div>`;
  };
  // a raw play-by-play is mostly throw-ins and blocked shots — lead with the moments that matter; full feed one tap away
  const KEY = it => it.k || /\bpenalt|\bVAR\b|own goal|sent off|red card|hits the (bar|post|crossbar)|Match ends|First Half ends|Second Half ends|Half begins|^Goal|kick-off/i.test(it.x || "");
  const key = c.items.filter(KEY);
  const lead = key.length >= 3 ? key : c.items.slice(0, 10);   // enough highlights? lead with them, else the latest 10
  const credit = c.src ? `<div class="md-credit">Commentary: ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.src)} ↗</a>` : esc(c.src)}</div>` : "";
  const full = lead.length < c.items.length
    ? `<details class="cm-full"><summary>Full play-by-play · ${c.items.length} entries</summary>${c.items.map(row).join("")}</details>` : "";
  return lead.map(row).join("") + full + credit;
}

/* ---------------- navigation ---------------- */
const RENDER = { matches: renderMatches, teams: renderTeams, groups: renderGroups, stats: renderStats, sim: renderSim };
// shareable per-tab URL hash (Matches is the default → no hash; Predict's internal view name is "sim")
const VIEW_HASH = { teams: "teams", groups: "groups", sim: "predict", stats: "stats" };
const HASH_VIEW = { matches: "matches", teams: "teams", groups: "groups", predict: "sim", stats: "stats" };
function nav(v) {
  S.view = v;
  const _want = VIEW_HASH[v] ? "#" + VIEW_HASH[v] : "";       // reflect the tab in the URL so it's shareable / bookmarkable
  if (location.hash !== _want && !location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname + location.search + _want);
  $$(".view").forEach(el => el.hidden = el.id !== "view-" + v);
  $$(".tab").forEach(t => { const on = t.dataset.nav === v; t.classList.toggle("is-active", on); on ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"); });
  moveInk();
  const at = $(".tab.is-active"), tabs = $(".tabs");          // keep the active tab in view on the scrollable bar
  if (at && tabs) tabs.scrollTo({ left: at.offsetLeft - tabs.clientWidth / 2 + at.offsetWidth / 2, behavior: "smooth" });
  RENDER[v]();
  scrollTo({ top: 0, behavior: "instant" });
  if (v !== "matches") $("#jumpNow").hidden = true;
  try { window.goatcounter?.count?.({ path: location.pathname + "#" + v, title: "WC26 · " + v, event: false }); } catch { /* analytics off or not loaded */ }
}
function moveInk() {
  const t = $(".tab.is-active"), ink = $("#tabInk");
  if (!t) return;
  ink.style.left = t.offsetLeft + 8 + "px";
  ink.style.width = t.offsetWidth - 16 + "px";
}

/* ---------------- pickers ---------------- */
function buildPickers() {
  $("#tzList").innerHTML = ZONES.slice().sort((a, b) => a[0] === "auto" ? -1 : b[0] === "auto" ? 1 : tzMinutes(a[0]) - tzMinutes(b[0])).map(([z, l]) =>
    `<button class="tz-opt ${S.tz === z ? "is-on" : ""}" data-z="${z}"><span>${l}</span><span class="off">${tzOffsetLabel(z)}</span></button>`).join("");
  $$("#tzList .tz-opt").forEach(b => b.onclick = () => {
    S.tz = b.dataset.z; localStorage.setItem("wc26.tz", S.tz);
    $("#tzDialog").close(); syncTzLabels(); buildPickers(); renderTicker(); RENDER[S.view]();
  });
  const list = (q = "") => Object.entries(S.teams)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .filter(([, t]) => t.name.toLowerCase().includes(q.toLowerCase()))
    .map(([c, t]) => `<button class="team-opt ${S.fav === c ? "is-on" : ""}" data-c="${c}"><span class="fl">${flag(c)}</span>${esc(t.name)}</button>`).join("");
  const wire = () => $$("#teamList .team-opt").forEach(b => b.onclick = () => {
    S.fav = b.dataset.c; localStorage.setItem("wc26.fav", S.fav);
    $("#teamDialog").close(); applyTheme($("#teamChip")); buildPickers(); RENDER[S.view]();
  });
  $("#teamList").innerHTML = list(); wire();
  $("#teamSearch").oninput = e => { $("#teamList").innerHTML = list(e.target.value); wire(); };
  $("#teamClear").onclick = () => {
    S.fav = null; localStorage.removeItem("wc26.fav");
    $("#teamDialog").close(); applyTheme(); buildPickers(); RENDER[S.view]();
  };
}
function syncTzLabels() {
  const tzl = $("#tzState"); if (tzl) tzl.textContent = `${tzCity().split(",")[0].trim()} · ${tzShort()}`;  // compact: City · GMT±N (no country / "auto" clutter)
  $("#footTz").textContent = `${tzCity()} · ${tzShort()}`;
  const bt = $("#buildTag"); if (bt) bt.textContent = "build " + BUILD;
  setFreshness();   // re-render the "scores from / checked" times in the new timezone
}

/* ---------------- background music (off by default) ---------------- */
// Royalty-free "stadium mix" — 14 match-day tracks sourced by the user (Pixabay/Uppbeat artists:
// hitslab, ikoliks, mfcc, nastelbom, positive_sound, prettyjohn1, soundsurfer, starostin, the_mountain,
// tunetank, yevhenastafiev). Curated from 15 by dropping a 0.95-similar duplicate (prettyjohn twin);
// the rest were ordered/kept by a timbre-similarity pass so near-alike tracks don't cluster.
const MUSIC = ["hitslab-334834", "ikoliks-381489", "mfcc-414731", "nastelbom-412586", "positivesound-487188",
  "prettyjohn1-499975", "soundsurfer-516385", "soundsurfer-edit-276736", "starostin-samba-260573",
  "starostin-541750", "themountain-485564", "themountain-496555", "tunetank-349258", "yevhenastafiev-526075"]
  .map(n => `assets/music/${n}.mp3`);
// The button reflects the audio's REAL paused state (not just a saved flag), so it
// can never get out of sync with what you actually hear.
function initMusic() {
  const a = $("#bgm"), btn = $("#musicToggle"); if (!btn || !a) return;
  a.volume = 0.32;
  let queue = [], qi = 0;
  const shuffle = arr => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const cue = () => {                                  // load the next track; reshuffle a fresh queue when one's exhausted
    if (qi >= queue.length) { queue = shuffle(MUSIC); qi = 0; }
    a.src = queue[qi++];
  };
  const play = () => { if (!a.src) cue(); return a.play(); };
  a.addEventListener("ended", () => { cue(); a.play().catch(() => {}); });   // rolling playlist, never stops on its own
  const sync = () => {
    const playing = !a.paused;
    btn.setAttribute("aria-pressed", String(playing));
    const st = $("#musicState"); if (st) st.textContent = playing ? "On" : "Off";
    $("#settingsChip")?.classList.toggle("is-on", playing);   // gear hints that music is playing
  };
  a.addEventListener("play", sync);
  a.addEventListener("pause", sync);
  btn.onclick = () => {
    if (a.paused) { play().then(() => localStorage.setItem("wc26.music", "on")).catch(() => {}); }
    else { a.pause(); localStorage.setItem("wc26.music", "off"); }
  };
  // resume a previously-on preference on the first interaction (autoplay is blocked on load) —
  // but ignore a tap on the toggle itself, so toggling can never fight the resume
  if (localStorage.getItem("wc26.music") === "on") {
    const resume = e => { if (!e.target.closest("#musicToggle")) play().catch(() => {}); };
    addEventListener("pointerdown", resume, { once: true });
  }
  sync();
}
/* ---------------- theme (dark mode) + goal horn ---------------- */
const currentDark = () => document.documentElement.dataset.theme === "dark";
function setDark(on) {
  document.documentElement.dataset.theme = on ? "dark" : "light";
  localStorage.setItem("wc26.theme", on ? "dark" : "light");
  $('meta[name="theme-color"]')?.setAttribute("content", on ? "#0E1822" : "#0BA360");
  const st = $("#themeState"); if (st) st.textContent = on ? "On" : "Off";
  $("#themeToggle")?.setAttribute("aria-pressed", String(on));
}
// a short synthesized stadium air-horn (no audio file needed); opt-in, fires on goals
let _ac = null;
function goalHorn() {
  if (localStorage.getItem("wc26.horn") !== "on") return;
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _ac; if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime, out = ctx.createGain(); out.connect(ctx.destination);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    out.gain.setValueAtTime(0.22, t + 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; lp.connect(out);
    [233, 311, 392].forEach((f, i) => {                  // stacked, slightly-detuned horn chord
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f * (1 + (i - 1) * 0.004);
      const g = ctx.createGain(); g.gain.value = [0.5, 0.4, 0.3][i];
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + 0.82);
    });
  } catch { /* audio unavailable */ }
}

/* ---------------- data ---------------- */
async function loadStatic() {
  const [m, t, fr] = await Promise.all([
    fetch("data/matches.json?v=" + BUILD).then(r => r.json()),
    fetch("data/teams.json?v=" + BUILD).then(r => r.json()),   // ?v=BUILD so the browser refetches when team data (pedigree/coach) changes per deploy
    fetch("data/fifa-ranking.json?v=" + BUILD).then(r => r.json()).catch(() => null),   // full 211-team FIFA ranking (static snapshot, frozen during the WC)
  ]);
  S.matches = m.matches; S.teams = t; S.fifaRanking = fr?.teams || null;
  // squads.json is committed data that changes (squad updates) — bypass cache so it's always current
  try { S.squads = (await (await fetch("data/squads.json?t=" + Date.now(), { cache: "no-store" })).json()).squads || {}; }
  catch { S.squads = {}; }
  // official player photos harvested from FIFA lineups (keyed "ShortName|CODE"); optional, skipped in data-saver
  if (!LITE()) { try { S.photos = await (await fetch("data/photos.json?t=" + Date.now(), { cache: "no-store" })).json() || {}; } catch { S.photos = {}; } }
}
const LITE = () => localStorage.getItem("wc26.lite") === "on";   // data-saver: suppress hot-linked photos, fall back to flags
// Only ever surface an https image URL with no CSS/HTML-breaking characters: these are inserted into
// `url('…')` background-images, where esc() wouldn't even cover the quote/paren — so sanitise at the source.
const safePhoto = u => /^https:\/\/[^\s'"()<>]+$/.test(u || "") ? u : "";
const playerPhoto = (name, code) => safePhoto((!LITE() && S.photos && S.photos[name + "|" + code]) || "");
// like playerPhoto, but tolerantly matches a full squad name ("Mathew Ryan") against the terser FIFA
// short-name photo keys ("M. RYAN", "RYAN", "Mathew RYAN") — accent-insensitive and surname-anchored, so a
// roster tap resolves even though the feed stored only the surname or an initial.
const normName = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
const PH_SUFFIX = new Set(["jr", "junior", "jnr", "filho", "neto", "segundo", "ii", "iii"]);   // ignored when picking a surname
const nameToks = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
const sigToks = s => { const t = nameToks(s).filter(w => !PH_SUFFIX.has(w)); return t.length ? t : nameToks(s); };
const surnameOf = s => { const t = sigToks(s); return t[t.length - 1] || ""; };
function bestPhoto(name, code) {
  if (LITE()) return "";
  const direct = playerPhoto(name, code); if (direct) return direct;
  const suf = "|" + code, fall = () => safePhoto(squadBio(name, code)?.photo || "");   // last resort: squads.json headshot
  if (!S.photos) return fall();
  const keys = []; for (const k in S.photos) if (k.endsWith(suf)) keys.push(k.slice(0, -suf.length));
  const ns = normName(name);
  for (const k of keys) if (normName(k) === ns) return safePhoto(S.photos[k + suf]);   // 1) whole-name equality
  const nsig = sigToks(name), nsur = surnameOf(name), nfi = (nsig[0] || "")[0];
  const pick = list => {                                  // exactly one candidate, or break a tie on the first initial
    if (list.length === 1) return list[0];
    if (list.length > 1) { const ini = list.filter(k => { const f = sigToks(k)[0]; return f && nfi && f[0] === nfi; }); return ini.length === 1 ? ini[0] : null; }
    return null;
  };
  let hit = pick(keys.filter(k => surnameOf(k) === nsur));   // 2) surname-anchored
  if (!hit) {                                                // 3) token subset — mononyms ("Alisson") & suffix variants ("Vinicius Jr")
    const nset = new Set(nsig);
    hit = pick(keys.filter(k => { const kt = sigToks(k), kset = new Set(kt); return kt.length && (kt.every(w => nset.has(w)) || nsig.every(w => kset.has(w))) && (kset.has(nsur) || nset.has(surnameOf(k))); }));
  }
  return hit ? safePhoto(S.photos[hit + suf]) : fall();
}
// manual "refresh scores" controls (footer + hero) — re-fetch the published results.json now
async function manualRefresh() {
  const btns = $$("[data-refresh]");
  if (btns.some(b => b.classList.contains("spinning"))) return;
  btns.forEach(b => b.classList.add("spinning"));
  const t0 = Date.now();
  try { await refreshResults(); }
  finally { setTimeout(() => $$("[data-refresh]").forEach(b => b.classList.remove("spinning")), Math.max(0, 650 - (Date.now() - t0))); }
}
// heavy per-match detail (timeline/lineups/stats) lives in its own file so it isn't re-downloaded
// every 60s — fetched only when scores change (see refreshResults). Tolerates a missing file.
async function loadDetails() {
  try { const d = await (await fetch("data/details.json?t=" + Date.now(), { cache: "no-store" })).json(); S.details = d && d.matches ? d : { matches: {} }; }
  catch { S.details = { matches: {} }; }
}
// credited match reports (headline + prose) — small file, refreshed on score change like details.json. Tolerates absence.
async function loadReports() {
  try { const d = await (await fetch("data/reports.json?t=" + Date.now(), { cache: "no-store" })).json(); S.reports = d && d.matches ? d : { matches: {} }; }
  catch { /* keep whatever we have — reports are optional */ }
}
// heavy live commentary lives in one file per match so we only download it when a popup actually wants it
async function loadCommentary(num) {
  if (S.commentary[num] !== undefined) return S.commentary[num];   // cached (incl. null for "none")
  try { S.commentary[num] = await (await fetch(`data/commentary/${num}.json?t=` + Date.now(), { cache: "no-store" })).json(); }
  catch { S.commentary[num] = null; }
  return S.commentary[num];
}
// footer line: separate "when we last checked" (every poll) from "when the scores last changed"
// (results.json's `updated`), so a quiet hour never reads as a stale/broken site.
function setFreshness() {
  const el = $("#updatedLabel"); if (!el) return;
  const fmtT = ms => new Intl.DateTimeFormat("en", { timeZone: tz(), hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const from = S.results.updated ? `Scores from ${fmtT(S.results.updated)}` : "Schedule loaded";
  const checked = S.lastChecked ? ` · checked ${Date.now() - S.lastChecked < 90000 ? "just now" : fmtT(S.lastChecked)}` : "";
  el.textContent = from + checked;
}
async function refreshResults() {
  try {
    const r = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const txt = await r.text();
    S.lastChecked = Date.now();
    if (txt === S._lastResults) { setFreshness(); return; }  // no change — just refresh the "checked" time, skip the re-render
    const firstLoad = S._lastResults == null;
    const prev = S.results.matches || {};
    S._lastResults = txt;
    S.results = JSON.parse(txt);
    await Promise.all([loadDetails(), loadReports()]);   // scores changed → pull detail + reports, then merge for the renderers
    S.commentary = {};            // live commentary may have advanced — drop the per-match cache so popups re-fetch
    rebuildMatchData();
    setFreshness();
    renderTicker();
    // Predict is driven by the user's saved picks, not live results — re-rendering it on a poll would
    // just reset their bracket scroll / interrupt them for no benefit. Refresh every other view.
    if (S.view && S.view !== "sim") RENDER[S.view]();   // S.view is unset on the pre-first-paint load — boot's nav() does that render
    if (!firstLoad) celebrateGoals(prev, S.results.matches); // only after we have a baseline
  } catch { /* offline or first deploy — schedule still works */ }
}
// keep an open live-match popup's commentary current — re-fetch its feed each poll (commentary advances on
// fouls/cards too, not just goals, so this runs every tick, independent of whether the score changed)
async function refreshOpenCommentary() {
  const md = document.getElementById("matchDialog");
  if (!md?.open || !md.dataset.openMid) return;
  const om = S.matches.find(x => x.id === md.dataset.openMid);
  const comm = md.querySelector("#mdComm");
  if (!om || !comm?.open || !comm.dataset.loaded || ![ST.LIVE, ST.HT].includes(status(om))) return;
  delete S.commentary[om.num];                      // force a fresh fetch
  const c = await loadCommentary(om.num);
  const body = md.querySelector("#mdCommBody");
  if (body) body.innerHTML = renderCommentary(c);
}
// Scores update live via the poll, but the *app itself* (HTML/CSS/JS) can't be force-reloaded on a static
// site — a page left open keeps running its old build. So detect a new deploy (the live index.html bumps
// app.js?v=<BUILD> each release) and offer a one-tap refresh instead of leaving people on a stale UI.
async function checkVersion() {
  try {
    const html = await (await fetch("index.html?t=" + Date.now(), { cache: "no-store" })).text();
    const m = html.match(/app\.js\?v=([\w.]+)/);
    if (m && m[1] !== BUILD) { const p = $("#updatePill"); if (p) p.hidden = false; }
  } catch { /* offline — try again next tick */ }
}
// Thorough refresh for the update pill: wipe every cache + unregister the worker so the reload is guaranteed to
// come from the network (the latest build) — even on a device stuck behind an old worker. The page re-registers
// a fresh worker on next load, so offline support is restored immediately after.
async function hardRefresh() {
  const p = $("#updatePill"); if (p) p.disabled = true;
  try {
    if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    if ("serviceWorker" in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
  } catch { /* best effort — reload regardless */ }
  location.reload();
}

/* ---------------- boot ---------------- */
async function boot() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // always open at the top
  try {
    await loadStatic();
  } catch (e) {
    $("#main").innerHTML = `<div class="empty" style="margin:32px 16px">Couldn't load the schedule data. If you opened this file directly, run it through a static server (see README) — <code>file://</code> can't fetch <code>data/*.json</code>. Otherwise check your connection and reload.</div>`;
    return;
  }
  if (!S.matches.length) {
    $("#main").innerHTML = `<div class="empty" style="margin:32px 16px">No fixtures found in <code>data/matches.json</code>.</div>`;
    return;
  }
  S.filters.team = "";            // default filter shows all teams (favourite is still pinned in the dropdown)
  applyTheme(); syncTzLabels(); buildPickers(); renderTicker();
  $$("[data-nav]").forEach(b => b.onclick = e => { e.preventDefault(); nav(b.dataset.nav); });
  $("#settingsChip").onclick = () => $("#settingsDialog").showModal();
  $("#tzRow").onclick = () => { $("#settingsDialog").close(); $("#tzDialog").showModal(); };
  // keep the sheet open — webcal opens the Calendar app (mobile); if nothing handles it, Download is right there
  $("#calSubscribe").onclick = () => { location.href = webcalURL("all.ics"); };
  $("#calDownload").onclick = () => downloadICS(S.matches.slice().sort((a, b) => a.utc.localeCompare(b.utc)), "FIFA World Cup 2026");
  $("#aboutBtn").onclick = () => showSheet($("#aboutDialog"));
  $("#aboutSiteBtn").onclick = () => showSheet($("#aboutSiteDialog"));
  $("#teamChip").onclick = () => $("#teamDialog").showModal();
  // first-launch onboarding — a short, skippable welcome shown once (any dismissal marks it seen)
  if (!localStorage.getItem("wc26.seen")) {
    const w = $("#welcomeDialog");
    if (w) {
      const tzl = $("#welcomeTz"); if (tzl) tzl.textContent = `${tzCity()} · ${tzShort()}`;
      const seen = () => localStorage.setItem("wc26.seen", "1");
      w.addEventListener("close", seen);   // also covers Escape / backdrop dismissal
      $("#welcomePick").onclick = () => { seen(); w.close(); $("#teamDialog").showModal(); };
      $("#welcomeGo").onclick = () => { seen(); w.close(); };
      setTimeout(() => { if (w.isConnected && !w.open) w.showModal(); }, 700);
    }
  }
  $("#searchChip").onclick = openSearch;
  $("#searchInput").oninput = e => renderSearch(e.target.value);
  addEventListener("keydown", e => {   // ⌘K / Ctrl-K anywhere, or "/" when not already typing
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); }
    else if (e.key === "/" && !$("#searchDialog").open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); openSearch(); }
  });
  // dark mode + goal horn (live in the Settings sheet)
  $("#themeState").textContent = currentDark() ? "On" : "Off";
  $("#themeToggle").setAttribute("aria-pressed", String(currentDark()));
  $("#themeToggle").onclick = () => setDark(!currentDark());
  const hornOn = localStorage.getItem("wc26.horn") === "on";
  $("#hornState").textContent = hornOn ? "On" : "Off";
  $("#hornToggle").setAttribute("aria-pressed", String(hornOn));
  $("#hornToggle").onclick = () => {
    const on = localStorage.getItem("wc26.horn") !== "on";
    localStorage.setItem("wc26.horn", on ? "on" : "off");
    $("#hornToggle").setAttribute("aria-pressed", String(on));
    $("#hornState").textContent = on ? "On" : "Off";
    if (on) goalHorn();   // preview + unlock the audio context (this tap is the user gesture)
  };
  const supported = "Notification" in window;
  const notifyUI = () => {
    const state = !supported ? "N/A" : Notification.permission === "denied" ? "Blocked" : (notifyEnabled() ? "On" : "Off");
    $("#notifyState").textContent = state;
    $("#notifyToggle").setAttribute("aria-pressed", String(state === "On"));
  };
  notifyUI();
  $("#notifyToggle").onclick = async () => {
    if (!supported) { flashToast("Notifications aren't supported on this device"); return; }
    if (localStorage.getItem("wc26.notify") === "on") { localStorage.setItem("wc26.notify", "off"); notifyUI(); return; }
    let perm = Notification.permission;
    if (perm === "default") { try { perm = await Notification.requestPermission(); } catch { /* dismissed */ } }
    if (perm !== "granted") { flashToast(perm === "denied" ? "Notifications are blocked in your browser" : "Allow notifications to enable alerts"); notifyUI(); return; }
    localStorage.setItem("wc26.notify", "on"); notifyUI();
    try { new Notification("World Cup 26", { body: "Match alerts on — goals & kickoffs for your team.", icon: "assets/icon-192.png", tag: "wc26" }); } catch { /* */ }
  };
  const liteUI = () => { const on = LITE(); $("#liteState").textContent = on ? "On" : "Off"; $("#liteToggle").setAttribute("aria-pressed", String(on)); };
  liteUI();
  $("#liteToggle").onclick = async () => {
    const on = !LITE();
    localStorage.setItem("wc26.lite", on ? "on" : "off"); liteUI();
    if (!on && (!S.photos || !Object.keys(S.photos).length)) {   // turning off → fetch the photos we skipped
      try { S.photos = await (await fetch("data/photos.json?t=" + Date.now(), { cache: "no-store" })).json() || {}; } catch { /* keep flags */ }
    }
    flashToast(on ? "Data saver on — photos hidden" : "Data saver off");
    RENDER[S.view]();   // re-render so photos↔flags swap immediately
  };
  $("#jumpNow").onclick = scrollToNow;
  addEventListener("scroll", () => { if (S.view === "matches") requestAnimationFrame(updateJumpNow); }, { passive: true });
  addEventListener("click", e => { if (!e.target.closest("#teamSelWrap")) closeTeamSel(); });   // close team dropdown on outside click
  addEventListener("keydown", e => { if (e.key === "Escape") closeTeamSel(); });
  initMusic();
  $$("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
  $$("dialog").forEach(d => d.onclick = e => { if (e.target === d) d.close(); });
  $("#searchDialog").addEventListener("close", () => { compareSeed = null; });   // never leave compare mode armed after the overlay closes
  addEventListener("resize", () => {
    moveInk(); setChromeVars();
    if (S.view === "sim") layoutBracket($("#view-sim"));
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    setChromeVars();   // fonts can change the bar height → re-measure so sticky offsets stay exact
    if (S.view === "sim") layoutBracket($("#view-sim"));
  });
  document.addEventListener("click", e => {
    // a close button or a backdrop (click landing on the <dialog> itself) is handled by the dialog's own
    // close wiring — never let it fall through to an open-handler, or closing would immediately re-open.
    if (e.target.closest("[data-close]") || e.target.tagName === "DIALOG") return;
    const rf = e.target.closest("[data-refresh]");
    if (rf) { e.stopPropagation(); manualRefresh(); return; }
    const star = e.target.closest("[data-save]");
    if (star) { e.stopPropagation(); toggleSave(star.dataset.save); return; }
    const pl = e.target.closest("[data-player]");
    if (pl) { e.stopPropagation(); const [pn, pc] = pl.dataset.player.split("|"); openPlayer(pn, pc); return; }
    const fol = e.target.closest("[data-follow]");
    if (fol) {   // "Follow this team" from inside the team sheet
      e.stopPropagation(); S.fav = fol.dataset.follow; localStorage.setItem("wc26.fav", S.fav);
      $("#teamSheet").close(); applyTheme($("#teamChip")); buildPickers(); RENDER[S.view](); return;
    }
    const ic = e.target.closest("[data-ics]");
    if (ic) { e.stopPropagation(); const c = ic.dataset.ics; downloadICS(S.matches.filter(m => matchHasTeam(m, c)).sort((a, b) => a.utc.localeCompare(b.utc)), `${S.teams[c].name} · World Cup 2026`); return; }
    const cal = e.target.closest("[data-cal]");   // add a single match to the calendar (.ics download)
    if (cal) { e.stopPropagation(); const m = S.matches.find(x => x.id === cal.dataset.cal); if (m) { const h = slotInfo(m, "home"), a = slotInfo(m, "away"); downloadICS([m], `${h.code ? h.name : slotText(m, "home", h)} v ${a.code ? a.name : slotText(m, "away", a)}`); } return; }
    const sq = e.target.closest("[data-squad]");
    if (sq && sq.dataset.squad) { openTeam(sq.dataset.squad); return; }
    const ab = e.target.closest("[data-about]");   // "how the format works" → tournament info sheet
    if (ab) { showSheet($("#aboutDialog")); return; }
    const mid = e.target.closest("[data-mid]");   // hero, match card, or a record row (never a dialog)
    if (mid && mid.tagName !== "DIALOG") { openMatch(mid.dataset.mid); }
  });
  // keyboard: activate focusable custom controls (save stars, squad cells, sim picks, hero) with Enter/Space
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest('[data-save],[data-squad],[data-player],[data-pick],.up,[data-mid],[role="button"]');
    if (t) { e.preventDefault(); t.click(); }
  });
  // a shared prediction link (#p=…) loads that bracket and opens the Predict tab
  let initView = "matches";
  if (location.hash.startsWith("#p=")) {
    if (loadSharedSim(location.hash.slice(3))) { pruneSim(); saveSim(); initView = "sim"; setTimeout(() => flashToast("Loaded a shared prediction"), 400); }
    history.replaceState(null, "", location.pathname + location.search);
  } else if (HASH_VIEW[location.hash.slice(1)]) {
    initView = HASH_VIEW[location.hash.slice(1)];             // deep-link straight to a tab (#teams, #groups, #predict, #stats)
  }
  setChromeVars();
  // Load live scores + detail BEFORE the first paint, so a refresh never flickers from a no-scores render to the
  // live one — the visitor always opens straight onto current data. Raced with a timeout so a slow/hung network
  // can't block the page; if the data is late it simply re-renders when it lands.
  await Promise.race([refreshResults(), new Promise(r => setTimeout(r, 3500))]);
  nav(initView);
  addEventListener("hashchange", () => { const v = HASH_VIEW[location.hash.slice(1)]; if (v && v !== S.view) nav(v); });  // a shared #tab link opened in-session / back-forward
  const bl = $("#bootLoading"); if (bl) { bl.classList.add("gone"); setTimeout(() => bl.remove(), 320); }   // first view rendered → reveal
  // a shared match link (?match=<id>, e.g. from a share-card stub) opens that match
  const mq = new URLSearchParams(location.search).get("match");
  if (mq && S.matches.some(m => m.id === mq)) {
    history.replaceState(null, "", location.pathname);
    setTimeout(() => openMatch(mq), 350);
  }
  setInterval(() => { refreshResults(); refreshOpenCommentary(); }, 60 * 1000); // fresh scores + live commentary every 60s (initial load already done pre-paint)
  checkKickoffAlert();
  setInterval(checkKickoffAlert, 60 * 1000); // fire a kickoff reminder for the favourite team (opt-in)
  $("#updatePill").onclick = hardRefresh;
  setInterval(checkVersion, 120 * 1000);  // nudge open pages to refresh when a new build ships
  // offline support — network-first SW (registered after first render so it never blocks paint).
  // The shell stays network-first so an online visitor always gets the latest build; the version
  // nudge still handles prompting a reload when a new app.js ships.
  // background-scroll lock behind modals — primary is the CSS `:has()` rule; this is a fallback for older webviews
  const _lockObs = new MutationObserver(() => document.documentElement.classList.toggle("modal-open", !!document.querySelector("dialog[open]")));
  $$("dialog").forEach(d => _lockObs.observe(d, { attributes: true, attributeFilter: ["open"] }));
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(reg => {
      const poke = () => reg.update().catch(() => {});           // re-check for a new worker promptly (don't wait on the browser's lazy ~24h schedule)
      addEventListener("focus", poke); setInterval(poke, 120 * 1000);
    }).catch(() => {});
    // a freshly-activated worker (a new deploy just took over) pings open pages → surface the one-tap refresh immediately
    navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "wc26-updated") { const p = $("#updatePill"); if (p) p.hidden = false; } });
  }
}
boot();
})();
