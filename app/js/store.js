// Tilstanden for kvelden: lastar frå / lagrar til den lokale serveren, og
// sender oppdateringar til storskjermen via Server-Sent Events.
import { loadLineup, loadProduct } from "./data.js";

export function currentYear() {
  const q = new URLSearchParams(location.search).get("year");
  return q && /^\d{4}$/.test(q) ? Number(q) : new Date().getFullYear();
}

const uid = (prefix = "x") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export { uid };

/** Gjer om eit produkt frå Vinmonopolet til eit øl i kveldens tilstand. */
export function beerFromProduct(p, extra = {}) {
  return {
    id: `vmp-${p.id}`,
    vinmonopoletId: p.id,
    name: p.name,
    brewery: p.producer,
    style: p.style,
    abv: p.abv,
    volumeCl: p.volumeCl,
    price: p.price,
    litrePrice: p.litrePrice,
    country: p.country,
    color: p.color,
    smell: p.smell,
    taste: p.taste,
    goodFor: p.goodFor ?? [],
    characteristics: p.characteristics ?? null,
    image: p.image,
    url: p.url,
    source: "pol",
    status: "queued",
    scores: {},
    ...extra,
  };
}

export function manualBeer({
  name, brewery = null, abv = null, source = "butikk", image = null, style = null,
  description = null, untappdUrl = null, historyNames = undefined,
}) {
  return {
    id: uid("m"),
    vinmonopoletId: null,
    name,
    brewery,
    style,
    abv,
    image,
    source,
    description,
    untappdUrl,
    ...(historyNames ? { historyNames } : {}),
    status: "queued",
    scores: {},
  };
}

/** Hentar øl frå data/lineup/<år>.json som ikkje alt er med i kvelden. */
export async function beersFromLineup(year, existing = []) {
  const lineup = await loadLineup(year);
  if (!lineup) return { participants: [], beers: [] };
  const have = new Set(existing.map((b) => b.vinmonopoletId).filter(Boolean));
  const haveNames = new Set(existing.map((b) => b.name));
  const beers = [];
  for (const entry of lineup.beers ?? []) {
    if (entry.vinmonopoletId) {
      if (have.has(entry.vinmonopoletId)) continue;
      const p = await loadProduct(entry.vinmonopoletId);
      if (p) beers.push(beerFromProduct(p, entry.historyNames ? { historyNames: entry.historyNames } : {}));
      else beers.push(manualBeer({ name: entry.name ?? `Varenr ${entry.vinmonopoletId}`, source: "pol" }));
    } else if (entry.name && !haveNames.has(entry.name)) {
      beers.push(manualBeer(entry));
    }
  }
  return { participants: lineup.participants ?? [], beers };
}

export function emptyState(year) {
  return {
    year,
    version: 0,
    updatedAt: null,
    participants: [],
    beers: [],
    currentBeerId: null,
    incidents: [],
    quotes: [],
    pulse: { rounds: [], guesses: {} },
    tv: { mode: "dashboard", beerId: null, awardIndex: 0, message: "", seq: 0 },
  };
}

const LOCAL_KEY = (year) => `joleol-event-${year}`;

export function createStore(year) {
  let state = null;
  const listeners = new Set();
  let status = { saving: false, error: null, savedAt: null };
  let saving = false;
  let dirty = false;

  const notify = () => listeners.forEach((fn) => fn(state, status));

  async function load({ create = true } = {}) {
    try {
      const res = await fetch(`/api/event/${year}`, { cache: "no-store" });
      if (res.ok) {
        state = await res.json();
        return { state, created: false };
      }
      if (res.status !== 404) throw new Error(`Server svarte ${res.status}`);
    } catch (e) {
      // Serveren svarar ikkje: prøv reservekopien i nettlesaren
      const local = safeLocalGet(LOCAL_KEY(year));
      if (local) {
        state = local;
        status = { ...status, error: "Serveren svarar ikkje – brukar kopi frå nettlesaren" };
        return { state, created: false };
      }
      throw e;
    }
    if (!create) throw new Error("Ingen kveld oppretta enno");
    state = emptyState(year);
    const { participants, beers } = await beersFromLineup(year);
    state.participants = participants;
    state.beers = beers;
    await save();
    return { state, created: true };
  }

  async function save() {
    dirty = true;
    safeLocalSet(LOCAL_KEY(year), state);
    if (saving) return;
    saving = true;
    while (dirty) {
      dirty = false;
      status = { ...status, saving: true };
      notify();
      try {
        const res = await fetch(`/api/event/${year}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        status = { saving: false, error: null, savedAt: Date.now() };
      } catch (e) {
        status = { ...status, saving: false, error: `Lagring feila: ${e.message}` };
        notify();
        // Prøv igjen litt seinare
        await new Promise((r) => setTimeout(r, 3000));
        dirty = true;
      }
    }
    saving = false;
    notify();
  }

  /** Endre tilstanden. `fn` får tilstanden og kan mutere han direkte. */
  function update(fn) {
    fn(state);
    state.version = (state.version ?? 0) + 1;
    state.updatedAt = new Date().toISOString();
    notify();
    save();
  }

  /** For storskjermen: lytt på endringar frå serveren. */
  function live() {
    const es = new EventSource(`/api/event/${year}/stream`);
    es.onmessage = (ev) => {
      state = JSON.parse(ev.data);
      status = { ...status, error: null };
      notify();
    };
    es.onerror = () => {
      status = { ...status, error: "Mista kontakt med serveren – prøver igjen …" };
      notify();
    };
    es.onopen = async () => {
      // Hent siste versjon i tilfelle me gjekk glipp av noko
      const res = await fetch(`/api/event/${year}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        state = await res.json();
        status = { ...status, error: null };
        notify();
      }
    };
    return es;
  }

  return {
    load,
    update,
    live,
    get state() {
      return state;
    },
    get status() {
      return status;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function safeLocalGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ikkje kritisk */
  }
}
