# Joleølsmaking

Data og verktøy for den årlege joleølsmakinga (sidan 2013).

## Struktur

```
data/
  history/<år>.json        Alle smakingar, éi fil per år (importert frå Google-reknearket)
  people.json              Alle deltakarar, med år dei har vore med (og ev. alias)
  lineup/<år>.json         Øla som skal smakast i år (varenummer frå Vinmonopolet)
  products/<varenr>.json   Produktinfo henta frå Vinmonopolet
  products/images/         Produktbilete frå Vinmonopolet
scripts/
  import_sheet.py          Reknearket -> data/history
  vinmonopolet.mjs         Hentar produktinfo og bilete frå Vinmonopolet
```

## Importere historikken på nytt

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/import_sheet.py              # lastar ned reknearket sjølv
.venv/bin/python scripts/import_sheet.py fil.xlsx     # eller frå ei lokal fil
```

## Vinmonopolet (gjer dette FØR smakekvelden – lokalet har ikkje nett)

```sh
node scripts/vinmonopolet.mjs search julefred         # finn varenummer
node scripts/vinmonopolet.mjs lineup 2026             # hent alt i data/lineup/2026.json
node scripts/vinmonopolet.mjs fetch 9520801 --force   # hent eitt produkt på nytt
```

Manglar Vinmonopolet bilete av eit produkt, kan du leggje inn eit eige som `data/products/images/<varenr>.own.jpg` og køyre skriptet på nytt med `--force`. Eit eige bilete blir alltid brukt framfor Vinmonopolet sitt.

Krev Node 18 eller nyare. Skriptet brukar dei same uoffisielle endepunkta som vinmonopolet.no, så det kan slutte å verke om dei endrar nettsida.

## Dataformat (`data/history/<år>.json`)

- `participants`: namna slik dei står i reknearket. `people.json` slår saman alias (t.d. «Brita Karoline» → «Brita»).
- `beers[]`: `name` (rå), `brewery`/`beer`/`abv` (tolka der det går), `source` (`pol`/`butikk`/`heimebrygg`/`null`), `time`, `scores` (`null` = var med, men smakte ikkje), `average`, `comments`, `vinmonopoletId`, `untappdUrl`.
- `categories`: `toilet`, `spill`, `fart`, `idiocy`, `offence`, `pulse` – teljing per person.
- `notes`: frie kommentarar som ikkje høyrer til eit bestemt øl.

Merk: I 2013 blei det gitt heile tal, og Ægir Ylir fekk 6 av nokon.
