#!/usr/bin/env python3
"""Parse FIFA's Enhanced Football Intelligence "Post-Match Summary Report" PDFs into data/efi.json.

FIFA publishes a public (no-login) PDF per match on the FIFA Training Centre Match Report Hub. It carries
advanced data we can't get anywhere else for free: official xG, in-contest possession, phases of play, line
breaks, ball progressions, defensive pressures, and per-player physical/distance. This is POST-MATCH only.

Runs in GitHub Actions (Python 3, pdfplumber — already a dep via the squads importer). The browser only ever
reads the baked data/efi.json, so nothing here touches a visitor's page. Distance numbers on the physical pages
use a custom private-use font (U+E071..E07A = 0..9, U+E094 = '.') which we decode and sanity-check (per-player
total must sum to the published team total, else we drop the distances rather than show garbage).

  python3 scripts/fetch-efi.py            # scrape the hub, parse every played match, write data/efi.json
  python3 scripts/fetch-efi.py --file X   # parse one local PDF and print the result (no write) — for testing
"""
import re, json, sys, os, unicodedata, urllib.request, subprocess, warnings, logging
warnings.filterwarnings("ignore"); logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

# FIFA splits the hub in two: the original page carries the 72 group-stage reports, and knockout reports live on a
# SEPARATE sibling page (…-knockout-stage.php) — scrape both, or the knockouts silently never appear.
HUBS = ["https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php",
        "https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub-knockout-stage.php"]
BASE = "https://www.fifatrainingcentre.com"
UA = "Mozilla/5.0 (compatible; wc26-bot/1.0; +https://github.com/lavyagarg240294/wc26)"

teams = json.load(open("data/teams.json"))
fixtures = json.load(open("data/matches.json"))["matches"]
results = json.load(open("data/results.json")).get("matches", {}) if os.path.exists("data/results.json") else {}
by_id = {f["id"]: f for f in fixtures}

def deb(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower().strip()
# team display name -> our code (e.g. "Brazil" -> "BR"), with the aliases FIFA's reports use
ALIAS = {"korea republic": "KR", "south korea": "KR", "ir iran": "IR", "iran": "IR", "usa": "US",
         "united states": "US", "england": "GB-ENG", "scotland": "GB-SCT", "turkiye": "TR", "türkiye": "TR",
         "czechia": "CZ", "cote d'ivoire": "CI", "ivory coast": "CI", "cabo verde": "CV", "cape verde": "CV",
         "bosnia and herzegovina": "BA", "curacao": "CW", "dr congo": "CD", "congo dr": "CD"}
NAME2CODE = {deb(t["name"]): c for c, t in teams.items()}
NAME2CODE.update(ALIAS)
def code_of(name):
    d = deb(name)
    return NAME2CODE.get(d) or next((c for n, c in NAME2CODE.items() if n and (n in d or d in n)), None)

def match_num(hc, ac):
    for f in fixtures:
        h, a = (f.get("home") or {}).get("team"), (f.get("away") or {}).get("team")
        if {h, a} == {hc, ac} and h and a:
            return f["num"]
    # knockout fixtures carry no fixed teams in matches.json - resolve the pair from played results instead.
    # (Safe while no knockout repeats a group pairing; the group loop above wins if one ever did.)
    for mid, r in results.items():
        if {r.get("ht"), r.get("at")} == {hc, ac} and by_id.get(mid):
            return by_id[mid]["num"]
    return None

# decode the custom private-use digit font used on the physical/distance pages
def dec(s):
    return "".join(str(ord(c) - 0xE071) if 0xE071 <= ord(c) <= 0xE07A else ("." if ord(c) == 0xE094 else c) for c in s)

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40).read()

# scrape both hub pages for the per-match PDF links, keyed by the report's match number (M01..M104)
def hub_links():
    out = {}
    for hub in HUBS:
        try:
            html = fetch(hub).decode("utf-8", "ignore")
        except Exception as e:
            print(f"  hub unreachable ({hub.rsplit('/', 1)[-1]}): {e}")
            continue
        for href in re.findall(r'href="([^"]*PMSR[^"]*\.pdf)"', html, re.I):
            m = re.search(r'PMSR[ -]M0*(\d+)', href, re.I)
            if m:
                url = href if href.startswith("http") else BASE + href
                out[int(m.group(1))] = url.replace(" ", "%20")
    return out

# --- FIFA data-hub enrichment: official per-player MINUTES (and a distance fallback) as plain JSON ---------------
# The PMSR physical table has no minutes-played column, but FIFA's public data hub (fdh-api.fifa.com) does:
# TimePlayed, in minutes INCLUDING stoppage, keyed by the calendar's Properties.IdIFES. Join to the PDF rows by
# shirt number via the v3 live lineup (IdPlayer -> ShirtNumber). If a side's PDF distance page failed the sum
# check (rows dropped), rebuild that side entirely from fdh TotalDistance instead - same tracking data, no font.
CAL = "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&language=en&count=104"
def _json(url):
    return json.loads(fetch(url).decode("utf-8", "ignore"))
try:
    _cal = {int(x["MatchNumber"]): x for x in _json(CAL).get("Results", []) if x.get("MatchNumber") and x.get("IdStage")}
except Exception as e:
    print(f"  calendar unreachable (minutes enrichment off): {e}")
    _cal = {}

def enrich_minutes(fifa_num, d):
    c = _cal.get(fifa_num)
    ifes = (c or {}).get("Properties", {}).get("IdIFES")
    if not ifes:
        return
    live = _json(f"https://api.fifa.com/api/v3/live/football/17/285023/{c['IdStage']}/{c['IdMatch']}?language=en")
    fdh = _json(f"https://fdh-api.fifa.com/v1/stats/match/{ifes}/players.json")
    stats = {pid: {t[0]: t[1] for t in v if isinstance(t, list) and len(t) >= 2} for pid, v in fdh.items()}
    # GUARD: the PDF page->side assignment matches page sums against team totals, and when the totals are near-equal
    # (e.g. 108.6 v 108.3 km) it can SWAP the sides - which would also hang the wrong team's minutes on every shirt
    # number below. The live lineup knows each side's real names: score the overlap, swap the rows if they're crossed.
    def _names(team):
        return {deb(((p.get("PlayerName") or [{}])[0].get("Description") or "")) for p in ((team or {}).get("Players") or [])}
    def _hits(rows, names):
        return sum(1 for r in rows if any(len(t) >= 3 and any(t in n for n in names) for t in deb(r["name"]).split()))
    hn, an = _names(live.get("HomeTeam")), _names(live.get("AwayTeam"))
    ph, pa = d["players"]["home"], d["players"]["away"]
    if ph and pa and (_hits(ph, an) + _hits(pa, hn)) > (_hits(ph, hn) + _hits(pa, an)):
        d["players"]["home"], d["players"]["away"] = pa, ph
    for side, team in (("home", live.get("HomeTeam")), ("away", live.get("AwayTeam"))):
        rows = {p["n"]: p for p in d["players"][side]}
        built = []
        for pl in ((team or {}).get("Players") or []):
            st = stats.get(str(pl.get("IdPlayer"))) or {}
            tp, td, shirt = st.get("TimePlayed"), st.get("TotalDistance"), pl.get("ShirtNumber")
            spd, spr = st.get("TopSpeed"), st.get("Sprints")   # km/h, and count — per player, per match
            if not tp or not td or shirt is None:
                continue                                  # unused sub (no time on pitch) or no tracking row
            r = rows.get(int(shirt))
            if r:
                r["min"] = round(tp)
                if spd:
                    r["spd"] = round(spd, 1)
                if spr is not None:
                    r["spr"] = round(spr)
            else:
                nm = ((pl.get("PlayerName") or [{}])[0].get("Description") or "").strip()
                if nm:
                    built.append({"n": int(shirt), "name": nm.title(), "km": round(td / 1000, 2), "min": round(tp),
                                  "spd": round(spd, 1) if spd else None, "spr": round(spr) if spr is not None else None})
        if built and not d["players"][side]:
            d["players"][side] = sorted(built, key=lambda x: -x["km"])

def parse_pdf(path):
    pdf = pdfplumber.open(path)
    pg = lambda i: (pdf.pages[i].extract_text() or "") if i < len(pdf.pages) else ""
    p1, p3, p4 = pg(0), pg(2), pg(3)
    hdr = re.search(r"^(.+?)\s+\d+\s*-\s*\d+\s+(.+?)\s*$", re.sub(r"\s+", " ", p1.split("|")[0] if "|" in p1 else p1.split("\n")[0]))
    if not hdr:
        return None
    home, away = hdr.group(1).strip(), hdr.group(2).strip()
    hc, ac = code_of(home), code_of(away)
    num = match_num(hc, ac) if hc and ac else None
    def pair(rx, t=p3, f=float):
        m = re.search(rx, t); return [f(m.group(1)), f(m.group(2))] if m else None
    poss = re.search(r"Total\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+Total", p3)
    d = {
        "home": hc, "away": ac, "homeName": home, "awayName": away,
        "xg": pair(r"([\d.]+)\s+xG \(Expected Goals\)\s+([\d.]+)"),
        "poss": [float(poss.group(1)), float(poss.group(3))] if poss else None,
        "possContest": float(poss.group(2)) if poss else None,
        "shots": (lambda m: [int(m.group(i)) for i in (1, 2, 3, 4)] if m else None)(re.search(r"(\d+) \((\d+)\) Attempts at Goal \(On Target\) (\d+) \((\d+)\)", p3)),
        "lineBreaks": pair(r"(\d+)\s+Completed Line Breaks\s+(\d+)", f=int),
        "ballProg": pair(r"(\d+)\s+Ball Progressions\s+(\d+)", f=int),
        "pressures": pair(r"(\d+) \(\d+\) Defensive Pressures Applied \(Direct Pressures\) (\d+)", f=int),
        "distance": pair(r"([\d.]+) km Total Distance Covered\s+([\d.]+) km"),
    }
    # phases of play (page 4): "<home>% <label> <away>%"
    pin, pout = {}, {}
    section = pin
    for line in p4.split("\n"):
        if re.search(r"OUT OF POSSESSION", line, re.I): section = pout
        m = re.match(r"\s*(\d+)% ([A-Za-z][A-Za-z /-]+?) (\d+)%\s*$", line)
        if m: section[m.group(2).strip()] = [int(m.group(1)), int(m.group(3))]
    d["phasesIn"], d["phasesOut"] = pin, pout
    # per-player distance (custom-font decoded, in metres). FIFA's PMSR page count VARIES per match, so rather
    # than hardcoding page indices we SCAN every page for the per-player table and assign, to each side, the page
    # whose decoded rows sum to that team's published Total Distance Covered (within 1 km). This both locates the
    # right pages and sanity-checks the font decode in one step — a page summing to garbage is never accepted.
    row_rx = re.compile(r"\s*(\d+)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\- ]+?)\s+(\d{4,5}\.\d)\b")
    def rows_on(i):
        out = []
        for line in dec(pg(i)).split("\n"):
            m = row_rx.match(line)
            if m:
                out.append({"n": int(m.group(1)), "name": m.group(2).strip().title(), "km": round(float(m.group(3)) / 1000, 2)})
        return out
    players = {"home": [], "away": []}
    if d["distance"]:
        cands = []                                    # (page_index, rows, sum_km) for any page that looks like a distance table
        for i in range(len(pdf.pages)):
            r = rows_on(i)
            if len(r) >= 7:                           # a real per-player table has ~11-18 outfield+sub rows
                cands.append((i, r, sum(x["km"] for x in r)))
        used = set()
        for i, side in ((0, "home"), (1, "away")):
            target = d["distance"][i]
            # accept the closest per-player page whose decoded distances sum near the published team total. A flat 1 km
            # was too strict - a single mis-decoded digit shifts the sum a few km, so ~23 matches lost one team entirely.
            # Allow ~4% of the total (min 2.5 km): tolerant of a stray decode, still nowhere near a garbage page.
            best, best_diff = None, max(2.5, target * 0.04)
            for (pi, r, tot) in cands:
                if pi in used:
                    continue
                if abs(tot - target) < best_diff:
                    best_diff, best = abs(tot - target), (pi, r)
            if best:
                players[side] = best[1]
                used.add(best[0])
    d["players"] = players
    return num, d

def main():
    if "--file" in sys.argv:
        r = parse_pdf(sys.argv[sys.argv.index("--file") + 1])
        if r and "--fifanum" in sys.argv:                 # test the minutes enrichment too: --fifanum <FIFA match number>
            enrich_minutes(int(sys.argv[sys.argv.index("--fifanum") + 1]), r[1])
        print(json.dumps({"num": r[0], **r[1]} if r else None, indent=2, ensure_ascii=False)); return
    out = json.load(open("data/efi.json"))["matches"] if os.path.exists("data/efi.json") else {}
    links = hub_links()
    print(f"hub: {len(links)} report links")
    for n, url in sorted(links.items()):
        try:
            open("/tmp/_efi.pdf", "wb").write(fetch(url))
            r = parse_pdf("/tmp/_efi.pdf")
            if r and r[0]:
                try:
                    enrich_minutes(n, r[1])               # best-effort: km-only rows are still fine without minutes
                except Exception as e:
                    print(f"  M{n:03} minutes skipped: {e}")
                out[str(r[0])] = r[1]
                mins = sum(1 for s in ("home", "away") for p in r[1]["players"][s] if p.get("min"))
                print(f"  M{n:03} -> match {r[0]}: {r[1]['homeName']} v {r[1]['awayName']} (xg={r[1]['xg']}, players={len(r[1]['players']['home'])+len(r[1]['players']['away'])}, mins={mins})")
        except Exception as e:
            print(f"  M{n:03} skipped: {e}")
    json.dump({"updated": None, "matches": out}, open("data/efi.json", "w"), ensure_ascii=False)
    print(f"wrote data/efi.json ({len(out)} matches)")

main()
