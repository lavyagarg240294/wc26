#!/usr/bin/env python3
"""One-off importer: FIFA official 'SquadLists-English.pdf' -> data/squads.json.
Pulls jersey number, position, name, caps, goals, club for all 48 teams.
Preserves existing coach names; PDF carries no coach. Run from repo root:
    python3 scripts/import-squads-pdf.py /path/to/SquadLists-English.pdf
"""
import sys, re, json, warnings, logging
warnings.filterwarnings("ignore"); logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "/Users/lgarg/Downloads/SquadLists-English.pdf"

# FIFA 3-letter -> our ISO2-ish code (matches data/teams.json keys)
FIFA = {
 "ALG":"DZ","ARG":"AR","AUS":"AU","AUT":"AT","BEL":"BE","BIH":"BA","BRA":"BR","CPV":"CV",
 "CAN":"CA","COL":"CO","COD":"CD","CIV":"CI","CRO":"HR","CUW":"CW","CZE":"CZ","ECU":"EC",
 "EGY":"EG","ENG":"GB-ENG","FRA":"FR","GER":"DE","GHA":"GH","HAI":"HT","IRN":"IR","IRQ":"IQ",
 "JPN":"JP","JOR":"JO","KOR":"KR","MEX":"MX","MAR":"MA","NED":"NL","NZL":"NZ","NOR":"NO",
 "PAN":"PA","PAR":"PY","POR":"PT","QAT":"QA","KSA":"SA","SCO":"GB-SCT","SEN":"SN","RSA":"ZA",
 "ESP":"ES","SWE":"SE","SUI":"CH","TUN":"TN","TUR":"TR","URU":"UY","USA":"US","UZB":"UZ",
}
POS_OK = {"GK","DF","MF","FW"}

def title_word(w):
    # Title-case a surname token, keeping hyphens/apostrophes: AÏT-NOURI -> Aït-Nouri
    return re.sub(r"[A-Za-zÀ-ÿ]+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), w)

def fmt_name(player_name):
    """FIFA 'PLAYER NAME' is 'SURNAME Given' (surname = leading ALL-CAPS tokens)."""
    toks = player_name.split()
    i = 0
    while i < len(toks) and toks[i] == toks[i].upper() and any(c.isalpha() for c in toks[i]):
        i += 1
    surname = toks[:i] if i > 0 else toks[:1]
    given = toks[i:] if 0 < i < len(toks) else []
    sur = " ".join(title_word(w) for w in surname)
    giv = " ".join(given)
    return (giv + " " + sur).strip() if giv else sur

def clean_club(c):
    return re.sub(r"\s*\([A-Z]{3}\)\s*$", "", c or "").strip() or None

def to_int(x):
    m = re.search(r"-?\d+", x or "")
    return int(m.group(0)) if m else None

pdf = pdfplumber.open(PDF)
out_squads = {}
suspicious = []
team_names = {}

for pi, page in enumerate(pdf.pages):
    txt = page.extract_text() or ""
    fifa = None; tname = None
    for line in txt.split("\n"):
        mm = re.match(r"^(.+?)\s+\(([A-Z]{3})\)\s*$", line.strip())
        if mm:
            tname, fifa = mm.group(1), mm.group(2); break
    code = FIFA.get(fifa)
    if not code:
        print(f"  !! page {pi+1}: unmapped FIFA code {fifa} ({tname})"); continue
    team_names[code] = tname
    table = page.extract_table()
    players = []
    for row in (table or [])[1:]:
        cells = [c for c in row if c is not None]
        if len(cells) < 9: continue
        num, pos, pname = cells[0], cells[1], cells[2]
        if pos not in POS_OK: continue
        # cells layout after dropping None: #,POS,PLAYER NAME,FIRST,LAST,SHIRT,DOB,CLUB,HEIGHT,CAPS,GOALS
        club = clean_club(cells[7]) if len(cells) > 7 else None
        caps = to_int(cells[-2]); goals = to_int(cells[-1])
        name = fmt_name(pname)
        p = {"pos": pos, "name": name}
        n = to_int(num)
        if n is not None: p = {"n": n, **p}
        if caps is not None: p["caps"] = caps
        if goals is not None: p["goals"] = goals
        if club: p["club"] = club
        players.append(p)
        # quality flags: dropped ligature leaves a stray single letter or double space
        if "  " in pname or re.search(r"\b[b-df-hj-np-tv-z]\b", name, re.I):
            suspicious.append(f"{code} #{num}: '{pname}' -> '{name}'")
    out_squads[code] = {"players": players}

# merge: preserve existing coach; replace players with PDF data
try:
    prev = json.load(open("data/squads.json"))["squads"]
except Exception:
    prev = {}
for code, sq in out_squads.items():
    sq["coach"] = (prev.get(code) or {}).get("coach")

print(f"teams parsed: {len(out_squads)} / 48")
counts = {c: len(s["players"]) for c, s in out_squads.items()}
bad = {c: n for c, n in counts.items() if n < 20 or n > 30}
print("player counts out of [20,30]:", bad or "none")
print(f"suspicious names (possible ligature loss): {len(suspicious)}")
for s in suspicious[:40]: print("   ", s)

out = {"updated": None, "note": "Official FIFA squad lists (PDF import); coach preserved from prior data", "squads": out_squads}
json.dump(out, open("data/squads.json.new", "w"), ensure_ascii=False)
print("wrote data/squads.json.new")
