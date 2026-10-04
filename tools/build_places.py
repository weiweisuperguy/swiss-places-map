#!/usr/bin/env python3
"""Convert a Notion view-query dump of the "Places" database into places.json.

Usage: python3 tools/build_places.py <notion_view_dump.json> [places.json]

The dump is the JSON returned by the Notion MCP query-data-sources tool in
view mode (an object with a "results" list of rows).
"""
import json
import re
import sys

P = {
    "type": "Type · 種類",
    "region": "Region · 地域",
    "effort": "Effort · 難易度",
    "crowds": "Crowds · 混雑度",
    "highlights": "Highlights · 見どころ",
    "headsup": "Heads-up · 注意",
    "season": "Best season · ベストシーズン",
    "open_until": "date:Open until · 今季の運行終了:start",
    "from_brugg": "From Brugg · ブルックから (min)",
    "distance": "Distance · 距離 (km)",
    "ascent": "Ascent · 登り (m)",
    "walking": "Walking · 歩行 (h)",
    "summary_en": "Summary (EN)",
    "summary_ja": "概要 (JA)",
    "lat": "place:Location · 場所:latitude",
    "lon": "place:Location · 場所:longitude",
    "place": "place:Location · 場所:name",
    "route": "Route · ルート",
    "top": "⭐ Top pick · イチオシ",
}

MD_LINK = re.compile(r"\[([^\]]+)\]\((?:[^)]+)\)")


def clean(text):
    """Strip Markdown links and Notion's backslash escapes from plain text."""
    if not text:
        return ""
    text = MD_LINK.sub(r"\1", text)
    return re.sub(r"\\([~:*_`\[\]<>|{}^$])", r"\1", text).strip()


def label(value):
    """Split an option like '🥾 Hike · ハイキング' into emoji / en / ja parts."""
    if not value:
        return None
    emoji = ""
    head, _, ja = value.partition(" · ")
    m = re.match(r"^(\S+)\s+(.*)$", head)
    if m and not re.search(r"[A-Za-z0-9]", m.group(1)):
        emoji, head = m.group(1), m.group(2)
    return {"key": value, "emoji": emoji, "en": head.strip(), "ja": ja.strip() or head.strip()}


def labels(raw):
    if not raw:
        return []
    items = json.loads(raw) if isinstance(raw, str) else raw
    return [label(v) for v in items if v]


def split_name(name):
    en, _, ja = name.partition(" · ")
    return en.strip(), (ja or en).strip()


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "places.json"
    raw = open(src, encoding="utf-8").read()
    rows = json.loads(raw[raw.find("{"):])["results"]
    places = []
    for r in rows:
        if r.get(P["lat"]) is None or r.get(P["lon"]) is None:
            continue
        page_id = r["url"].rstrip("/").split("/")[-1].split("?")[0]
        name_en, name_ja = split_name(r["Name"])
        places.append({
            "id": page_id,
            "name_en": name_en,
            "name_ja": name_ja,
            "url": f"https://www.notion.so/{page_id}",
            "lat": r[P["lat"]],
            "lon": r[P["lon"]],
            "type": label(r.get(P["type"])),
            "region": label(r.get(P["region"])),
            "effort": label(r.get(P["effort"])),
            "crowds": label(r.get(P["crowds"])),
            "highlights": labels(r.get(P["highlights"])),
            "headsup": labels(r.get(P["headsup"])),
            "season": labels(r.get(P["season"])),
            "open_until": r.get(P["open_until"]),
            "from_brugg": r.get(P["from_brugg"]),
            "distance": r.get(P["distance"]),
            "ascent": r.get(P["ascent"]),
            "walking": r.get(P["walking"]),
            "summary_en": clean(r.get(P["summary_en"])),
            "summary_ja": clean(r.get(P["summary_ja"])),
            "route": r.get(P["route"]),
            "top": r.get(P["top"]) == "__YES__",
        })
    places.sort(key=lambda p: (p["from_brugg"] is None, p["from_brugg"] or 0))
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"places": places}, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(places)} places to {out}")


if __name__ == "__main__":
    main()
