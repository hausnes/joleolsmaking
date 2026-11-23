// Utrekningar på kveldens tilstand. Alt er reine funksjonar.

export const CATEGORIES = [
  { id: "toilet", label: "Dobesøk", icon: "🚽", key: "d" },
  { id: "spill", label: "Søling", icon: "💦", key: "s" },
  { id: "fart", label: "Fising/hikking/gupling", short: "Fis/hikk", icon: "💨", key: "f" },
  { id: "idiocy", label: "Generell idioti", short: "Idioti", icon: "🤪", key: "i" },
  { id: "offence", label: "Krenking", icon: "😤", key: "k" },
];
export const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? "–" : n.toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function givenScores(beer) {
  return Object.entries(beer.scores ?? {}).filter(([, v]) => typeof v === "number");
}

export function beerAverage(beer) {
  return avg(givenScores(beer).map(([, v]) => v));
}

/** Øl som er avslørte (ferdige) – det er desse som tel i statistikken. */
export const doneBeers = (state) => state.beers.filter((b) => b.status === "done");

export function ranking(state) {
  return doneBeers(state)
    .map((b) => ({ beer: b, average: beerAverage(b) }))
    .filter((r) => r.average != null)
    .sort((a, b) => b.average - a.average);
}

/** Per person: snitt, tal på karakterar, gjennomsnittleg avvik (signert og absolutt). */
export function personStats(state, beers = doneBeers(state)) {
  const out = {};
  for (const p of state.participants) out[p] = { person: p, scores: [], diffs: [] };
  for (const b of beers) {
    const a = beerAverage(b);
    for (const [p, v] of givenScores(b)) {
      if (!out[p]) out[p] = { person: p, scores: [], diffs: [] };
      out[p].scores.push(v);
      if (a != null) out[p].diffs.push(v - a);
    }
  }
  return Object.values(out).map((s) => ({
    person: s.person,
    n: s.scores.length,
    average: avg(s.scores),
    deviation: avg(s.diffs),
    contrarian: avg(s.diffs.map(Math.abs)),
  }));
}

export function counts(state, type) {
  const c = Object.fromEntries(state.participants.map((p) => [p, 0]));
  for (const i of state.incidents) if (i.type === type) c[i.person] = (c[i.person] ?? 0) + 1;
  return c;
}

/** Den som avvik mest frå snittet på eitt bestemt øl. */
export function beerOutliers(beer) {
  const a = beerAverage(beer);
  const s = givenScores(beer);
  if (a == null || s.length < 2) return null;
  const sorted = [...s].sort((x, y) => x[1] - y[1]);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const contrarian = [...s].sort((x, y) => Math.abs(y[1] - a) - Math.abs(x[1] - a))[0];
  return { average: a, lowest, highest, contrarian, spread: highest[1] - lowest[1] };
}

/** Snitt per øl i rekkjefølgja dei vart smakte – «blir me snillare utover kvelden?» */
export function trend(state) {
  return doneBeers(state)
    .slice()
    .sort((a, b) => (a.revealedAt ?? 0) - (b.revealedAt ?? 0))
    .map((b) => ({ beer: b, average: beerAverage(b) }))
    .filter((r) => r.average != null);
}

function winners(entries, pick, { min = true, filter = () => true } = {}) {
  const valid = entries.filter((e) => pick(e) != null && filter(e));
  if (!valid.length) return null;
  const best = (min ? Math.min : Math.max)(...valid.map(pick));
  return { value: best, who: valid.filter((e) => Math.abs(pick(e) - best) < 1e-9) };
}

/** Kåringane på slutten av kvelden. Kvar kåring: { title, subtitle, icon, names[], value, unit } */
export function awards(state) {
  const list = [];
  const rank = ranking(state);
  const ps = personStats(state).filter((p) => p.n > 0);

  if (rank.length) {
    const top = rank[0].average;
    list.push({
      icon: "🏆",
      title: `Årets joleøl ${state.year}`,
      names: rank.filter((r) => r.average === top).map((r) => r.beer.name),
      value: `Snitt ${fmt(top)}`,
      beers: rank.filter((r) => r.average === top).map((r) => r.beer),
    });
    const bottom = rank[rank.length - 1].average;
    list.push({
      icon: "🪣",
      title: "Botnskrapet",
      subtitle: "Kveldens lågaste snitt",
      names: rank.filter((r) => r.average === bottom).map((r) => r.beer.name),
      value: `Snitt ${fmt(bottom)}`,
      beers: rank.filter((r) => r.average === bottom).map((r) => r.beer),
    });
    const priced = rank.filter((r) => r.beer.litrePrice);
    const value = winners(priced, (r) => r.average / r.beer.litrePrice, { min: false });
    if (value)
      list.push({
        icon: "💰",
        title: "Mest for pengane",
        subtitle: "Høgast snitt per krone (literpris)",
        names: value.who.map((r) => r.beer.name),
        value: value.who.map((r) => `${fmt(r.average)} for ${fmt(r.beer.litrePrice, 0)} kr/l`).join(", "),
        beers: value.who.map((r) => r.beer),
      });
  }

  const add = (icon, title, subtitle, res, valueFmt) => {
    if (res) list.push({ icon, title, subtitle, names: res.who.map((e) => e.person), value: valueFmt(res.value) });
  };
  add("😇", "Snillast", "Høgast personleg snitt", winners(ps, (p) => p.average, { min: false }), (v) => `Snitt ${fmt(v)}`);
  add("🧊", "Strengast", "Lågast personleg snitt", winners(ps, (p) => p.average), (v) => `Snitt ${fmt(v)}`);
  add("🦄", "Kveldens kontrære", "Størst gjennomsnittleg avvik frå snittet", winners(ps, (p) => p.contrarian, { min: false }), (v) => `± ${fmt(v)}`);
  add("🐑", "Flokkdyret", "Minst avvik – alltid einig med gjengen", winners(ps, (p) => p.contrarian), (v) => `± ${fmt(v)}`);

  const countAward = (type, icon, title, subtitle) => {
    const c = Object.entries(counts(state, type)).map(([person, n]) => ({ person, n }));
    const res = winners(c, (e) => e.n, { min: false, filter: (e) => e.n > 0 });
    add(icon, title, subtitle, res, (v) => `${v} stk`);
  };
  countAward("toilet", "🚽", "Blærekampion", "Flest dobesøk");
  countAward("spill", "💦", "Sølekongen", "Flest sølingar");
  countAward("fart", "💨", "Gassverket", "Mest fising, hikking og gupling");
  countAward("idiocy", "🤪", "Kveldens idiot", "Mest generell idioti");
  countAward("offence", "😤", "Krenkjaren", "Flest krenkingar");
  return list;
}

/** All-time snitt per person frå historikken (+ eventuelt kvelden i kveld). */
export function allTimePersonAverages(history) {
  const acc = {};
  for (const y of history)
    for (const b of y.beers)
      for (const [p, v] of Object.entries(b.scores))
        if (typeof v === "number") (acc[p] ??= []).push(v);
  return Object.fromEntries(Object.entries(acc).map(([p, xs]) => [p, { average: avg(xs), n: xs.length }]));
}

export function yearAverages(history) {
  return history.map((y) => ({
    year: y.year,
    average: avg(y.beers.flatMap((b) => Object.values(b.scores).filter((v) => typeof v === "number"))),
  }));
}

/** Tolkar karakterar slik operatøren skriv dei: «3,75», «3.75», «375» → 3.75, «35» → 3.5, «4» → 4. */
export function parseScore(input) {
  const s = String(input).trim().replace(",", ".");
  if (s === "") return { empty: true };
  if (/^n\/?a$|^-$/i.test(s)) return { value: null };
  let v;
  if (/^\d+(\.\d+)?$/.test(s) && s.includes(".")) v = parseFloat(s);
  else if (/^\d$/.test(s)) v = parseInt(s, 10);
  else if (/^\d{2,3}$/.test(s)) v = parseFloat(`${s[0]}.${s.slice(1)}`);
  else return { error: "Ugyldig" };
  if (v < 0 || v > 5) return { error: "0–5" };
  return { value: v };
}
