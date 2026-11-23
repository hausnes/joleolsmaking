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
    .sort((a, b) => checkinMs(a) - checkinMs(b))
    .map((b) => ({ beer: b, average: beerAverage(b) }))
    .filter((r) => r.average != null);
}

// ---------- Tidspunkt ----------

/** Tidspunktet ølet vart sjekka inn (trykt ▶). */
export const checkinMs = (b) => (b.startedAt ? Date.parse(b.startedAt) : Infinity);

export const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "";

/** Øl som er sjekka inn, i rekkjefølgja dei vart sjekka inn. */
export const checkedIn = (state) => state.beers.filter((b) => b.startedAt).sort((a, b) => checkinMs(a) - checkinMs(b));

/** Minutt sidan førre øl vart sjekka inn (null for det første). */
export function minutesSincePrevious(state, beer) {
  const list = checkedIn(state);
  const i = list.findIndex((b) => b.id === beer.id);
  if (i <= 0) return null;
  return Math.round((checkinMs(list[i]) - checkinMs(list[i - 1])) / 60000);
}

/** Gjennomsnittleg tid mellom kvart øl, i minutt. */
export function tempo(state) {
  const list = checkedIn(state);
  if (list.length < 2) return null;
  return Math.round((checkinMs(list[list.length - 1]) - checkinMs(list[0])) / 60000 / (list.length - 1));
}

// ---------- Puls ----------
// state.pulse = { rounds: [{ id, label, at, values: { person: bpm } }], guesses: { person: bpm } }

export const pulseRounds = (state) => [...(state.pulse?.rounds ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** Siste målte puls per person (frå den siste runden personen er med i). */
export function latestPulse(state) {
  const out = {};
  for (const r of pulseRounds(state)) for (const [p, v] of Object.entries(r.values ?? {})) out[p] = v;
  return out;
}

/** Endring frå første til siste måling for kvar person (krev to rundar), sortert etter størst prosentvis auke. */
export function pulseChanges(state) {
  const rounds = pulseRounds(state);
  if (rounds.length < 2) return [];
  return state.participants
    .map((person) => {
      const vals = rounds.map((r) => r.values?.[person]).filter((v) => typeof v === "number");
      if (vals.length < 2) return null;
      const start = vals[0];
      const end = vals[vals.length - 1];
      return { person, start, end, diff: end - start, pct: ((end - start) / start) * 100 };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);
}

/** Tippekonkurransen: kor nær var tipset på sluttpulsen (siste runde)? Nærast først. */
export function pulseGuesses(state) {
  const rounds = pulseRounds(state);
  if (rounds.length < 2) return [];
  const last = rounds[rounds.length - 1];
  return Object.entries(state.pulse?.guesses ?? {})
    .filter(([p, g]) => typeof g === "number" && typeof last.values?.[p] === "number")
    .map(([person, guess]) => ({ person, guess, actual: last.values[person], off: Math.abs(last.values[person] - guess) }))
    .sort((a, b) => a.off - b.off);
}

// ---------- Status ----------

/** Alle deltakarane har anten gitt karakter eller n/a, og minst éin har gitt karakter. */
export function isComplete(beer, participants) {
  return participants.every((p) => p in (beer.scores ?? {})) && givenScores(beer).length > 0;
}

/** Set status ut frå karakterane: ferdig når alle har stemt (eller når oppsummeringa er tvinga fram). */
export function syncStatus(beer, participants) {
  if (isComplete(beer, participants)) {
    if (beer.status !== "done") beer.revealedAt ??= new Date().toISOString();
    beer.status = "done";
  } else if (beer.status === "done" && !beer.forcedDone) {
    beer.status = "tasting";
  }
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
    if (rank.length > 1) list.push({
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
    // Hopp over kåringar der alle er like (t.d. tidleg på kvelden) – då er det ingen vinnar
    if (res && res.who.length > 1 && res.who.length >= ps.length) return;
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
  const changes = pulseChanges(state);
  if (changes.length) {
    const fmtChange = (c) => `${c.start} → ${c.end} slag/min (${c.pct >= 0 ? "+" : ""}${fmt(c.pct, 0)} %)`;
    const most = winners(changes, (c) => c.pct, { min: false });
    list.push({ icon: "💓", title: "Hjartebankaren", subtitle: "Størst pulsauke gjennom kvelden", names: most.who.map((c) => c.person), value: most.who.map(fmtChange).join(", ") });
    if (changes.length > 1) {
      const calm = winners(changes, (c) => c.pct);
      list.push({ icon: "🧘", title: "Isbjørnen", subtitle: "Roleg puls uansett kva som skjer", names: calm.who.map((c) => c.person), value: calm.who.map(fmtChange).join(", ") });
    }
  }
  const guesses = pulseGuesses(state);
  if (guesses.length) {
    const best = winners(guesses, (g) => g.off);
    list.push({
      icon: "🎯",
      title: "Pulsprofeten",
      subtitle: "Tippa sluttpulsen sin best",
      names: best.who.map((g) => g.person),
      value: best.who.map((g) => `Tippa ${g.guess}, fekk ${g.actual}`).join(", "),
    });
  }

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
