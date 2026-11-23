// Lasting av statiske data: lineup, Vinmonopol-produkt, historikk og personar.

export const DATA = "../data";

async function getJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

export async function tryJson(url) {
  try {
    return await getJson(url);
  } catch {
    return null;
  }
}

export const loadLineup = (year) => tryJson(`${DATA}/lineup/${year}.json`);
export const loadProduct = (id) => tryJson(`${DATA}/products/${id}.json`);

export async function loadPeople() {
  const people = (await tryJson(`${DATA}/people.json`)) ?? [];
  const alias = new Map();
  for (const p of people) {
    alias.set(p.name, p.name);
    for (const a of p.aliases ?? []) alias.set(a, p.name);
  }
  return { people, canon: (n) => alias.get(n) ?? n };
}

/** Alle tidlegare år, med kanoniske personnamn. */
export async function loadHistory(beforeYear) {
  const index = await tryJson(`${DATA}/history/index.json`);
  const { canon } = await loadPeople();
  const years = (index?.years ?? []).filter((y) => !beforeYear || y < beforeYear);
  const all = await Promise.all(years.map((y) => tryJson(`${DATA}/history/${y}.json`)));
  return all.filter(Boolean).map((d) => ({
    ...d,
    participants: d.participants.map(canon),
    beers: d.beers.map((b) => ({
      ...b,
      scores: Object.fromEntries(Object.entries(b.scores).map(([p, v]) => [canon(p), v])),
    })),
  }));
}

export function imageUrl(beer) {
  return beer.image ? `${DATA}/${beer.image}` : null;
}

// ---------- Matching mot tidlegare år ----------

const STOP = new Set([
  "bryggeri", "bryggeriet", "brygghus", "brewing", "brewery", "brew", "co", "as", "og", "&",
  "fellesbryggeri", "ølkompani", "handbryggeri", "håndbryggeri", "bryggeri/hausnesbrogg",
  "edition", "boks", "flaske",
]);

/** Normaliserer eit ølnamn til eit sett med ord, utan år, prosent og fyllord. */
export function beerKey(name) {
  return [
    ...new Set(
      String(name)
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/[-–,.!?'"´`:;]/g, " ")
        .split(/\s+/)
        .filter((w) => w && !STOP.has(w))
    ),
  ]
    .sort()
    .join(" ");
}

/** Finn same øl i tidlegare år (likt varenummer eller same namn etter normalisering). */
export function findPrevious(beer, history) {
  const keys = new Set([beerKey(beer.name), ...(beer.historyNames ?? []).map(beerKey)]);
  if (beer.brewery && beer.beerName) keys.add(beerKey(`${beer.brewery} ${beer.beerName}`));
  const hits = [];
  for (const y of history) {
    for (const b of y.beers) {
      const same =
        (beer.vinmonopoletId && b.vinmonopoletId === beer.vinmonopoletId) || keys.has(beerKey(b.name));
      if (same) hits.push({ year: y.year, average: b.average, name: b.name, scores: b.scores });
    }
  }
  return hits.sort((a, b) => a.year - b.year);
}
