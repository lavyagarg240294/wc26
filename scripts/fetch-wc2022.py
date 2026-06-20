#!/usr/bin/env python3
"""Build data/wc2022.json — the LAST World Cup (Qatar 2022) as a reference for the "Then & Now" views:
each team's finish + full squad (player names), so the app can show, per 2026 team, who is CONTINUING from
2022 and who is NEW. Matches + goalscorers are layered on by a later pass.

Source: Wikipedia (authoritative, static — 2022 won't change). Squads come from the "2022 FIFA World Cup squads"
article wikitext (the {{nat fs g player|name=[[…]]}} templates); finishes are the well-known final classification.
One-off / re-runnable:  python3 scripts/fetch-wc2022.py
"""
import re, json, urllib.request

UA = "Mozilla/5.0 (compatible; wc26-bot/1.0; +https://github.com/lavyagarg240294/wc26)"
WIKI = "https://en.wikipedia.org/w/api.php?action=parse&page=%s&prop=wikitext&format=json&formatversion=2"

# 2022 team (Wikipedia section name) -> our team code (data/teams.json keys). 6 of these (WLS/PL/DK/RS/CM/CR) did
# not qualify for 2026; they're still recorded so the landscape can show "didn't return".
NAME2CODE = {
    "Ecuador": "EC", "Netherlands": "NL", "Qatar": "QA", "Senegal": "SN", "England": "GB-ENG", "Iran": "IR",
    "United States": "US", "Wales": "GB-WLS", "Argentina": "AR", "Mexico": "MX", "Poland": "PL", "Saudi Arabia": "SA",
    "Australia": "AU", "Denmark": "DK", "France": "FR", "Tunisia": "TN", "Costa Rica": "CR", "Germany": "DE",
    "Japan": "JP", "Spain": "ES", "Belgium": "BE", "Canada": "CA", "Croatia": "HR", "Morocco": "MA", "Brazil": "BR",
    "Cameroon": "CM", "Serbia": "RS", "Switzerland": "CH", "Ghana": "GH", "Portugal": "PT", "South Korea": "KR",
    "Uruguay": "UY",
}
# final classification at Qatar 2022 (tier: 1 champions … 7 group stage) — for the per-team "2022 finish" chip
FINISH = {
    "AR": ("Champions", 1), "FR": ("Runners-up", 2), "HR": ("Third place", 3), "MA": ("Fourth place", 4),
    "NL": ("Quarter-finals", 5), "GB-ENG": ("Quarter-finals", 5), "BR": ("Quarter-finals", 5), "PT": ("Quarter-finals", 5),
    "US": ("Round of 16", 6), "AU": ("Round of 16", 6), "JP": ("Round of 16", 6), "KR": ("Round of 16", 6),
    "CH": ("Round of 16", 6), "SN": ("Round of 16", 6), "PL": ("Round of 16", 6), "ES": ("Round of 16", 6),
    "QA": ("Group stage", 7), "EC": ("Group stage", 7), "GB-WLS": ("Group stage", 7), "IR": ("Group stage", 7),
    "SA": ("Group stage", 7), "MX": ("Group stage", 7), "DK": ("Group stage", 7), "TN": ("Group stage", 7),
    "CR": ("Group stage", 7), "DE": ("Group stage", 7), "BE": ("Group stage", 7), "CA": ("Group stage", 7),
    "CM": ("Group stage", 7), "RS": ("Group stage", 7), "GH": ("Group stage", 7), "UY": ("Group stage", 7),
}

def fetch_wikitext(page):
    url = WIKI % page
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=40).read())["parse"]["wikitext"]

def parse_squads():
    wt = fetch_wikitext("2022_FIFA_World_Cup_squads").split("==Statistics==")[0]
    parts = re.split(r"^===\s*(.+?)\s*===\s*$", wt, flags=re.M)
    namerx = re.compile(r"name=\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")
    out = {}
    for i in range(1, len(parts), 2):
        code = NAME2CODE.get(parts[i].strip())
        if not code:
            continue
        names = [m.group(1).strip() for m in namerx.finditer(parts[i + 1])]
        if names:
            out[code] = names
    return out

def main():
    squads = parse_squads()
    teams = {}
    for code, (finish, tier) in FINISH.items():
        teams[code] = {"finish": finish, "tier": tier, "squad": squads.get(code, [])}
    bad = [c for c, t in teams.items() if not (23 <= len(t["squad"]) <= 26)]
    out = {
        "source": "Wikipedia: 2022 FIFA World Cup squads + final classification",
        "host": "Qatar", "year": 2022, "teamCount": 32,
        "teams": teams, "matches": [],
    }
    json.dump(out, open("data/wc2022.json", "w"), ensure_ascii=False)
    print(f"wrote data/wc2022.json — {len(teams)} teams, squads parsed: {sum(1 for t in teams.values() if t['squad'])}")
    print("squad-count outliers:", bad or "none (all 23-26)")

main()
