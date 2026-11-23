# Joleølsmaking

Data og verktøy for den årlege joleølsmakinga (sidan 2013).

## Smakekvelden

```sh
node server.mjs        # eller: npm start
```

1. Opne <http://localhost:8026/app/operator.html> på PC-en som styrer showet. Første gong blir kvelden oppretta frå `data/lineup/<år>.json`.
2. Trykk **📺 Opne storskjerm**, dra vindauget over på TV-en og dobbeltklikk for fullskjerm. Trykk 🔇 øvst i hjørnet ein gong for å slå på lyd.
3. Vel eit øl og trykk **▶**. Då blir ølet sjekka inn med klokkeslett, og storskjermen viser bilete og info frå Vinmonopolet. Klokkeslettet kan rettast på registreringssida. Skriv inn karakterane (`3,75`, `375` eller `35`). Dei dukkar opp på storskjermen med ein gong, og når alle har karakter eller `n/a` (var ikkje med / avstår), kjem oppsummeringa automatisk. **📊 Vis oppsummering no** viser ho før alle har stemt.
   - Går du vidare før alle har stemt, tel ølet med likevel. Du kan gå tilbake (▶ på ølet) og fylle inn karakterane seinare, til dømes når nokon kjem tilbake.
4. Hendingar registrerer du med klikk i tabellen, eller med hurtigtastar: `d` dobesøk, `s` søling, `f` fis/hikk, `i` idioti, `k` krenking, og deretter persontalet. Høgreklikk trekkjer frå.
5. Sitat blir knytte til ølet som er i gang, men du kan velje eit anna øl i lista ved sida av.
6. **🕰️ Tidslinje** viser alle øla i rekkjefølgja dei vart sjekka inn, med snitt, sitat og hendingar. Ho blar sjølv vidare kvart 12. sekund og passar fint i pausar og på slutten av kvelden.
7. Til slutt: **🏆 Kåring** og ◀ ▶ for å bla gjennom kåringane.

Alt blir lagra fortløpande i `data/events/<år>.json`, med tryggleikskopiar i `data/events/backups/` kvart minutt. Serveren lyttar berre på `localhost`, og ingenting krev internett. Lagringa toler at nettlesaren blir lukka eller at serveren blir starta på nytt.

### Slette testdata

```sh
npm run nullstill
```

Slettar `data/events/`, altså kvelden og alle tryggleikskopiane. Lukk registreringssida og storskjermen først, elles kan den opne registreringssida lagre testkvelden på nytt. Neste gong registreringssida blir opna, lagar ho ein ny og tom kveld frå lineup-fila. Hugs å køyre kommandoen etter den siste testrunden, før den ekte kvelden.

## Struktur

```
server.mjs                 Lokal server (ingen avhengigheiter)
app/                       Registrering (operator.html) og storskjerm (tv.html)
data/
  events/<år>.json         Kvelden i år, blir skriven av appen
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
