/**
 * Writes data/buzz.json for the WC·26 "Pulse" tab: fan reactions (Reddit match threads) + press headlines (RSS).
 * Runs in GitHub Actions, Node 20+, no deps. The browser NEVER calls these APIs — it only reads the baked JSON,
 * so no keys are exposed and there's nothing to track.
 *
 * Reddit: unauthenticated reddit.com/*.json by default. Reddit increasingly returns 403 to datacenter IPs
 * (including GitHub Actions); if that happens, reactions are simply skipped and the tab runs on headlines alone.
 * Set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (a free Reddit "script" app, no user login) to use the reliable
 * OAuth path instead — the only change needed to make reactions dependable.
 *
 * Headlines: WC-specific RSS (Guardian + BBC) + ESPN soccer, filtered to World-Cup / participating-team content.
 *
 * Moderation: top-scored comments only, length-bounded, markdown/links stripped, a profanity denylist, and NO
 * usernames (avoid PII / harassment). Every reaction and headline links out to its source.
 *
 * Output: { updated, matches: { "<matchId>": { heat:0-100, reactions:[{text,score,src,url}] } }, headlines:[…] }
 * Run:    node scripts/fetch-buzz.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const fixtures = JSON.parse(readFileSync("data/matches.json", "utf8")).matches;
const byId = Object.fromEntries(fixtures.map(f => [f.id, f]));
const teams = JSON.parse(readFileSync("data/teams.json", "utf8"));
const UA = "Mozilla/5.0 (compatible; wc26-bot/1.0; +https://github.com/lavyagarg240294/wc26)";
const now = Date.now();

// team code → lowercased names for spotting a team in a thread title / headline (+ aliases the feeds actually use)
const ALIAS = {
  US: ["usa", "united states"], KR: ["south korea", "korea republic", "korea"], "GB-ENG": ["england"],
  "GB-SCT": ["scotland"], NL: ["netherlands", "holland"], CD: ["dr congo", "congo"], CI: ["ivory coast", "côte d'ivoire"],
  CV: ["cape verde", "cabo verde"], BA: ["bosnia", "bosnia and herzegovina"], CW: ["curaçao", "curacao"], IR: ["iran"], ZA: ["south africa"],
};
const nameOf = {};
for (const [code, t] of Object.entries(teams)) nameOf[code] = [t.name.toLowerCase(), ...(ALIAS[code] || [])];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function codesIn(text) {
  const s = String(text || "");
  return Object.keys(teams).filter(c => nameOf[c].some(n => new RegExp("\\b" + esc(n) + "\\b", "i").test(s)));
}

// drop a comment that trips the profanity / slur denylist (kept small + word-bounded to avoid false positives)
const BLOCK = /\b(f+u+c+k\w*|shit\w*|bitch\w*|cunt\w*|asshole|a-?hole|nigg\w*|fagg?\w*|retard\w*|whore|slut|dick(?:head)?|wank\w*)\b/i;
const clean = s => String(s || "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#0?39;|&rsquo;|&apos;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // markdown links → their text
  .replace(/<[^>]+>/g, "")                     // any stray tags
  .replace(/[*_~`>#]/g, "")                    // markdown emphasis / quote / heading marks
  .replace(/https?:\/\/\S+/g, "")              // raw URLs
  .replace(/\s+/g, " ").trim();
// a comment is shown only if it's substantial, civil and self-contained
function okComment(text, score) {
  if (!text || score < 25) return false;
  if (text.length < 25 || text.length > 280) return false;
  if (BLOCK.test(text)) return false;
  if (/^(http|www\.|\/?r\/|\/?u\/|edit:|deleted|removed|\[)/i.test(text)) return false;
  if ((text.match(/[A-Z]/g) || []).length > text.length * 0.5) return false;   // SHOUTY / mostly-caps
  return true;
}

/* ---------------- Reddit (fan reactions) ---------------- */
async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID, sec = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !sec) return null;
  try {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(id + ":" + sec).toString("base64"), "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    return r.ok ? ((await r.json()).access_token || null) : null;
  } catch { return null; }
}
async function rget(path, token) {
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const r = await fetch(base + path, { headers: { "User-Agent": UA, Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  if (!r.ok) throw new Error("reddit HTTP " + r.status);
  return r.json();
}
async function fetchReactions() {
  const token = await redditToken();
  console.log(token ? "reddit: OAuth" : "reddit: unauthenticated (may be rate-limited / 403 from datacenter IPs)");
  const search = await rget("/r/soccer/search.json?q=" + encodeURIComponent('"Match Thread"') + "&restrict_sr=1&sort=new&limit=100&t=week", token);
  const posts = (search.data?.children || []).map(c => c.data).filter(p => /match thread/i.test(p.link_flair_text || p.title));
  const out = {};
  let calls = 0;
  for (const m of fixtures) {
    const hc = m.home?.team, ac = m.away?.team;
    if (!hc || !ac || out[m.id]) continue;
    const ko = +new Date(m.utc);
    if (ko > now + 3 * 3600e3 || ko < now - 4 * 86400e3) continue;   // only matches around now (last 4 days … next 3h)
    const cand = posts
      .filter(p => { const c = codesIn(p.title); return c.includes(hc) && c.includes(ac) && Math.abs(p.created_utc * 1000 - ko) < 36 * 3600e3; })
      .sort((a, b) => (/post/i.test(b.link_flair_text || b.title) ? 1 : 0) - (/post/i.test(a.link_flair_text || a.title) ? 1 : 0) || b.num_comments - a.num_comments);
    const post = cand[0];
    if (!post || calls >= 12) continue;   // cap thread fetches per run (unauth rate limits)
    calls++;
    let thread;
    try { thread = await rget(`/r/soccer/comments/${post.id}.json?sort=top&limit=40`, token); } catch { continue; }
    const reactions = (thread[1]?.data?.children || []).map(c => c.data).filter(c => c && c.body)
      .map(c => ({ text: clean(c.body), score: c.score || 0 }))
      .filter(c => okComment(c.text, c.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(c => ({ text: c.text, score: c.score, src: "r/soccer", url: "https://www.reddit.com" + post.permalink }));
    if (reactions.length) out[m.id] = { heat: Math.min(100, Math.round(18 + Math.log2(1 + post.num_comments) * 9)), reactions };
  }
  return out;
}

/* ---------------- RSS (press headlines) ---------------- */
const FEEDS = [
  ["The Guardian", "https://www.theguardian.com/football/world-cup-2026/rss", true],
  ["BBC Sport", "https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml", true],
  ["ESPN", "https://www.espn.com/espn/rss/soccer/news", false],   // general soccer → keep only WC / team items
];
function parseRSS(xml, src, wcFeed) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map(m => m[0]).flatMap(it => {
    const title = clean(it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = (it.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
    if (!title || !link || !/^https?:/.test(link)) return [];
    const codes = codesIn(title);
    if (!wcFeed && !/world cup|wc[\s-]?2026/i.test(title) && !codes.length) return [];
    return [{ title, src, url: link, ...(codes.length === 1 ? { team: codes[0] } : {}) }];
  });
}
async function fetchHeadlines() {
  const bySrc = [];
  for (const [src, url, wcFeed] of FEEDS) {
    try { bySrc.push(parseRSS(await (await fetch(url, { headers: { "User-Agent": UA } })).text(), src, wcFeed).slice(0, 8)); }
    catch (e) { console.log("rss skipped", src, e.message); bySrc.push([]); }
  }
  const out = [], seen = new Set();   // round-robin the outlets so no single one dominates the list
  for (let i = 0; i < 8; i++) for (const list of bySrc) {
    const h = list[i]; if (!h) continue;
    const k = h.title.toLowerCase(); if (seen.has(k)) continue;
    seen.add(k); out.push(h);
  }
  return out.slice(0, 15);
}

/* ---------------- Phase 3: derived signals ---------------- */
// trending teams: which sides are most mentioned right now (headline titles + the teams of buzzing matches)
function computeTrending(headlines, matches) {
  const count = {};
  const bump = (c, n) => { if (c && teams[c]) count[c] = (count[c] || 0) + n; };
  for (const h of headlines) for (const c of codesIn(h.title)) bump(c, 1);
  for (const [id, d] of Object.entries(matches)) {
    const m = byId[id]; if (!m) continue;
    bump(m.home?.team, 1 + Math.round((d.heat || 0) / 35));
    bump(m.away?.team, 1 + Math.round((d.heat || 0) / 35));
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, n]) => ({ code, n }));
}
// storylines: a tiny LLM pass that synthesises the headlines (+ any reactions) into a few talking points.
// Gated on ANTHROPIC_API_KEY — skipped (and the tab is fine without it) when the secret isn't set.
async function fetchStorylines(headlines, matches) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !headlines.length) return [];
  const reactions = Object.values(matches).flatMap(d => d.reactions.map(r => r.text)).slice(0, 15);
  const material = "Headlines:\n" + headlines.map(h => "- " + h.title).join("\n")
    + (reactions.length ? "\n\nFan comments:\n" + reactions.map(r => "- " + r).join("\n") : "");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 350,
        messages: [{ role: "user", content: `These are today's FIFA World Cup 2026 headlines${reactions.length ? " and fan comments" : ""}. Write the 3 biggest storylines as punchy, neutral, one-sentence talking points a fan would care about. One per line, no numbering, no preamble, no markdown.\n\n${material}` }],
      }),
    });
    if (!r.ok) { console.log("storylines: anthropic HTTP " + r.status); return []; }
    const txt = (await r.json()).content?.[0]?.text || "";
    return txt.split("\n").map(l => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(l => l.length > 12).slice(0, 3);
  } catch (e) { console.log("storylines skipped:", e.message); return []; }
}

/* ---------------- main ---------------- */
const matches = await fetchReactions().catch(e => { console.log("reactions skipped:", e.message); return {}; });
const headlines = await fetchHeadlines().catch(e => { console.log("headlines skipped:", e.message); return []; });
const trending = computeTrending(headlines, matches);
const storylines = await fetchStorylines(headlines, matches);
const buzz = { updated: new Date().toISOString(), storylines, trending, matches, headlines };
console.log(`buzz: ${Object.keys(matches).length} match(es) w/reactions, ${headlines.length} headline(s), ${trending.length} trending, ${storylines.length} storyline(s)`);
if (DRY) console.log(JSON.stringify(buzz, null, 2).slice(0, 2200));
else { writeFileSync("data/buzz.json", JSON.stringify(buzz)); console.log("wrote data/buzz.json"); }
