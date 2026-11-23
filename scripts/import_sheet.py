"""Importer historikken frå Google-reknearket til JSON (éi fil per år).

Bruk:
    python3 scripts/import_sheet.py                 # lastar ned reknearket og importerer
    python3 scripts/import_sheet.py sti/til/fil.xlsx

Skriv til data/history/<år>.json og data/people.json.
Krev openpyxl (sjå scripts/requirements.txt).
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import openpyxl

SHEET_ID = "1f4ibk-_5ixHYr_A9UsmWkZIof-7jf0mF9sHsMsfle30"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "history"

# Etikett i reknearket -> kategori-id
CATEGORIES = {
    "tissepauser": "toilet",
    "nytt-bad-pause": "toilet",
    "søling": "spill",
    "fising/hikking/gupling": "fart",
    "generell idioti": "idiocy",
    "krenking": "offence",
    "puls": "pulse",
    "røyk": "smoke",
}
CATEGORY_LABELS = {
    "toilet": "Dobesøk",
    "spill": "Søling",
    "fart": "Fising/hikking/gupling",
    "idiocy": "Generell idioti",
    "offence": "Krenking",
    "pulse": "Puls",
    "smoke": "Røyk",
}

BEER_HEADERS = ("bryggerinamn", "øl")
META_HEADERS = {"klokkeslett", "b/p?", "produkt", "untappd"}
END_HEADERS = {"snittkarakter", "zum"}
SOURCE_CODES = {"p": "pol", "pol": "pol", "b": "butikk", "h": "heimebrygg"}

# Namn som står ulikt i ulike år, men er same person.
ALIASES = {
    "Brita Karoline": "Brita",
}


def norm(v) -> str:
    return str(v).strip().lower() if v is not None else ""


def fmt_time(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, (dt.time, dt.datetime)):
        return v.strftime("%H:%M")
    m = re.match(r"^\s*(\d{1,2})[.:](\d{2})\s*$", str(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def parse_beer_name(raw: str) -> dict:
    """Plukk ut bryggeri, ølnamn, prosent og kjelde (B/P/H) der det går."""
    name = " ".join(raw.split())
    source = None
    m = re.search(r"\s*\((B|P|H|POL)\)\s*$", name, re.I)
    if m:
        source = SOURCE_CODES.get(m.group(1).lower())
        name = name[: m.start()].strip()

    abv = None
    pct = list(re.finditer(r"\(+\s*(\d+(?:[.,]\d+)?)\s*%?\s*\)", name))
    if pct:
        abv = float(pct[-1].group(1).replace(",", "."))

    brewery = beer = None
    parts = re.split(r"\s+-\s+", name, maxsplit=1)
    if len(parts) == 2 and parts[0] and parts[1]:
        brewery = parts[0].strip()
        beer = re.sub(r"\s*\(+[^()]*%?\)\s*$", "", parts[1]).strip() or None

    if source is None and re.search(r"hausnesbrogg|heimebrygg|frå jarle", name, re.I):
        source = "heimebrygg"
    return {"name": name, "brewery": brewery, "beer": beer, "abv": abv, "source": source}


def vmp_id(url: str | None) -> str | None:
    if url and "vinmonopolet.no" in url:
        m = re.search(r"/p/(\d+)", url)
        return m.group(1) if m else None
    return None


def import_year(ws) -> dict:
    year = int(ws.title)
    rows = list(ws.iter_rows())

    # Finn overskriftsrada
    header_idx = beer_col = None
    for i, row in enumerate(rows):
        for c in row:
            if norm(c.value).startswith(BEER_HEADERS[0]) or norm(c.value) == BEER_HEADERS[1]:
                header_idx, beer_col = i, c.column
                break
        if header_idx is not None:
            break
    if header_idx is None:
        raise ValueError(f"Fann ikkje overskriftsrad i fana {ws.title}")

    header = {c.column: c.value for c in rows[header_idx] if c.value is not None}
    end_col = min((col for col, v in header.items() if norm(v) in END_HEADERS), default=None)
    meta = {norm(v): col for col, v in header.items() if norm(v) in META_HEADERS}
    people_cols = {
        col: str(v).strip()
        for col, v in header.items()
        if col > beer_col
        and norm(v) not in META_HEADERS
        and (end_col is None or col < end_col)
    }
    comment_from = (end_col or max(people_cols) + 1) + 1 if people_cols else beer_col + 1

    participants = list(people_cols.values())
    categories: dict[str, dict[str, float]] = {}
    notes: list[str] = []

    def take_category(row, label_col):
        label = norm(row[label_col - 1].value)
        cat = CATEGORIES[label]
        vals = {}
        for col, person in people_cols.items():
            v = num(row[col - 1].value) if col - 1 < len(row) else None
            if v is not None:
                vals[person] = v
        if vals:
            categories.setdefault(cat, {}).update(vals)
        # Fritekst i kategoriradene (t.d. «Svein knuste alle med ei puta») – men ikkje
        # «beste øl»-lister, der teksten blir følgd av eit tal.
        cells = list(row)
        for j, c in enumerate(cells):
            if c.column <= max(people_cols, default=0) or not isinstance(c.value, str):
                continue
            nxt = cells[j + 1].value if j + 1 < len(cells) else None
            if c.value.strip() and num(nxt) is None and norm(c.value) not in CATEGORIES:
                notes.append(c.value.strip())

    # Kategoriar over overskrifta
    for row in rows[:header_idx]:
        for c in row[:3]:
            if norm(c.value) in CATEGORIES:
                take_category(row, c.column)
                break

    beers: list[dict] = []
    planned: list[dict] = []
    in_planned = False
    for row in rows[header_idx + 1 :]:
        if len(row) < beer_col:
            continue
        # Kategoriar som ligg laust under tabellen (t.d. «Røyk 3» i 2015) blir notat
        for j, c in enumerate(row):
            if c.column != beer_col and norm(c.value) in CATEGORIES:
                nxt = row[j + 1].value if j + 1 < len(row) else None
                notes.append(f"{str(c.value).strip()}: {nxt:g}" if num(nxt) is not None else str(c.value).strip())
        cell = row[beer_col - 1]
        raw = cell.value
        if not isinstance(raw, str) or not raw.strip() or raw.strip().startswith("#"):
            continue
        if norm(raw) in CATEGORIES:
            take_category(row, beer_col)
            continue
        if norm(raw).startswith("øl som skal smakast"):
            in_planned = True
            continue

        def link(header_name):
            col = meta.get(header_name)
            if col and col - 1 < len(row) and row[col - 1].hyperlink:
                return row[col - 1].hyperlink.target
            return None

        product_url = link("produkt")
        untappd_url = link("untappd")

        if in_planned:
            planned.append({**parse_beer_name(raw), "vinmonopoletId": vmp_id(product_url)})
            continue

        scores = {}
        for col, person in people_cols.items():
            v = row[col - 1].value if col - 1 < len(row) else None
            n = num(v)
            if n is not None:
                scores[person] = n
            elif isinstance(v, str) and v.strip().lower() == "n/a":
                scores[person] = None  # var med, men smakte ikkje
        time = fmt_time(row[meta["klokkeslett"] - 1].value) if "klokkeslett" in meta else None

        if not any(v is not None for v in scores.values()):
            if time is None and not any(raw.strip() == b["name"] for b in beers):
                notes.append(raw.strip())
            continue

        info = parse_beer_name(raw)
        if vmp_id(product_url) and info["source"] is None:
            info["source"] = "pol"
        if "b/p?" in meta:
            code = norm(row[meta["b/p?"] - 1].value)
            info["source"] = SOURCE_CODES.get(code, info["source"])

        comments = [
            str(c.value).strip()
            for c in row
            if c.column >= comment_from and isinstance(c.value, str) and c.value.strip()
        ]
        given = [v for v in scores.values() if v is not None]
        beers.append(
            {
                "order": len(beers) + 1,
                **info,
                "time": time,
                "vinmonopoletId": vmp_id(product_url),
                "untappdUrl": untappd_url,
                "scores": scores,
                "average": round(sum(given) / len(given), 4),
                "comments": comments,
            }
        )

    out = {
        "year": year,
        "participants": participants,
        "categories": {
            k: {"label": CATEGORY_LABELS[k], "counts": v} for k, v in categories.items()
        },
        "beers": beers,
        "notes": notes,
    }
    if planned:
        out["planned"] = planned
    return out


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
        path = Path(tempfile.mkdtemp()) / "joleol.xlsx"
        print(f"Lastar ned reknearket til {path} …")
        urllib.request.urlretrieve(url, path)

    wb = openpyxl.load_workbook(path, data_only=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    people: dict[str, dict] = {}
    years: list[int] = []
    for ws in wb.worksheets:
        if not ws.title.isdigit():
            continue
        data = import_year(ws)
        (OUT_DIR / f"{data['year']}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        if data["beers"]:
            years.append(data["year"])
        for p in data["participants"]:
            canon = ALIASES.get(p, p)
            entry = people.setdefault(canon, {"name": canon, "aliases": [], "years": []})
            if p != canon and p not in entry["aliases"]:
                entry["aliases"].append(p)
            if data["beers"]:  # 2026 er førebudd, men ikkje gjennomført enno
                entry["years"].append(data["year"])
        print(
            f"{data['year']}: {len(data['beers']):2} øl, {len(data['participants']):2} deltakarar, "
            f"kategoriar: {', '.join(data['categories']) or '–'}"
        )

    for e in people.values():
        e["years"].sort()
    ordered = sorted(people.values(), key=lambda e: (-len(e["years"]), e["name"]))
    (ROOT / "data" / "people.json").write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{len(ordered)} personar skrivne til data/people.json")
    (OUT_DIR / "index.json").write_text(
        json.dumps({"years": sorted(years)}, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
