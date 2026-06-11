/* WC·26 companion — vanilla JS, no build step */
(() => {
"use strict";

/* ---------------- state ---------------- */
const S = {
  matches: [], teams: {}, results: { matches: {} },
  tz: localStorage.getItem("wc26.tz") || "auto",
  fav: localStorage.getItem("wc26.fav") || null,
  view: "today",
  filters: { stage: "all", onlyFav: false },
  sim: JSON.parse(localStorage.getItem("wc26.sim") || "null") || { order: {}, thirds: [], ko: {} },
};
const AUTO_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const tz = () => (S.tz === "auto" ? AUTO_TZ : S.tz);
const GROUPS = "ABCDEFGHIJKL".split("");

const ZONES = [
  ["auto", "Auto (device)"],
  ["Asia/Dubai", "Dubai"], ["Asia/Riyadh", "Riyadh"], ["Asia/Karachi", "Karachi"],
  ["Asia/Kolkata", "India"], ["Asia/Singapore", "Singapore"], ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"], ["Europe/London", "London"], ["Europe/Paris", "Paris / Berlin"],
  ["Europe/Istanbul", "Istanbul"], ["Africa/Cairo", "Cairo"], ["Africa/Lagos", "Lagos"],
  ["Africa/Johannesburg", "Johannesburg"], ["America/Sao_Paulo", "São Paulo"],
  ["America/New_York", "New York"], ["America/Toronto", "Toronto"], ["America/Chicago", "Chicago"],
  ["America/Denver", "Denver"], ["America/Mexico_City", "Mexico City"],
  ["America/Los_Angeles", "Los Angeles"], ["America/Vancouver", "Vancouver"],
];

/* ---------------- utils ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function flag(code) {
  if (code === "GB-ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (code === "GB-SCT") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  return code.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}
const fmt = (iso, opts) => new Intl.DateTimeFormat("en", { timeZone: tz(), ...opts }).format(new Date(iso));
const timeStr = iso => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
const dayKey = iso => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = iso => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const tzShort = () => {
  try { return new Intl.DateTimeFormat("en", { timeZone: tz(), timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value; }
  catch { return tz(); }
};
const tzOffsetLabel = zone => {
  try {
    const p = new Intl.DateTimeFormat("en", { timeZone: zone === "auto" ? AUTO_TZ : zone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return p.find(x => x.type === "timeZoneName").value.replace("GMT", "UTC");
  } catch { return ""; }
};

/* ---------------- results / resolution ---------------- */
const res = m => S.results.matches?.[m.id] || null;
const ST = { SCHED: "SCHED", LIVE: "LIVE", HT: "HT", FT: "FT" };
function status(m) {
  const r = res(m);
  if (r?.st) return r.st;
  return new Date(m.utc) <= new Date() && new Date() - new Date(m.utc) < 3 * 3600e3 ? ST.LIVE : ST.SCHED;
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
  const hWin = r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1));
  const h = slotInfo(fm, "home").code, a = slotInfo(fm, "away").code;
  if (!h || !a) return null;
  return s.feeds ? (hWin ? h : a) : (hWin ? a : h);
}
const isFavMatch = m => S.fav && (slotInfo(m, "home").code === S.fav || slotInfo(m, "away").code === S.fav);

/* ---------------- standings ---------------- */
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
  return Object.values(rows).sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.code.localeCompare(b.code));
}

/* ---------------- theming ---------------- */
function applyTheme(animateFrom) {
  const root = document.documentElement;
  const t = S.fav && S.teams[S.fav];
  let c1 = t ? t.c1 : "", c2 = t ? t.c2 : "";
  if (t && tooLight(c1)) [c1, c2] = [c2, c1];
  if (t && tooLight(c1)) c1 = "#0BA360";
  root.style.setProperty("--acc1", t ? c1 : "var(--pitch)");
  root.style.setProperty("--acc2", t ? (tooLight(c2) ? "#0D1B2A" : c2) : "#0D1B2A");
  $("#teamChipFlag").textContent = t ? flag(S.fav) : "⚽";
  $("#teamChipName").textContent = t ? t.name : "Pick a team";
  if (animateFrom && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const sw = $("#themeSweep"), r = animateFrom.getBoundingClientRect();
    sw.style.left = r.left + r.width / 2 - innerWidth + "px";
    sw.style.top = r.top + r.height / 2 - innerHeight + "px";
    sw.style.width = innerWidth * 2 + "px"; sw.style.height = innerHeight * 2 + "px";
    sw.classList.remove("go"); void sw.offsetWidth; sw.classList.add("go");
    confetti(c1 || "#0BA360", c2 || "#E8B931");
  }
}
const tooLight = hex => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 200;
};

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

/* ---------------- ticker ---------------- */
function renderTicker() {
  const todayK = dayKey(new Date().toISOString());
  const todays = S.matches.filter(m => dayKey(m.utc) === todayK).sort((a, b) => a.utc.localeCompare(b.utc));
  const wrap = $("#ticker");
  if (!todays.length) { wrap.hidden = true; return; }
  const item = m => {
    const h = slotInfo(m, "home"), a = slotInfo(m, "away"), r = res(m), st = status(m);
    const mid = [ST.LIVE, ST.HT].includes(st)
      ? `<span class="tk-live">● ${r?.h ?? 0}–${r?.a ?? 0}</span>`
      : st === ST.FT ? `<b>${r.h}–${r.a}</b> FT`
      : `<span class="tk-acc">${timeStr(m.utc)}</span>`;
    const nm = s => s.code ? `${flag(s.code)} ${shortName(s.code)}` : "TBD";
    return `<span class="ticker-item">${nm(h)} ${mid} ${nm(a)}</span>`;
  };
  const half = todays.map(item).join('<span style="opacity:.35">／</span>');
  $("#tickerTrack").innerHTML = half + '<span style="opacity:.35">／</span>' + half; // loop
  wrap.hidden = false;
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
  const score = r && r.h != null;
  const winH = score && st === ST.FT && (r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1)));
  const winA = score && st === ST.FT && (r.a > r.h || (r.h === r.a && (r.ap ?? -1) > (r.hp ?? -1)));
  const badge = st === ST.LIVE ? `<span class="badge live">Live${r?.min ? " " + r.min + "′" : ""}</span>`
    : st === ST.HT ? `<span class="badge live">HT</span>`
    : st === ST.FT ? `<span class="badge ft">FT</span>`
    : `<span class="badge soon">${timeStr(m.utc)}</span>`;
  const teamRow = (s, win) =>
    `<div class="mcard-team ${s.ph ? "is-ph" : ""}">` +
    `<span class="fl">${s.code ? flag(s.code) : "·"}</span><span>${esc(s.name)}</span>` +
    (win ? `<span class="winner-mark">▲</span>` : "") + `</div>`;
  const xi = r?.xi;
  return `<button class="mcard ${fav ? "is-fav" : ""} ${xi ? "has-xi" : ""}" style="--i:${i}" data-mid="${m.id}">
    <div class="mcard-row">
      <div class="mcard-time">${timeStr(m.utc)}<small>${fmt(m.utc, { day: "numeric", month: "short" })}</small></div>
      <div class="mcard-teams">${teamRow(h, winH)}${teamRow(a, winA)}</div>
      <div class="mcard-right">${score
        ? `<div class="mcard-score"><span>${r.h}</span><span>${r.a}</span>${r.hp != null ? `<span class="pens">(${r.hp}–${r.ap} pens)</span>` : ""}</div>`
        : badge}</div>
    </div>
    ${opts.sub !== false ? `<div class="mcard-sub"><span class="grp">${esc(stageL)}</span><span>${esc(m.stadium)}</span><span>${esc(m.city)}</span>${xi ? `<span class="xi-hint">▾ Lineups</span>` : ""}${st === ST.SCHED ? `<a class="ics-link" href="${icsHref(m, h, a)}" download="wc26-${m.id}.ics" onclick="event.stopPropagation()">+ calendar</a>` : ""}</div>` : ""}
    ${xi ? xiPanel(xi, h, a) : ""}
  </button>`;
}
function xiPanel(xi, h, a) {
  const col = (side, s) => `<div class="xi-col">
    <div class="xi-head"><span>${s.code ? flag(s.code) : ""} ${esc(s.name)}</span>${side.f ? `<b>${esc(side.f)}</b>` : ""}</div>
    ${(side.xi || []).map(p => `<div class="xi-p"><span>${p[0] ?? ""}</span>${esc(p[1] || "")}</div>`).join("")}
    ${side.coach ? `<div class="xi-coach">Coach · ${esc(side.coach)}</div>` : ""}
  </div>`;
  return `<div class="mcard-xi">${col(xi.h, h)}${col(xi.a, a)}</div>`;
}
function icsHref(m, h, a) {
  const dt = iso => iso.replace(/[-:]/g, "").replace(".000", "");
  const end = new Date(new Date(m.utc).getTime() + 2 * 3600e3).toISOString().slice(0, 19) + "Z";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WC26//EN", "BEGIN:VEVENT",
    `UID:${m.id}@wc26`, `DTSTART:${dt(m.utc)}`, `DTEND:${dt(end)}`,
    `SUMMARY:${h.name} vs ${a.name} — World Cup 2026`,
    `LOCATION:${m.stadium}, ${m.city}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}

/* ---------------- render: today ---------------- */
let cdTimer = null, prevCd = {};
function renderToday() {
  const el = $("#view-today");
  const now = new Date();
  const todayK = dayKey(now.toISOString());
  const todays = S.matches.filter(m => dayKey(m.utc) === todayK).sort((a, b) => a.utc.localeCompare(b.utc));
  const live = S.matches.find(m => [ST.LIVE, ST.HT].includes(status(m)));
  const next = S.matches.filter(m => new Date(m.utc) > now && status(m) === ST.SCHED)
    .sort((a, b) => a.utc.localeCompare(b.utc))[0];
  const heroM = live || next;

  let html = "";
  if (heroM) {
    const h = slotInfo(heroM, "home"), a = slotInfo(heroM, "away");
    const r = res(heroM), isLive = !!live;
    html += `<div class="hero">
      <div class="hero-tag ${isLive ? "is-live" : ""}">
        ${isLive ? `<span class="live-dot"></span> Live now` : `${isFavMatch(heroM) ? "Your team · " : ""}Next kickoff`}
        <span style="color:var(--ink-soft);font-weight:600">— ${esc(heroM.group ? "Group " + heroM.group : heroM.round)}</span>
      </div>
      <div class="hero-teams">
        <div class="hero-side"><span class="hero-flag">${h.code ? flag(h.code) : "·"}</span><span class="hero-name">${esc(h.name)}</span></div>
        <div class="hero-mid">${isLive && r
          ? `<span class="hero-score">${r.h ?? 0}–${r.a ?? 0}</span><span class="hero-minute">${r.st === ST.HT ? "Half-time" : (r.min ? r.min + "′" : "In play")}</span>`
          : `<span class="hero-vs">VS</span>`}</div>
        <div class="hero-side"><span class="hero-flag">${a.code ? flag(a.code) : "·"}</span><span class="hero-name">${esc(a.name)}</span></div>
      </div>
      ${!isLive ? `<div class="countdown" id="cd" data-utc="${heroM.utc}">
        ${["d", "h", "m", "s"].map(k => `<div class="cd-cell"><span class="cd-num" data-k="${k}">–</span><span class="cd-lab">${{ d: "days", h: "hrs", m: "min", s: "sec" }[k]}</span></div>`).join("")}
      </div>` : ""}
      <div class="hero-meta">
        <span><b>${timeStr(heroM.utc)}</b> ${tzShort()}</span>
        <span>${esc(heroM.stadium)}</span><span>${esc(heroM.city)}</span>
        <span>${fmt(heroM.utc, { weekday: "short", day: "numeric", month: "short" })}</span>
      </div>
    </div>`;
  }

  html += `<div class="eyebrow"><span class="ey-acc">${todays.length || "No"}</span> match${todays.length === 1 ? "" : "es"} today — ${dayLabel(now.toISOString())}</div>`;
  html += todays.length
    ? `<div class="timeline">${todays.map((m, i) => {
        const st = status(m);
        return `<div class="t-item"><span class="t-node ${st === ST.FT ? "is-done" : ""} ${[ST.LIVE, ST.HT].includes(st) ? "is-live" : ""}"></span>${matchCard(m, i)}</div>`;
      }).join("")}</div>`
    : `<div class="empty">A rest day — no matches scheduled. The bracket is breathing.</div>`;

  el.innerHTML = html;
  startCountdown();
}
function startCountdown() {
  clearInterval(cdTimer); prevCd = {};
  const cd = $("#cd"); if (!cd) return;
  const target = new Date(cd.dataset.utc);
  const tickFn = () => {
    let s = Math.max(0, Math.floor((target - new Date()) / 1000));
    const v = { d: s / 86400 | 0, h: s / 3600 % 24 | 0, m: s / 60 % 60 | 0, s: s % 60 };
    $$(".cd-num", cd).forEach(n => {
      const k = n.dataset.k, val = String(v[k]).padStart(2, "0");
      if (prevCd[k] !== val) { n.textContent = val; n.classList.remove("tick"); void n.offsetWidth; n.classList.add("tick"); prevCd[k] = val; }
    });
    if (s === 0) { clearInterval(cdTimer); setTimeout(refreshResults, 4000); }
  };
  tickFn(); cdTimer = setInterval(tickFn, 1000);
}

/* ---------------- render: my team ---------------- */
function renderMyTeam() {
  const el = $("#view-myteam");
  if (!S.fav) {
    el.innerHTML = `<div class="pick-cta">
      <span style="font-size:42px">🏟️</span>
      <span class="big">Who are you backing?</span>
      <span style="color:var(--ink-soft);font-size:13.5px;max-width:300px">Pick a team — the site takes their colors, pins their matches and tracks their road to MetLife.</span>
      <button class="btn" id="ctaPick">Choose your team</button></div>`;
    $("#ctaPick").onclick = () => $("#teamDialog").showModal();
    return;
  }
  const t = S.teams[S.fav];
  const mine = S.matches.filter(isFavMatch).sort((a, b) => a.utc.localeCompare(b.utc));
  const group = mine.find(m => m.group)?.group;
  const tbl = group ? standings(group) : [];
  const pos = tbl.findIndex(r => r.code === S.fav) + 1;
  const played = tbl.find(r => r.code === S.fav)?.p || 0;
  const upcoming = mine.filter(m => status(m) === ST.SCHED);
  const done = mine.filter(m => status(m) !== ST.SCHED);

  el.innerHTML = `
    <div class="team-hero"><span class="fl">${flag(S.fav)}</span>
      <div><h2>${esc(t.name)}</h2>
      <p>Group ${group || "—"}${played ? ` · currently <b>${ordinal(pos)}</b> after ${played} match${played > 1 ? "es" : ""}` : " · campaign starts soon"}</p></div></div>
    ${done.length ? `<div class="eyebrow">Played</div>` + done.map((m, i) => matchCard(m, i)).join("") : ""}
    <div class="eyebrow">Fixtures</div>
    ${upcoming.length ? upcoming.map((m, i) => matchCard(m, i)).join("") : `<div class="empty">No scheduled fixtures — check the bracket for their knockout path.</div>`}
    ${group ? `<div class="eyebrow">Group ${group}</div><div class="gwrap">${groupTable(group, 0)}</div>
      <div class="legend"><span class="l1"><i></i>Top 2 advance</span><span class="l3"><i></i>3rd — possible best-8 spot</span></div>` : ""}
    ${squadSection(S.fav)}`;
}
function squadSection(code) {
  const sq = S.squads?.[code];
  if (!sq) return `<div class="eyebrow">Squad</div><div class="empty">Squad list lands once the squads workflow runs (see README) — 16 teams are pre-loaded.</div>`;
  const groups = { GK: "Goalkeepers", DF: "Defenders", MF: "Midfielders", FW: "Forwards" };
  const byPos = p => sq.players.filter(x => x.pos === p);
  return `<div class="eyebrow">Squad — ${sq.players.length} players${sq.coach ? ` · Coach <b style="color:var(--ink)">&nbsp;${esc(sq.coach)}</b>` : ""}</div>
    <div class="roster">${Object.entries(groups).map(([p, label]) => {
      const ps = byPos(p);
      return ps.length ? `<div class="roster-pos"><h5>${label} <span>${ps.length}</span></h5>
        ${ps.map(x => `<div class="roster-row">
          <span class="rnum">${x.n ?? "·"}</span>
          <span class="rname">${esc(x.name.replace(" (captain)", ""))}${x.name.includes("(captain)") ? `<i class="cpt">C</i>` : ""}</span>
          ${x.caps != null ? `<span class="rstat">${x.caps} caps${x.goals ? ` · ${x.goals}g` : ""}</span>` : ""}
          ${x.club ? `<span class="rclub">${esc(x.club)}</span>` : ""}
        </div>`).join("")}</div>` : "";
    }).join("")}</div>`;
}
const ordinal = n => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/* ---------------- render: calendar ---------------- */
function renderCalendar() {
  const el = $("#view-calendar");
  const f = S.filters;
  let list = S.matches.slice().sort((a, b) => a.utc.localeCompare(b.utc));
  if (f.stage === "group") list = list.filter(m => m.stage === "group");
  if (f.stage === "ko") list = list.filter(m => m.stage !== "group");
  if (f.onlyFav) list = list.filter(isFavMatch);
  const days = {};
  list.forEach(m => (days[dayKey(m.utc)] ??= []).push(m));

  el.innerHTML = `<div class="filters">
      ${[["all", "All 104"], ["group", "Groups"], ["ko", "Knockouts"]].map(([k, l]) =>
        `<button class="fbtn ${f.stage === k ? "is-on" : ""}" data-stage="${k}">${l}</button>`).join("")}
      ${S.fav ? `<button class="fbtn ${f.onlyFav ? "is-on" : ""}" data-onlyfav>★ ${esc(S.teams[S.fav].name)} only</button>` : ""}
    </div>` +
    (list.length ? Object.entries(days).map(([k, ms]) =>
      `<div class="dayhead">${dayLabel(ms[0].utc)} <small>${ms.length} match${ms.length > 1 ? "es" : ""}</small></div>` +
      ms.map((m, i) => matchCard(m, Math.min(i, 8))).join("")).join("")
    : `<div class="empty">Nothing matches these filters.</div>`);

  $$("[data-stage]", el).forEach(b => b.onclick = () => { f.stage = b.dataset.stage; renderCalendar(); });
  const fb = $("[data-onlyfav]", el); if (fb) fb.onclick = () => { f.onlyFav = !f.onlyFav; renderCalendar(); };
}

/* ---------------- render: groups ---------------- */
const TABLE_COLS = `<colgroup><col class="c-name"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-gd"><col class="c-pts"></colgroup>`;
function groupTable(g, i) {
  const rows = standings(g);
  return `<div class="gtable" style="--i:${i}"><h4>Group <span>${g}</span></h4>
    <table>${TABLE_COLS}<thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>
    ${rows.map((r, idx) => `<tr class="${idx < 2 ? "q1" : idx === 2 ? "q3" : ""} ${r.code === S.fav ? "is-fav" : ""}">
      <td class="tname" title="${esc(S.teams[r.code].name)}"><span class="fl">${flag(r.code)}</span>${esc(S.teams[r.code].name)}</td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join("")}
    </tbody></table></div>`;
}
function renderGroups() {
  $("#view-groups").innerHTML =
    `<div class="gwrap">${GROUPS.map((g, i) => groupTable(g, i)).join("")}</div>
     <div class="legend"><span class="l1"><i></i>Top 2 advance to the Round of 32</span><span class="l3"><i></i>3rd place — eight best advance</span></div>`;
}

/* ---------------- render: bracket (real results) ---------------- */
function renderBracket() {
  const cols = [["r32", "Round of 32"], ["r16", "Round of 16"], ["qf", "Quarter-finals"], ["sf", "Semi-finals"], ["final", "Final"]];
  const third = S.matches.find(m => m.stage === "third");
  $("#view-bracket").innerHTML = `<div class="bracket-scroll"><div class="bracket">
    ${cols.map(([st, title]) => `<div class="bcol"><div class="bcol-title">${title}</div>
      ${S.matches.filter(m => m.stage === st).sort((a, b) => a.num - b.num).map((m, i) => bMatch(m, i)).join("")}
      ${st === "final" && third ? `<div class="bcol-title" style="margin-top:18px">Third place</div>` + bMatch(third, 1) : ""}
    </div>`).join("")}
  </div></div>
  <p style="font-size:11.5px;color:var(--ink-soft);margin-top:10px">Scroll sideways → · winners flow left to right · the bracket fills itself as results land. Want to call it early? Try the <b>Predict</b> tab.</p>`;
}
function bMatch(m, i) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const r = res(m), st = status(m), fin = st === ST.FT && r;
  const wH = fin && (r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1)));
  const row = (s, sc, w, l) => `<div class="bm-row ${w ? "is-w" : ""} ${l ? "is-l" : ""}">
    <span class="fl">${s.code ? flag(s.code) : "·"}</span>
    <span class="nm ${s.ph ? "ph" : ""}">${esc(s.ph ? (s.short || s.name) : s.name)}${w && m.stage === "final" ? " 🏆" : ""}</span>
    ${sc != null ? `<span class="sc">${sc}</span>` : ""}</div>`;
  return `<div class="bm ${m.stage === "final" ? "is-final" : ""}" style="--i:${i}">
    ${row(h, fin ? r.h : null, wH, fin && !wH)}${row(a, fin ? r.a : null, fin && !wH, wH)}
    <div class="bm-label">M${m.num} · ${fmt(m.utc, { day: "numeric", month: "short" })} ${timeStr(m.utc)} · ${esc(m.city.split(",")[0])}${[ST.LIVE, ST.HT].includes(st) ? ` · <span style="color:var(--live);font-weight:700">LIVE</span>` : ""}</div>
  </div>`;
}

/* ============================================================
   SIMULATOR — order groups, pick thirds, tap winners
   ============================================================ */
const saveSim = () => localStorage.setItem("wc26.sim", JSON.stringify(S.sim));

function simOrder(g) {
  if (!S.sim.order[g] || S.sim.order[g].length !== 4) S.sim.order[g] = standings(g).map(r => r.code);
  return S.sim.order[g];
}
// parse allowed groups from a third-place slot short label "3rd A/B/C/D/F"
const thirdAllowed = s => (s.short || "").replace("3rd ", "").split("/");

// assign chosen 8 third-place teams to the 8 constrained R32 slots (backtracking)
function allocateThirds() {
  const slots = [];
  S.matches.filter(m => m.stage === "r32").forEach(m => ["home", "away"].forEach(side => {
    if ((m[side].short || "").startsWith("3rd")) slots.push({ key: m.id + ":" + side, allowed: thirdAllowed(m[side]) });
  }));
  const picks = S.sim.thirds.map(code => ({ code, g: groupOf(code) }));
  if (picks.length !== slots.length) return null;
  const used = new Array(picks.length).fill(false), assign = {};
  // most-constrained slot first
  const order = slots.map((s, i) => i).sort((a, b) =>
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
  return bt(0) ? assign : "impossible";
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

function renderSim() {
  const el = $("#view-sim");
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
  const simBracket = !thirdsDone ? `<div class="empty">Pick your 8 third-place teams above to unlock the bracket.</div>`
    : alloc === "impossible" ? `<div class="empty">That combination of thirds can't fill the slots — swap one and try again.</div>`
    : `<div class="bracket-scroll"><div class="bracket">
        ${cols.map(([st, title]) => `<div class="bcol"><div class="bcol-title">${title}</div>
          ${S.matches.filter(m => m.stage === st).sort((a, b) => a.num - b.num).map((m, i) => simMatch(m, i, alloc)).join("")}
          ${st === "final" && third ? `<div class="bcol-title" style="margin-top:18px">Third place</div>` + simMatch(third, 1, alloc) : ""}
        </div>`).join("")}
      </div></div>`;

  el.innerHTML = `
    <div class="sim-intro">
      <h2>Call the whole tournament 🔮</h2>
      <p>Order each group, choose the eight best third-place teams, then tap winners all the way to MetLife. Your prediction saves on this device.</p>
      <div class="sim-actions">
        <button class="btn ghost" id="simStandings">Use live standings</button>
        <button class="btn ghost" id="simShuffle">Shuffle it all</button>
        <button class="btn ghost" id="simReset">Start over</button>
      </div>
    </div>
    <div class="eyebrow"><span class="step-n">1</span> Order the groups — top two go through</div>
    <div class="gwrap">${GROUPS.map(groupCard).join("")}</div>
    <div class="eyebrow"><span class="step-n">2</span> Best third-placed teams <span class="tcount">${S.sim.thirds.length}/8</span></div>
    <div class="thirds">${thirdChips}</div>
    <div class="eyebrow"><span class="step-n">3</span> Tap winners through to the final</div>
    ${simBracket}
    ${champ ? championBanner(champ) : ""}`;

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
    pruneSim(); saveSim(); renderSim();
    if (+num === 104) {
      const t = S.teams[code];
      confetti(t.c1, t.c2, { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 });
    }
  });
  // wire: actions
  $("#simStandings").onclick = () => { S.sim.order = {}; S.sim.thirds = []; S.sim.ko = {}; saveSim(); renderSim(); };
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
  $("#simReset").onclick = () => { S.sim = { order: {}, thirds: [], ko: {} }; saveSim(); renderSim(); };
}
function simMatch(m, i, alloc) {
  const { h, a } = simSlots(m, alloc);
  const pick = S.sim.ko[m.num];
  const row = (code, other) => {
    if (!code) return `<div class="bm-row"><span class="fl">·</span><span class="nm ph">awaiting pick</span></div>`;
    const isPick = pick === code, isOut = pick && pick !== code;
    return `<div class="bm-row pickable ${isPick ? "is-pick" : ""} ${isOut ? "is-out" : ""}" data-pick="${m.num}|${code}" role="button" tabindex="0">
      <span class="fl">${flag(code)}</span><span class="nm">${esc(S.teams[code].name)}${isPick && m.stage === "final" ? " 🏆" : ""}</span></div>`;
  };
  return `<div class="bm ${m.stage === "final" ? "is-final" : ""}" style="--i:${i}">
    ${row(h, a)}${row(a, h)}
    <div class="bm-label">M${m.num} · ${fmt(m.utc, { day: "numeric", month: "short" })} · ${esc(m.city.split(",")[0])}</div></div>`;
}
function championBanner(code) {
  const t = S.teams[code];
  return `<div class="champ">
    <span class="cup">🏆</span><span class="cfl">${flag(code)}</span>
    <h3>${esc(t.name)}</h3><p>Your champions of the world · July 19 · MetLife</p></div>`;
}

/* ---------------- navigation ---------------- */
const RENDER = { today: renderToday, myteam: renderMyTeam, calendar: renderCalendar, groups: renderGroups, bracket: renderBracket, sim: renderSim };
function nav(v) {
  S.view = v;
  $$(".view").forEach(el => el.hidden = el.id !== "view-" + v);
  $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.nav === v));
  moveInk();
  RENDER[v]();
  scrollTo({ top: 0, behavior: "instant" });
}
function moveInk() {
  const t = $(".tab.is-active"), ink = $("#tabInk");
  if (!t) return;
  ink.style.left = t.offsetLeft + 8 + "px";
  ink.style.width = t.offsetWidth - 16 + "px";
}

/* ---------------- pickers ---------------- */
function buildPickers() {
  $("#tzList").innerHTML = ZONES.map(([z, l]) =>
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
  $("#tzLabel").textContent = S.tz === "auto" ? `Auto · ${tzShort()}` : (ZONES.find(z => z[0] === S.tz)?.[1] || S.tz);
  $("#footTz").textContent = `${tz()} (${tzShort()})`;
}

/* ---------------- data ---------------- */
async function loadStatic() {
  const [m, t] = await Promise.all([
    fetch("data/matches.json").then(r => r.json()),
    fetch("data/teams.json").then(r => r.json()),
  ]);
  S.matches = m.matches; S.teams = t;
  try { S.squads = (await (await fetch("data/squads.json")).json()).squads || {}; }
  catch { S.squads = {}; }
}
async function refreshResults() {
  try {
    const r = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) {
      S.results = await r.json();
      $("#updatedLabel").textContent = S.results.updated
        ? "Scores updated " + new Intl.DateTimeFormat("en", { timeZone: tz(), hour: "2-digit", minute: "2-digit" }).format(new Date(S.results.updated))
        : "Schedule loaded";
      renderTicker();
      RENDER[S.view]();
    }
  } catch { /* offline or first deploy — schedule still works */ }
}

/* ---------------- boot ---------------- */
async function boot() {
  await loadStatic();
  applyTheme(); syncTzLabels(); buildPickers(); renderTicker();
  $$("[data-nav]").forEach(b => b.onclick = e => { e.preventDefault(); nav(b.dataset.nav); });
  $("#tzChip").onclick = () => $("#tzDialog").showModal();
  $("#teamChip").onclick = () => $("#teamDialog").showModal();
  $$("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
  $$("dialog").forEach(d => d.onclick = e => { if (e.target === d) d.close(); });
  addEventListener("resize", moveInk);
  document.addEventListener("click", e => {
    const card = e.target.closest(".mcard.has-xi");
    if (card && !e.target.closest("a")) card.classList.toggle("open");
  });
  nav("today");
  refreshResults();
  setInterval(refreshResults, 90 * 1000); // pick up fresh scores every 90s
}
boot();
})();
