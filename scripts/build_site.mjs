#!/usr/bin/env node
/**
 * Lagar docs/data.json til oppsummeringssida (GitHub Pages) frå data/history og data/people.json.
 *
 *   node scripts/build_site.mjs        # eller: npm run side
 *
 * Sida i docs/ les berre data.json, så ho fungerer sjølv om Pages publiserer frå /docs.
 */
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));

const { years } = await read("data/history/index.json");
const people = await read("data/people.json");
const alias = new Map(people.flatMap((p) => p.aliases.map((a) => [a, p.name])));
const canon = (n) => alias.get(n) ?? n;

// ---------- Normalisering av bryggeri og ølnamn ----------
const BREWERIES = [
  [/^(ægir|ylir\b|årgangsylir)/i, "Ægir"],
  [/^7\s*-?\s*fjell/i, "7 Fjell"],
  [/^(aass|aas|ass)\b/i, "Aass"],
  [/^kinn/i, "Kinn"],
  [/^nøgne/i, "Nøgne Ø"],
  [/^hansa/i, "Hansa"],
  [/^voss/i, "Voss"],
  [/^mack/i, "Mack"],
  [/^haandbryggeriet/i, "Haandbryggeriet"],
  [/hausnesbrogg/i, "Hausnesbrogg & Mjøstølen"],
  [/^mjøstølen/i, "Mjøstølen"],
  [/^amundsen/i, "Amundsen"],
  [/^(krecher|kercher)/i, "Kercher"],
  [/^lervig/i, "Lervig"],
  [/^berentsen/i, "Berentsen"],
  [/^jac?k?obsen/i, "Jacobsen"],
  [/samuel smith|sam smith|^winter welcome/i, "Samuel Smith"],
  [/^lindheim/i, "Lindheim"],
  [/^eik ?& ?tid/i, "Eik & Tid"],
  [/^oslo brewing/i, "Oslo Brewing"],
  [/^grevens/i, "Grevens"],
  [/^borg/i, "Borg"],
  [/^ringnes/i, "Ringnes"],
  [/^salikatt/i, "Salikatt"],
  [/^bådin/i, "Bådin"],
  [/^monkey brew/i, "Monkey Brew"],
  [/^rygr/i, "Rygr"],
  [/^brulandselva/i, "Brulandselva"],
  [/^cb\b/i, "CB"],
  [/^delerium/i, "Delirium"],
  [/^færder/i, "Færder"],
  [/^fredrikstad/i, "Fredrikstad"],
  [/^lysefjorden/i, "Lysefjorden"],
  [/^balder/i, "Balder"],
  [/^schou/i, "Schous"],
  [/^lade gaard/i, "Lade Gaard"],
  [/^midt?fyn/i, "Midtfyns"],
  [/^grans/i, "Grans"],
  [/^to øl/i, "To Øl"],
  [/^tuborg/i, "Tuborg"],
  [/^dahl/i, "Dahls"],
  [/^austmann/i, "Austmann"],
  [/^jåttå/i, "Jåttå"],
  [/^st\.? bernad?r?us/i, "St. Bernardus"],
  [/^mikkeller/i, "Mikkeller"],
  [/^santa clausthaler/i, "Clausthaler"],
];
const breweryOf = (b) => {
  for (const [re, name] of BREWERIES) if (re.test(b.name)) return name;
  return b.brewery ? b.brewery.replace(/\s+(bryggeri|brygghus|brewing)$/i, "").trim() : null;
};

const BEER_SYNONYMS = [
  [/jola ?gåva|jolegåva/, "jolagåva"],
  [/golden ?naked.*/, "golden naked"],
  [/winter welcome.*/, "winter welcome"],
  [/7 sortert? christmas ale/, "7 sorter christmas ale"],
  [/môdrahit/, "mødrahit"],
  [/ju?e?quad/, "julequad"],
  [/^-/, ""],
  [/\b(boks|flaske)\b/, ""],
  [/rød jul.*/, "rød jul"],
  [/^juleale$/, "jule ale"],
];
function beerKey(b, brewery) {
  let s = (b.beer ?? b.name).toLowerCase();
  if (!b.beer && brewery) {
    // 2013–2017: "Kinn Julefred" → "julefred"
    s = s.replace(/^(ægir|7\s*-?\s*fjell|aass|aas|ass|kinn|nøgne ø?|hansa|voss( felles)?(bryggeri)?|mack|haandbryggeriet|berentsen|jac?k?obsen|borg|grevens|fredrikstad|cb|delerium|lysefjorden|balder( brygg)?|schous-kjelleren|lade gaards)\s*/i, "");
  }
  s = s.replace(/\(.*?\)/g, "").replace(/\b20\d\d\b/g, "").replace(/[,.]/g, " ");
  for (const [re, to] of BEER_SYNONYMS) s = s.replace(re, to);
  s = s.replace(/\s+/g, " ").trim();
  if (brewery === "Ægir" && /ylir/.test(s) && !/årgang/.test(s)) s = "ylir";
  if (/^juleøl sterk/.test(s)) s = "juleøl sterk";
  return `${brewery ?? "?"}|${s}`;
}
const prettyKey = (k) => {
  const [br, beer] = k.split("|");
  const t = beer.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return `${br} ${t}`;
};

const stripAbv = (s) => s.replace(/\s*\(+[\d.,]+%?\)*\s*$/, "").trim();
const displayName = (b, brewery) => {
  if (!b.beer || !brewery) return stripAbv(b.name);
  const beer = stripAbv(b.name.slice(b.name.indexOf(" - ") + 3)).replace(/^-/, "");
  return `${brewery} – ${beer.charAt(0).toUpperCase()}${beer.slice(1)}`;
};
const isHome = (b) => b.source === "heimebrygg" || /hausnesbrogg|mjøstølen|frå jarle|knuts juleknask|jolagodt/i.test(b.name);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0;
};
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const toMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return (h < 12 ? h + 24 : h) * 60 + m; // etter midnatt tel som same kveld
};
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let n = 0, dx = 0, dy = 0;
  xs.forEach((x, i) => {
    n += (x - mx) * (ys[i] - my);
    dx += (x - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  });
  return dx && dy ? n / Math.sqrt(dx * dy) : null;
}

// ---------- Les alle år ----------
const beers = [];
const yearRows = [];
const events = {}; // kategori -> år -> person -> tal
const catLabels = {};

for (const y of years) {
  const j = await read(`data/history/${y}.json`);
  const parts = j.participants.map(canon);
  const yb = j.beers.map((b) => {
    const brewery = breweryOf(b);
    const scores = Object.fromEntries(
      Object.entries(b.scores).filter(([, s]) => typeof s === "number").map(([p, s]) => [canon(p), s])
    );
    const vals = Object.values(scores);
    return {
      y,
      order: b.order,
      name: displayName(b, brewery),
      brewery,
      key: beerKey(b, brewery),
      abv: b.abv,
      avg: r3(b.average ?? mean(vals)),
      sd: r3(sd(vals)),
      n: vals.length,
      home: isHome(b),
      time: b.time,
      scores,
    };
  });
  beers.push(...yb);

  for (const [k, c] of Object.entries(j.categories ?? {})) {
    catLabels[k] = c.label;
    events[k] ??= {};
    events[k][y] = Object.fromEntries(Object.entries(c.counts).map(([p, v]) => [canon(p), Number(v) || 0]));
  }

  const times = yb.map((b) => toMin(b.time)).filter((t) => t != null);
  const sorted = [...yb].filter((b) => b.avg != null).sort((a, b) => b.avg - a.avg);
  yearRows.push({
    year: y,
    participants: parts,
    nBeers: yb.length,
    avg: r3(mean(yb.map((b) => b.avg).filter((a) => a != null))),
    start: times.length ? Math.min(...times) : null,
    end: times.length ? Math.max(...times) : null,
    top: sorted.slice(0, 3).map((b) => ({ name: b.name, avg: b.avg })),
    bottom: sorted.at(-1) && { name: sorted.at(-1).name, avg: sorted.at(-1).avg },
    homeCount: yb.filter((b) => b.home).length,
  });
}

// ---------- Personar ----------
const personStats = people.map((p) => {
  const mine = beers.filter((b) => b.scores[p.name] != null);
  const diffs = [], xs = [], ys = [];
  let fav = null, worst = null;
  for (const b of mine) {
    const s = b.scores[p.name];
    const others = Object.entries(b.scores).filter(([q]) => q !== p.name).map(([, v]) => v);
    if (others.length) {
      const om = mean(others);
      diffs.push(s - om);
      xs.push(s);
      ys.push(om);
    }
    if (!fav || s > fav.s || (s === fav.s && b.avg > fav.avg)) fav = { s, name: b.name, y: b.y, avg: b.avg };
    if (!worst || s < worst.s || (s === worst.s && b.avg < worst.avg)) worst = { s, name: b.name, y: b.y, avg: b.avg };
  }
  const ev = {};
  for (const [k, byYear] of Object.entries(events))
    ev[k] = Object.values(byYear).reduce((a, m) => a + (m[p.name] ?? 0), 0);
  const home = mine.filter((b) => b.home).map((b) => b.scores[p.name]);
  return {
    name: p.name,
    years: p.years,
    nScores: mine.length,
    mean: r3(mean(mine.map((b) => b.scores[p.name]))),
    bias: r3(mean(diffs)),
    corr: xs.length >= 15 ? r3(pearson(xs, ys)) : null,
    homeMean: home.length >= 3 ? r3(mean(home)) : null,
    fav,
    worst,
    events: ev,
  };
});

// ---------- Gjengangarar ----------
const byKey = {};
for (const b of beers) (byKey[b.key] ??= []).push(b);
const recurring = Object.entries(byKey)
  .map(([k, list]) => {
    const perYear = {};
    for (const b of list) (perYear[b.y] ??= []).push(b.avg);
    return {
      key: k,
      label: prettyKey(k),
      points: Object.entries(perYear).map(([y, a]) => ({ y: +y, avg: r3(mean(a)) })),
    };
  })
  .filter((r) => r.points.length >= 3)
  .sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label));

// ---------- Bryggeri ----------
const byBrew = {};
for (const b of beers) if (b.brewery) (byBrew[b.brewery] ??= []).push(b);
const breweries = Object.entries(byBrew)
  .map(([name, list]) => {
    const best = [...list].sort((a, b) => b.avg - a.avg)[0];
    return {
      name,
      n: list.length,
      years: new Set(list.map((b) => b.y)).size,
      avg: r3(mean(list.map((b) => b.avg))),
      best: { name: best.name, y: best.y, avg: best.avg },
    };
  })
  .sort((a, b) => b.n - a.n);

// ---------- Sitat (handplukka – rådata inneheld mykje som ikkje passar på ei offentleg side) ----------
const QUOTES = [
  [2013, null, "Neste år skal me faen meg eta pinnakjøt mens me drikk."],
  [2013, 11, "Bør retestast på jolaftan."],
  [2013, 4, "Mest mandig flaske."],
  [2014, 8, "«Kva er det me drikk på eigentleg?»"],
  [2014, 15, "Veldig rik i munnholo."],
  [2015, 7, "Kommunist-øl."],
  [2015, 11, "Nesten alle trekte for mangel på jul."],
  [2016, 1, "Smakte som Tyggis extra sabel."],
  [2016, 3, "Nellik er jul."],
  [2016, 15, "Dagens høgaste applaus."],
  [2017, 10, "Lukta kattemat. Men eg vil ha meir.", "Lars"],
  [2017, 20, "Spektakulært, i ein annan dimensjon.", "Lars"],
  [2017, 24, "Lars gløymde å stemme. Fekk snittet."],
  [2018, 17, "Kva veg tørkar ein seg?"],
  [2018, 11, "Den kom seg.", "Knut Marius"],
  [2019, 1, "Skal aldri meir til Danmark. Alt er drepe i kjeften.", "Jo Bjørnar"],
  [2019, 3, "Håkon gir Sørlandschips mild og fyldig paprika 5!"],
  [2019, 13, "Julebruskongen slår gjennom."],
  [2020, 6, "Pepperkake utan alkohol!"],
  [2020, 8, "Flott boks!"],
  [2021, 4, "Tjuktflytande greier. Kva er dette? Sirup?"],
  [2021, 9, "Vaniljen var veldig inspirerande."],
  [2021, 15, "Kebabpause."],
  [2022, 1, "Ikkje som originalen, men betre enn kopien."],
  [2022, 4, "Halvor har skjerpa seg sidan 2019."],
  [2022, 17, "Her var lukta betre enn smaken."],
  [2022, 15, "Det er 0,05 i glaset, dette klarar me!"],
  [2023, 1, "«Det var ikkje det verste.»", "Kjartan"],
  [2023, 12, "Pølsefest! Vanskelegare kork."],
  [2023, 15, "Eg veit ikkje kva eg drikk på lenger.", "Jo Bjørnar"],
  [2024, 1, "«Han vaks på meg.»", "Rannveig"],
  [2024, null, "Skulesystemet suger. (kl. 00:01)"],
  [2024, 16, "Pølsa sprakk."],
  [2025, 7, "God heimabrygg, dårleg jolabrygg."],
  [2025, 11, "Mamma har aldri hatt mykje sukker i saftene sine.", "Rannveig"],
];
const quotes = QUOTES.map(([y, order, text, who]) => ({
  y,
  text,
  who: who ?? null,
  beer: order ? beers.find((b) => b.y === y && b.order === order)?.name ?? null : null,
}));

// ---------- Lineup for neste kveld (eiga side: docs/lineup.html) ----------
const STOP = new Set(["bryggeri", "brewery", "brewing", "company", "og", "and", "&", "ba"]);
const tokens = (s) =>
  new Set(
    String(s ?? "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/\b(19|20)\d\d\b/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
  );
const sameSet = (a, b) => a.size > 0 && a.size === b.size && [...a].every((t) => b.has(t));

async function buildLineup(year) {
  const l = await read(`data/lineup/${year}.json`);
  const imgDir = path.join(ROOT, "docs", "lineup-img");
  await rm(imgDir, { recursive: true, force: true });
  await mkdir(imgDir, { recursive: true });
  const items = [];
  for (const entry of l.beers) {
    let it;
    if (entry.vinmonopoletId) {
      const p = await read(`data/products/${entry.vinmonopoletId}.json`);
      it = {
        id: p.id,
        name: p.name,
        producer: p.producer,
        country: p.country,
        district: p.district,
        style: p.style,
        abv: p.abv,
        volumeCl: p.volumeCl,
        price: p.price,
        smell: p.smell,
        taste: p.taste,
        characteristics: p.characteristics,
        url: p.url,
        image: p.image,
        home: false,
      };
    } else {
      it = {
        id: entry.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-"),
        name: entry.name,
        producer: entry.brewery,
        style: entry.style,
        abv: entry.abv,
        description: entry.description,
        url: entry.untappdUrl ?? null,
        image: entry.image,
        home: entry.source === "heimebrygg",
      };
    }
    if (it.image) {
      it.photo = it.home || it.image.includes(".own."); // eige mobilbilete, ikkje produktbilete på kvit bakgrunn
      const ext = path.extname(it.image);
      const file = `${it.id.replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")}${ext}`; // ASCII-filnamn for GitHub Pages
      await copyFile(path.join(ROOT, "data", it.image), path.join(imgDir, file));
      it.image = `lineup-img/${file}`;
    }
    // Har me smakt dette før? Same bryggeri og same ølnamn (utan årstal).
    const brewery = breweryOf({ name: it.name, brewery: it.producer });
    const nameTok = tokens(it.name);
    for (const t of tokens(brewery)) nameTok.delete(t);
    for (const t of tokens(it.producer)) nameTok.delete(t);
    const prev = beers.filter((b) => {
      if (entry.historyNames?.some((h) => b.name && h.toLowerCase().includes((b.name.split(" – ")[1] ?? "").toLowerCase()) && b.brewery === brewery)) return true;
      if (b.brewery !== brewery) return false;
      const bt = tokens(b.name.includes(" – ") ? b.name.split(" – ")[1] : b.name);
      for (const t of tokens(brewery)) bt.delete(t);
      return sameSet(bt, nameTok);
    });
    it.history = prev.map((b) => ({ y: b.y, avg: b.avg, name: b.name }));
    const fromBrewery = beers.filter((b) => b.brewery === brewery);
    it.brewery = brewery;
    it.breweryRecord = fromBrewery.length ? { n: fromBrewery.length, avg: r3(mean(fromBrewery.map((b) => b.avg))) } : null;
    items.push(it);
  }
  return { year: l.year, participants: l.participants, beers: items };
}

await mkdir(path.join(ROOT, "docs"), { recursive: true });
let lineupNext = null;
const nextYear = years.at(-1) + 1;
try {
  const lineup = await buildLineup(nextYear);
  await writeFile(path.join(ROOT, "docs", "lineup.json"), JSON.stringify(lineup));
  lineupNext = { year: lineup.year, nBeers: lineup.beers.length, nPeople: lineup.participants.length };
  console.log(`docs/lineup.json: ${lineup.beers.length} øl, ${lineup.beers.filter((b) => b.history.length).length} smakt før`);
  for (const b of lineup.beers.filter((b) => b.history.length))
    console.log(`  ${b.name} ← ${b.history.map((h) => `${h.y} ${h.name} (${h.avg})`).join("; ")}`);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  years: yearRows,
  catLabels,
  events,
  beers: beers.map(({ key, ...b }) => b),
  people: personStats.sort((a, b) => b.years.length - a.years.length || b.nScores - a.nScores),
  recurring,
  breweries,
  quotes,
  lineupNext,
};
await writeFile(path.join(ROOT, "docs", "data.json"), JSON.stringify(out));
console.log(
  `docs/data.json: ${yearRows.length} år, ${beers.length} øl, ${recurring.length} gjengangarar, ${breweries.length} bryggeri`
);
