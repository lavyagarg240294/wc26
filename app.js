/* WC·26 companion — vanilla JS, no build step */
(() => {
"use strict";

/* ---------------- state ---------------- */
const S = {
  matches: [], teams: {}, results: { matches: {} },
  tz: localStorage.getItem("wc26.tz") || "auto",
  fav: localStorage.getItem("wc26.fav") || null,
  view: "matches",
  filters: { stage: "all", onlyFav: false, saved: false },
  saved: new Set(JSON.parse(localStorage.getItem("wc26.saved") || "[]")),
  sim: JSON.parse(localStorage.getItem("wc26.sim") || "null") || { order: {}, thirds: [], ko: {} },
  _lastResults: null,
};
const isSaved = id => S.saved.has(id);
function toggleSave(id) {
  S.saved.has(id) ? S.saved.delete(id) : S.saved.add(id);
  localStorage.setItem("wc26.saved", JSON.stringify([...S.saved]));
  RENDER[S.view]();
  const md = document.getElementById("matchDialog");
  if (md && md.open && md.dataset.mid === id) {
    const b = md.querySelector(".md-save"), on = S.saved.has(id);
    if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "★ Saved" : "☆ Save match"; }
  }
}
const AUTO_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const tz = () => (S.tz === "auto" ? AUTO_TZ : S.tz);
const GROUPS = "ABCDEFGHIJKL".split("");
const BUILD = "27";  // shown in footer; bump with the ?v= asset version

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
  // kickoff has passed but the match isn't over (within a generous ~3h window)
  const started = new Date(m.utc) <= new Date() && new Date() - new Date(m.utc) < 3 * 3600e3;
  // the free data feed often lags — if it still says SCHED after kickoff, treat as live ("score updating")
  if (r?.st) return (r.st === ST.SCHED && started) ? ST.LIVE : r.st;
  return started ? ST.LIVE : ST.SCHED;
}
// live match clock: exact minute from the feed if present, else an estimate from kickoff
// (the free feed often only flags "live" with no minute). Estimate allows for a 15′ half-time.
function clockStr(m, r) {
  if (r && r.min != null) return r.min + "′";
  const real = Math.floor((Date.now() - new Date(m.utc).getTime()) / 60000);
  if (real < 0) return "";
  const est = real <= 45 ? real : Math.max(46, real - 15);
  return "~" + (est >= 90 ? "90+" : est) + "′";
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

/* ---------------- football + goal celebration ---------------- */
const BALL = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="#fff" stroke="#0D1B2A" stroke-width="4"/><polygon points="50,34 65.2,45.1 59.4,62.9 40.6,62.9 34.8,45.1" fill="#0D1B2A"/><g stroke="#0D1B2A" stroke-width="4" stroke-linecap="round"><path d="M50 34V7"/><path d="M65.2 45.1L89 33"/><path d="M59.4 62.9L74 87"/><path d="M40.6 62.9L26 87"/><path d="M34.8 45.1L11 33"/></g></svg>`;
const ballSVG = cls => `<span class="ball ${cls || ""}" aria-hidden="true">${BALL}</span>`;

function goalCelebration(code) {
  const t = code && S.teams[code];
  confetti(t ? t.c1 : "#0BA360", t ? t.c2 : "#E8B931");
  const toast = document.createElement("div");
  toast.className = "goal-toast";
  toast.innerHTML = `${ballSVG("goal-ball")}<div class="goal-txt"><b>GOAL!</b>${code ? `<span>${flag(code)} ${esc(S.teams[code].name)}</span>` : ""}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2700);
}
// compare previous vs new results; fire a celebration when a LIVE score ticks up
function celebrateGoals(prev, now) {
  for (const id in now) {
    const a = prev[id], b = now[id];
    if (!a || !b || ![ST.LIVE, ST.HT].includes(b.st)) continue;
    if (((b.h || 0) + (b.a || 0)) <= ((a.h || 0) + (a.a || 0))) continue;
    const m = S.matches.find(x => x.id === id); if (!m) continue;
    goalCelebration(slotInfo(m, (b.h || 0) > (a.h || 0) ? "home" : "away").code);
    break; // one celebration per refresh is plenty
  }
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
      ? (r && r.h != null ? `<span class="tk-live">● ${r.h}–${r.a}</span>` : `<span class="tk-live">● LIVE</span>`)
      : st === ST.FT ? `<b>${r.h}–${r.a}</b> FT`
      : `<span class="tk-acc">${timeStr(m.utc)}</span>`;
    const nm = s => s.code ? `${flag(s.code)} ${esc(S.teams[s.code]?.name || s.code)}` : "TBD";
    return `<span class="ticker-item">${nm(h)} ${mid} ${nm(a)}</span>`;
  };
  const sep = '<span class="tk-sep">／</span>';
  const track = $("#tickerTrack");
  if (todays.length >= 3) {
    // enough to fill the strip — duplicate for a seamless scrolling marquee
    const half = todays.map(item).join(sep);
    track.innerHTML = half + sep + half;
    track.classList.remove("is-static");
  } else {
    // one or two matches — show once, centered, no scroll (avoids the "repeated" look)
    track.innerHTML = todays.map(item).join(sep);
    track.classList.add("is-static");
  }
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
  const badge = st === ST.LIVE ? `<span class="badge live">${clockStr(m, r) || "Live"}</span>`
    : st === ST.HT ? `<span class="badge live">HT</span>`
    : st === ST.FT ? `<span class="badge ft">FT</span>`
    : `<span class="badge soon">${timeStr(m.utc)}</span>`;
  const teamRow = (s, key, lost) =>
    `<div class="mcard-team ${s.ph ? "is-ph" : ""} ${lost ? "is-lost" : ""}">` +
    `<span class="fl">${s.code ? flag(s.code) : "·"}</span><span>${esc(slotText(m, key, s))}</span></div>`;
  const xi = r?.xi;
  const sv = isSaved(m.id);
  return `<button class="mcard ${fav ? "is-fav" : ""}" style="--i:${i}" data-mid="${m.id}">
    <span class="mcard-star ${sv ? "is-on" : ""}" data-save="${m.id}" role="button" tabindex="0" aria-pressed="${sv}" aria-label="${sv ? "Remove saved match" : "Save this match"}" title="${sv ? "Saved — tap to remove" : "Save this match"}">${sv ? "★" : "☆"}</span>
    <div class="mcard-row">
      <div class="mcard-time">${timeStr(m.utc)}<small>${fmt(m.utc, { day: "numeric", month: "short" })}</small></div>
      <div class="mcard-teams">${teamRow(h, "home", winA)}${teamRow(a, "away", winH)}</div>
      <div class="mcard-right">${score
        ? `<div class="mcard-score"><span class="${winA ? "lo" : ""}">${r.h}</span><span class="${winH ? "lo" : ""}">${r.a}</span>${r.hp != null ? `<span class="pens">(${r.hp}–${r.ap} pens)</span>` : ""}</div>`
        : badge}</div>
    </div>
    ${opts.sub !== false ? `<div class="mcard-sub"><span class="grp">${esc(stageL)}</span><span>${esc(m.stadium)}</span><span>${esc(m.city)}</span>${xi ? `<span class="xi-hint">Lineups</span>` : ""}<span class="mcard-go">Details ›</span></div>` : ""}
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
function openMatch(id) {
  const m = S.matches.find(x => x.id === id); if (!m) return;
  const h = slotInfo(m, "home"), a = slotInfo(m, "away"), r = res(m), st = status(m);
  const score = r && r.h != null;
  const stageL = m.group ? `Group ${m.group}` : m.round;
  const sv = isSaved(id);
  const statusTag = st === ST.LIVE ? `<span class="md-tag live">● Live ${clockStr(m, r)}</span>`
    : st === ST.HT ? `<span class="md-tag live">Half-time</span>`
    : st === ST.FT ? `<span class="md-tag ft">Full time</span>`
    : `<span class="md-tag soon">Kicks off ${timeStr(m.utc)} ${tzShort()}</span>`;
  const side = (s, key) => `<div class="md-team ${s.code === S.fav ? "is-fav" : ""}">
      <span class="md-flag">${s.code ? flag(s.code) : "·"}</span>
      <span class="md-name ${s.ph ? "is-ph" : ""}">${esc(slotText(m, key, s))}</span>
      ${s.code ? `<span class="md-teaminfo">${esc(S.teams[s.code].conf || "")}${S.teams[s.code].titles ? ` · ${S.teams[s.code].titles}×🏆` : ""}</span>` : ""}
      ${s.code ? `<button class="md-squad-link" data-squad="${s.code}">View squad ›</button>` : ""}</div>`;
  const mid = score
    ? `<div class="md-score">${r.h}<span>–</span>${r.a}</div>${r.hp != null ? `<div class="md-pens">${r.hp}–${r.ap} on penalties</div>` : ""}`
    : `<div class="md-vs">VS</div>`;
  $("#matchTitle").innerHTML = `<span class="md-stage">${esc(stageL)}</span>`;
  $("#matchBody").innerHTML = `
    <div class="md-tagrow">${statusTag}
      <button class="md-save ${sv ? "is-on" : ""}" data-save="${id}" aria-pressed="${sv}">${sv ? "★ Saved" : "☆ Save match"}</button>
    </div>
    <div class="md-teams">${side(h, "home")}<div class="md-mid">${mid}</div>${side(a, "away")}</div>
    ${(r?.gh?.length || r?.ga?.length) ? `<div class="md-goals">
      <div class="md-goals-col">${(r.gh || []).map(g => `<div class="md-goal">⚽ ${esc(g)}</div>`).join("")}</div>
      <div class="md-goals-col away">${(r.ga || []).map(g => `<div class="md-goal">${esc(g)} ⚽</div>`).join("")}</div>
    </div>` : ""}
    <div class="md-meta">
      <span>${fmt(m.utc, { weekday: "long", day: "numeric", month: "long" })}</span>
      <span>${timeStr(m.utc)} ${tzShort()}</span>
      <span>${esc(m.stadium)}</span>
      <span>${esc(m.city)}</span>
    </div>
    ${r?.xi ? `<div class="eyebrow">Starting XI</div>${xiPanel(r.xi, h, a)}` : ""}`;
  const md = $("#matchDialog"); md.dataset.mid = id; md.showModal();
}

/* ---------------- render: matches (today + full calendar) ---------------- */
let cdTimer = null, prevCd = {};
function heroBlock(heroM, isLive) {
  const h = slotInfo(heroM, "home"), a = slotInfo(heroM, "away"), r = res(heroM);
  return `<div class="hero" data-mid="${heroM.id}" role="button" tabindex="0" aria-label="Match details">
    <div class="hero-tag ${isLive ? "is-live" : ""}">
      ${isLive ? `${ballSVG("live-ball")} Live now` : `${isFavMatch(heroM) ? "Your team · " : ""}Next kickoff`}
      <span style="color:var(--ink-soft);font-weight:600">— ${esc(heroM.group ? "Group " + heroM.group : heroM.round)}</span>
      <span class="hero-actions">
        ${isLive ? `<button class="hero-refresh" data-refresh aria-label="Refresh score" title="Refresh score"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>` : ""}
        <span class="hero-go">Details ›</span>
      </span>
    </div>
    <div class="hero-teams">
      <div class="hero-side"><span class="hero-flag">${h.code ? flag(h.code) : "·"}</span><span class="hero-name">${esc(h.name)}</span></div>
      <div class="hero-mid">${isLive
        ? (r && r.h != null
          ? `<span class="hero-score">${r.h}–${r.a}</span><span class="hero-minute">${r.st === ST.HT ? "Half-time" : (clockStr(heroM, r) || "In play")}</span>`
          : `<span class="hero-score hero-pending">–</span><span class="hero-pending-note">score updating…</span>`)
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
function renderMatches() {
  const el = $("#view-matches");
  const now = new Date();
  const todayK = dayKey(now.toISOString());
  const live = S.matches.find(m => [ST.LIVE, ST.HT].includes(status(m)));
  const heroM = live || S.matches.filter(m => new Date(m.utc) > now && status(m) === ST.SCHED)
    .sort((a, b) => a.utc.localeCompare(b.utc))[0];
  const f = S.filters;
  let list = S.matches.slice().sort((a, b) => a.utc.localeCompare(b.utc));
  if (f.stage === "group") list = list.filter(m => m.stage === "group");
  if (f.stage === "ko") list = list.filter(m => m.stage !== "group");
  if (f.onlyFav) list = list.filter(isFavMatch);
  if (f.saved) list = list.filter(m => isSaved(m.id));
  const days = {};
  list.forEach(m => (days[dayKey(m.utc)] ??= []).push(m));

  el.innerHTML =
    (heroM ? heroBlock(heroM, !!live) : "") +
    `<div class="filters">
      <select class="fsel ${f.stage !== "all" ? "is-on" : ""}" id="stageSel" aria-label="Filter by stage">
        ${[["all", "All 104 matches"], ["group", "Group stage"], ["ko", "Knockouts"]].map(([k, l]) =>
          `<option value="${k}" ${f.stage === k ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      ${S.fav ? `<button class="fbtn ${f.onlyFav ? "is-on" : ""}" data-onlyfav>${esc(S.teams[S.fav].name)} only</button>` : ""}
      <button class="fbtn ${f.saved ? "is-on" : ""}" data-saved>★ Saved${S.saved.size ? ` <b>${S.saved.size}</b>` : ""}</button>
    </div>` +
    (list.length ? Object.entries(days).map(([k, ms]) =>
      `<div class="dayhead ${k === todayK ? "is-today" : ""}">${dayLabel(ms[0].utc)} <small>${ms.length} match${ms.length > 1 ? "es" : ""}${k === todayK ? " · Today" : ""}</small></div>` +
      ms.map((m, i) => matchCard(m, Math.min(i, 8))).join("")).join("")
    : `<div class="empty">Nothing matches these filters.</div>`);

  startCountdown();
  const ss = $("#stageSel", el); if (ss) ss.onchange = () => { f.stage = ss.value; renderMatches(); };
  const fb = $("[data-onlyfav]", el); if (fb) fb.onclick = () => { f.onlyFav = !f.onlyFav; renderMatches(); };
  const sb = $("[data-saved]", el); if (sb) sb.onclick = () => { f.saved = !f.saved; renderMatches(); };
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
      <p>${t.conf ? esc(t.conf) + " · " : ""}Group ${group || "—"}${t.titles ? ` · <b style="color:var(--gold)">${t.titles}×🏆</b>` : ""}${played ? ` · currently <b>${ordinal(pos)}</b> after ${played} match${played > 1 ? "es" : ""}` : ""}</p></div>
      <button class="btn ghost team-change" id="ctaChange">Change</button></div>
    ${done.length ? `<div class="eyebrow">Played</div>` + done.map((m, i) => matchCard(m, i)).join("") : ""}
    <div class="eyebrow">Fixtures</div>
    ${upcoming.length ? upcoming.map((m, i) => matchCard(m, i)).join("") : `<div class="empty">No scheduled fixtures — check the bracket for their knockout path.</div>`}
    ${group ? `<div class="eyebrow">Group ${group}</div><div class="gwrap">${groupTable(group, 0)}</div>
      <div class="legend"><span class="l1"><i></i>Top 2 advance</span><span class="l3"><i></i>3rd — possible best-8 spot</span></div>` : ""}
    ${squadSection(S.fav)}`;
}
function renderTeams() {
  const el = $("#view-teams");
  const head = S.fav
    ? myTeamBlock()
    : `<div class="pick-cta">
        <span style="font-size:42px">🏟️</span>
        <span class="big">Who are you backing?</span>
        <span style="color:var(--ink-soft);font-size:13.5px;max-width:300px">Pick a team — the site takes their colors, pins their matches and tracks their road to MetLife.</span>
        <button class="btn" id="ctaPick">Choose your team</button></div>`;
  const grid = Object.keys(S.teams)
    .sort((a, b) => S.teams[a].name.localeCompare(S.teams[b].name))
    .map(c => `<button class="teamcard ${c === S.fav ? "is-fav" : ""}" data-squad="${c}" title="${esc(S.teams[c].name)}${S.teams[c].titles ? ` — ${S.teams[c].titles}× World Cup champion` : ""}">
      <span class="fl">${flag(c)}</span><span class="tc-name">${esc(S.teams[c].name)}</span>${S.teams[c].titles ? `<span class="tc-cup" aria-label="${S.teams[c].titles} World Cup titles">🏆${S.teams[c].titles}</span>` : ""}<span class="tc-grp">${groupOf(c) || ""}</span></button>`).join("");
  el.innerHTML = head + `<div class="eyebrow">All teams <span style="color:var(--ink-soft);font-weight:600">— tap for squad</span></div><div class="teamsgrid">${grid}</div>`;
  const cta = $("#ctaPick", el); if (cta) cta.onclick = () => $("#teamDialog").showModal();
  const chg = $("#ctaChange", el); if (chg) chg.onclick = () => $("#teamDialog").showModal();
}
function rosterMarkup(sq) {
  const groups = { GK: "Goalkeepers", DF: "Defenders", MF: "Midfielders", FW: "Forwards" };
  const byPos = p => sq.players.filter(x => x.pos === p);
  return `<div class="roster">${Object.entries(groups).map(([p, label]) => {
    const ps = byPos(p);
    return ps.length ? `<div class="roster-pos"><h5>${label} <span>${ps.length}</span></h5>
      ${ps.map(x => `<div class="roster-row">
        <span class="rnum">${x.n ?? "·"}</span>
        <span class="rname">${esc(x.name.replace(" (captain)", ""))}${x.name.includes("(captain)") ? `<i class="cpt">C</i>` : ""}</span>
        ${x.club ? `<span class="rclub">${esc(x.club)}</span>` : ""}
        ${x.caps != null ? `<span class="rstat">${x.caps} caps${x.goals ? ` · ${x.goals}g` : ""}</span>` : ""}
      </div>`).join("")}</div>` : "";
  }).join("")}</div>`;
}
function squadSection(code) {
  const sq = S.squads?.[code];
  if (!sq) return `<div class="eyebrow">Squad</div><div class="empty">Squad list lands once the squads workflow runs (see README) — 16 teams are pre-loaded.</div>`;
  return `<div class="eyebrow">Squad — ${sq.players.length} players${sq.coach ? ` · Coach <b style="color:var(--ink)">&nbsp;${esc(sq.coach)}</b>` : ""}</div>
    ${rosterMarkup(sq)}`;
}
function openSquad(code) {
  const t = S.teams[code]; if (!t) return;
  const sq = S.squads?.[code];
  $("#squadTitle").innerHTML = `<span class="fl">${flag(code)}</span> ${esc(t.name)}`
    + `<span class="sq-meta">${esc(t.conf || "")}${t.titles ? ` · ${t.titles}×🏆` : ""}${sq ? ` · ${sq.players.length} players${sq.coach ? ` · ${esc(sq.coach)}` : ""}` : ""}</span>`;
  $("#squadBody").innerHTML = sq ? rosterMarkup(sq)
    : `<div class="empty">${esc(t.name)}'s squad lands once the squads workflow runs (see README). 16 teams are pre-loaded so far.</div>`;
  $("#squadDialog").showModal();
}
const ordinal = n => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/* ---------------- render: groups ---------------- */
const TABLE_COLS = `<colgroup><col class="c-name"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-gd"><col class="c-pts"></colgroup>`;
function groupTable(g, i) {
  const rows = standings(g);
  return `<div class="gtable" style="--i:${i}"><h4>Group <span>${g}</span></h4>
    <table>${TABLE_COLS}<thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>
    ${rows.map((r, idx) => `<tr class="${idx < 2 ? "q1" : idx === 2 ? "q3" : ""} ${r.code === S.fav ? "is-fav" : ""}">
      <td class="tname" title="View ${esc(S.teams[r.code].name)} squad" data-squad="${r.code}" role="button" tabindex="0"><span class="fl">${flag(r.code)}</span>${esc(S.teams[r.code].name)}</td>
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
  // champion, once the final resolves
  const finalM = S.matches.find(m => m.stage === "final");
  const fr = finalM && res(finalM);
  let champ = null;
  if (fr && fr.st === ST.FT) {
    const fh = slotInfo(finalM, "home").code, fa = slotInfo(finalM, "away").code;
    const homeWon = fr.h > fr.a || (fr.h === fr.a && (fr.hp ?? -1) > (fr.ap ?? -1));
    champ = homeWon ? fh : fa;
  }
  $("#view-bracket").innerHTML =
    (champ ? championBanner(champ) : "") +
    `<div class="bracket-scroll"><div class="bracket"><svg class="bracket-lines" aria-hidden="true"></svg>
    ${cols.map(([st, title]) => {
      const ms = S.matches.filter(m => m.stage === st).sort((a, b) => a.num - b.num);
      const decided = ms.filter(m => res(m)?.st === ST.FT).length;
      const inner = ms.map((m, i) => bMatch(m, i)).join("")
        + (st === "final" && third ? bMatch(third, 1) : "");
      return `<div class="bcol bcol-${st}">
        <div class="bcol-title">${title}<span class="bcol-count">${decided}/${ms.length}</span></div>
        <div class="bcol-matches">${inner}</div></div>`;
    }).join("")}
  </div></div>
  <p class="bracket-note">Scroll sideways → · winners flow left to right · the bracket fills itself as results land. Want to call it early? Try the <b>Predict</b> tab.</p>`;
  layoutBracket($("#view-bracket"));
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
  return slot.short || si.name;                        // group placeholder (1E, 2A, 3rd A/B/…)
}
function bMatch(m, i) {
  const h = slotInfo(m, "home"), a = slotInfo(m, "away");
  const r = res(m), st = status(m), fin = st === ST.FT && r;
  const wH = fin && (r.h > r.a || (r.h === r.a && (r.hp ?? -1) > (r.ap ?? -1)));
  const row = (s, txt, sc, w, l) => `<div class="bm-row ${w ? "is-w" : ""} ${l ? "is-l" : ""}">
    <span class="fl">${s.code ? flag(s.code) : "·"}</span>
    <span class="nm ${s.ph ? "ph" : ""}">${esc(txt)}${w && m.stage === "final" ? " 🏆" : ""}</span>
    ${sc != null ? `<span class="sc">${sc}</span>` : ""}</div>`;
  return `<div class="bm ${m.stage === "final" ? "is-final" : ""} ${m.stage === "third" ? "is-third" : ""}" style="--i:${i}" data-num="${m.num}" data-mid="${m.id}">
    ${m.stage === "third" ? `<div class="bm-tag">3rd place</div>` : ""}
    ${row(h, slotText(m, "home", h), fin ? r.h : null, wH, fin && !wH)}${row(a, slotText(m, "away", a), fin ? r.a : null, fin && !wH, wH)}
    <div class="bm-label">M${m.num} · ${fmt(m.utc, { day: "numeric", month: "short" })} ${timeStr(m.utc)} · ${esc(m.city.split(",")[0])}${[ST.LIVE, ST.HT].includes(st) ? ` · <span style="color:var(--live);font-weight:700">LIVE</span>` : ""}</div>
  </div>`;
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
    : `<div class="bracket-scroll"><div class="bracket"><svg class="bracket-lines" aria-hidden="true"></svg>
        ${cols.map(([st, title]) => {
          const inner = S.matches.filter(m => m.stage === st).sort((a, b) => a.num - b.num).map((m, i) => simMatch(m, i, alloc)).join("")
            + (st === "final" && third ? simMatch(third, 1, alloc) : "");
          return `<div class="bcol bcol-${st}"><div class="bcol-title">${title}</div><div class="bcol-matches">${inner}</div></div>`;
        }).join("")}
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
  layoutBracket(el);
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
  return `<div class="bm ${m.stage === "final" ? "is-final" : ""} ${m.stage === "third" ? "is-third" : ""}" style="--i:${i}" data-num="${m.num}">
    ${m.stage === "third" ? `<div class="bm-tag">3rd place</div>` : ""}
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
const RENDER = { matches: renderMatches, teams: renderTeams, groups: renderGroups, bracket: renderBracket, sim: renderSim };
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
  const bt = $("#buildTag"); if (bt) bt.textContent = "build " + BUILD;
}

/* ---------------- background music (off by default) ---------------- */
// The button reflects the audio's REAL paused state (not just a saved flag), so it
// can never get out of sync with what you actually hear.
function initMusic() {
  const a = $("#bgm"), btn = $("#musicChip"); if (!btn || !a) return;
  a.volume = 0.32;
  const sync = () => {
    const playing = !a.paused;
    btn.classList.toggle("is-on", playing);
    btn.setAttribute("aria-pressed", String(playing));
    btn.title = playing ? "Mute music" : "Play music";
  };
  a.addEventListener("play", sync);
  a.addEventListener("pause", sync);
  btn.onclick = () => {
    if (a.paused) { a.play().then(() => localStorage.setItem("wc26.music", "on")).catch(() => {}); }
    else { a.pause(); localStorage.setItem("wc26.music", "off"); }
  };
  // resume a previously-on preference on the first interaction (autoplay is blocked on load) —
  // but ignore a tap on the music button itself, so toggling can never fight the resume
  if (localStorage.getItem("wc26.music") === "on") {
    const resume = e => { if (!e.target.closest("#musicChip")) a.play().catch(() => {}); };
    addEventListener("pointerdown", resume, { once: true });
  }
  sync();
}

/* ---------------- data ---------------- */
async function loadStatic() {
  const [m, t] = await Promise.all([
    fetch("data/matches.json").then(r => r.json()),
    fetch("data/teams.json").then(r => r.json()),
  ]);
  S.matches = m.matches; S.teams = t;
  // squads.json is committed data that changes (squad updates) — bypass cache so it's always current
  try { S.squads = (await (await fetch("data/squads.json?t=" + Date.now(), { cache: "no-store" })).json()).squads || {}; }
  catch { S.squads = {}; }
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
async function refreshResults() {
  try {
    const r = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const txt = await r.text();
    if (txt === S._lastResults) return; // nothing changed — skip the re-render (no flicker)
    const firstLoad = S._lastResults == null;
    const prev = S.results.matches || {};
    S._lastResults = txt;
    S.results = JSON.parse(txt);
    $("#updatedLabel").textContent = S.results.updated
      ? "Scores updated " + new Intl.DateTimeFormat("en", { timeZone: tz(), hour: "2-digit", minute: "2-digit" }).format(new Date(S.results.updated))
      : "Schedule loaded";
    renderTicker();
    RENDER[S.view]();
    if (!firstLoad) celebrateGoals(prev, S.results.matches); // only after we have a baseline
  } catch { /* offline or first deploy — schedule still works */ }
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
  applyTheme(); syncTzLabels(); buildPickers(); renderTicker();
  $$("[data-nav]").forEach(b => b.onclick = e => { e.preventDefault(); nav(b.dataset.nav); });
  $("#tzChip").onclick = () => $("#tzDialog").showModal();
  $("#teamChip").onclick = () => $("#teamDialog").showModal();
  initMusic();
  $$("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
  $$("dialog").forEach(d => d.onclick = e => { if (e.target === d) d.close(); });
  addEventListener("resize", () => {
    moveInk();
    if (S.view === "bracket" || S.view === "sim") layoutBracket($("#view-" + S.view));
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    if (S.view === "bracket" || S.view === "sim") layoutBracket($("#view-" + S.view));
  });
  document.addEventListener("click", e => {
    const rf = e.target.closest("[data-refresh]");
    if (rf) { e.stopPropagation(); manualRefresh(); return; }
    const star = e.target.closest("[data-save]");
    if (star) { e.stopPropagation(); toggleSave(star.dataset.save); return; }
    const sq = e.target.closest("[data-squad]");
    if (sq && sq.dataset.squad) { openSquad(sq.dataset.squad); return; }
    const bm = e.target.closest(".bm[data-mid]");
    if (bm) { openMatch(bm.dataset.mid); return; }
    const hero = e.target.closest(".hero[data-mid]");
    if (hero) { openMatch(hero.dataset.mid); return; }
    const card = e.target.closest(".mcard");
    if (card) { openMatch(card.dataset.mid); }
  });
  // keyboard: activate focusable custom controls (save stars, squad cells, sim picks, hero) with Enter/Space
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest("[data-save],[data-squad],[data-pick],.up,.hero[data-mid]");
    if (t) { e.preventDefault(); t.click(); }
  });
  nav("matches");
  refreshResults();
  setInterval(refreshResults, 90 * 1000); // pick up fresh scores every 90s
}
boot();
})();
