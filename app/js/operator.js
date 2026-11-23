import { createStore, currentYear, beersFromLineup, manualBeer, uid } from "./store.js";
import { imageUrl, loadPeople } from "./data.js";
import { loadFavourites, parseVideo, videoKey } from "./video.js";
import { CATEGORIES, categoryById, beerAverage, counts, fmt, parseScore, awards, syncStatus, clock } from "./stats.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const time = (iso) => new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

const year = currentYear();
const store = createStore(year);
$("#year").textContent = year;
document.title = `Registrering ${year} – Joleølsmaking`;

const SOURCE_LABEL = { pol: "Pol", butikk: "Butikk", heimebrygg: "Heimebrygg" };
const STATUS_LABEL = { queued: "", tasting: "smakar no", done: "ferdig" };

let pendingCategory = null; // for hurtigtastar: kategori vald, ventar på person

// ---------- Hjelparar ----------

const current = (s = store.state) => s.beers.find((b) => b.id === s.currentBeerId) ?? null;

function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

function setTv(patch) {
  store.update((s) => {
    s.tv = { ...s.tv, ...patch, seq: (s.tv.seq ?? 0) + 1 };
  });
}

function addIncident(type, person) {
  store.update((s) => {
    s.incidents.push({ id: uid("i"), type, person, at: new Date().toISOString(), beerId: s.currentBeerId });
  });
  const c = categoryById[type];
  toast(`${c.icon} ${c.short ?? c.label}: ${person}`);
}

function removeLastIncident(type, person) {
  store.update((s) => {
    for (let i = s.incidents.length - 1; i >= 0; i--) {
      if (s.incidents[i].type === type && s.incidents[i].person === person) {
        s.incidents.splice(i, 1);
        return;
      }
    }
  });
}

// ---------- Render ----------

function renderStatus(status) {
  const el = $("#save-status");
  if (status.error) {
    el.textContent = `⚠️ ${status.error}`;
    el.className = "save-status error";
  } else if (status.saving) {
    el.textContent = "Lagrar …";
    el.className = "save-status";
  } else if (status.savedAt) {
    el.textContent = `✓ Lagra ${new Date(status.savedAt).toLocaleTimeString("nb-NO")}`;
    el.className = "save-status ok";
  }
}

function renderTvBar(s) {
  for (const b of document.querySelectorAll(".tvmode")) b.classList.toggle("active", b.dataset.mode === s.tv.mode);
  const list = awards(s);
  $("#award-pos").textContent = list.length ? `${Math.min(s.tv.awardIndex ?? 0, list.length - 1) + 1}/${list.length}` : "0/0";
  $('.tvmode[data-mode="beer"]').disabled = !current(s);
}

function renderLineup(s) {
  const ol = $("#lineup");
  ol.innerHTML = s.beers
    .map((b, i) => {
      const a = beerAverage(b);
      const img = imageUrl(b);
      return `<li class="beer ${b.status} ${b.id === s.currentBeerId ? "current" : ""}" data-id="${b.id}">
        <span class="thumb">${img ? `<img src="${esc(img)}" alt="">` : "🍺"}</span>
        <span class="beer-text">
          <span class="beer-name">${esc(b.name)}</span>
          <span class="muted small">${b.startedAt ? `<b class="time">🕰️ ${clock(b.startedAt)}</b> · ` : ""}${[b.style, b.abv != null ? `${fmt(b.abv, 1)} %` : null, SOURCE_LABEL[b.source]]
            .filter(Boolean)
            .map(esc)
            .join(" · ")}${STATUS_LABEL[b.status] ? ` · <b>${STATUS_LABEL[b.status]}</b>` : ""}</span>
        </span>
        <span class="beer-avg">${b.status === "done" && a != null ? fmt(a) : ""}</span>
        <span class="beer-actions">
          ${b.id === s.currentBeerId ? "" : `<button class="btn small" data-act="start" title="Start dette ølet">▶</button>`}
          <button class="btn small ghost" data-act="up" ${i === 0 ? "disabled" : ""} title="Flytt opp">↑</button>
          <button class="btn small ghost" data-act="down" ${i === s.beers.length - 1 ? "disabled" : ""} title="Flytt ned">↓</button>
          ${!givenCount(b) ? `<button class="btn small ghost danger" data-act="delete" title="Fjern">✕</button>` : ""}
        </span>
      </li>`;
    })
    .join("");
}
const givenCount = (b) => Object.keys(b.scores ?? {}).length;

let scoreFormKey = "";
function renderCurrent(s) {
  const cur = current(s);
  $("#current").hidden = !cur;
  $("#current-empty").hidden = !!cur;
  if (!cur) return;

  const img = imageUrl(cur);
  $("#current-img").src = img ?? "";
  $("#current-img").hidden = !img;
  $("#current-name").textContent = cur.name;
  $("#current-meta").textContent = [
    `Øl ${s.beers.indexOf(cur) + 1} av ${s.beers.length}`,
    cur.style,
    cur.abv != null ? `${fmt(cur.abv, 1)} %` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const a = beerAverage(cur);
  $("#current-avg").innerHTML =
    a != null ? `Snitt (berre synleg her): <b>${fmt(a)}</b> · ${givenCount(cur)}/${s.participants.length} registrert` : "";

  // Bygg skjemaet berre på nytt når ølet eller deltakarane endrar seg, så fokus ikkje forsvinn
  const key = `${cur.id}|${s.participants.join(",")}`;
  const form = $("#score-form");
  if (key !== scoreFormKey) {
    scoreFormKey = key;
    form.innerHTML = s.participants
      .map(
        (p, i) => `<label class="score-row">
          <span class="score-name"><kbd>${i + 1}</kbd> ${esc(p)}</span>
          <input data-person="${esc(p)}" inputmode="decimal" placeholder="–">
          <span class="score-val"></span>
        </label>`
      )
      .join("");
  }
  for (const input of form.querySelectorAll("input")) {
    const p = input.dataset.person;
    const v = cur.scores[p];
    const shown = v === undefined ? "" : v === null ? "n/a" : fmt(v, v % 1 ? 2 : 0);
    if (document.activeElement !== input && !input.classList.contains("invalid")) input.value = shown;
    input.closest(".score-row").querySelector(".score-val").textContent = v === undefined ? "" : v === null ? "smakte ikkje" : "✓";
  }
  const timeInput = $("#checkin-time");
  if (document.activeElement !== timeInput) timeInput.value = cur.startedAt ? clock(cur.startedAt) : "";

  const missing = s.participants.filter((p) => !(p in cur.scores));
  const done = cur.status === "done";
  $("#force-summary").hidden = done || !givenCount(cur);
  $("#summary-status").innerHTML = done
    ? missing.length
      ? `✅ Oppsummering vist – manglar <b>${missing.map(esc).join(", ")}</b> (kan fyllast inn seinare)`
      : "✅ Alle har stemt – oppsummeringa er på storskjermen"
    : `⏳ Ventar på ${missing.length ? missing.map(esc).join(", ") : "…"}`;
}

/** Byt ut alternativa i ein <select> utan å miste det som er valt. */
function setOptions(select, html, fallback = "") {
  const keep = select.value;
  select.innerHTML = html;
  select.value = [...select.options].some((o) => o.value === keep) ? keep : fallback;
}

let quoteBeerFor = null; // kva øl som var i gang sist me sette standardval for sitat-øl
function renderQuotes(s) {
  const beerName = (id) => {
    const n = s.beers.find((b) => b.id === id)?.name;
    return n && n.length > 28 ? `${n.slice(0, 27)}…` : n;
  };
  // Sitat-øl: standard er ølet som er i gang, men kan endrast (t.d. til førre øl)
  const started = s.beers.filter((b) => b.startedAt || b.id === s.currentBeerId);
  const sel = $("#quote-beer");
  setOptions(
    sel,
    `<option value="">– Ikkje knytt til eit øl –</option>` +
      started.map((b) => `<option value="${b.id}">🍺 ${esc(b.name)}</option>`).join(""),
    s.currentBeerId ?? ""
  );
  if (quoteBeerFor !== s.currentBeerId) {
    quoteBeerFor = s.currentBeerId;
    sel.value = s.currentBeerId ?? "";
  }

  $("#quotes").innerHTML = s.quotes
    .slice()
    .reverse()
    .slice(0, 8)
    .map(
      (q) => `<li data-id="${q.id}"><span class="muted small">${time(q.at)}</span> «${esc(q.text)}»${
        q.person ? ` <span class="muted">– ${esc(q.person)}</span>` : ""
      }${beerName(q.beerId) ? ` <span class="muted small">· 🍺 ${esc(beerName(q.beerId))}</span>` : ""}
      <button class="link danger" data-act="del-quote" title="Slett">✕</button></li>`
    )
    .join("");
}

function renderIncidents(s) {
  const c = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, counts(s, cat.id)]));
  $("#incidents").innerHTML =
    `<thead><tr><th></th>${CATEGORIES.map((cat) => `<th title="${esc(cat.label)}">${cat.icon}<br><kbd>${cat.key}</kbd></th>`).join("")}</tr></thead><tbody>` +
    s.participants
      .map(
        (p, i) =>
          `<tr><th><kbd>${i + 1}</kbd> ${esc(p)}</th>${CATEGORIES.map(
            (cat) =>
              `<td><button class="count ${c[cat.id][p] ? "has" : ""}" data-type="${cat.id}" data-person="${esc(p)}" title="Klikk: +1 · Shift-klikk: −1">${c[cat.id][p] || ""}</button></td>`
          ).join("")}</tr>`
      )
      .join("") +
    `</tbody>`;

  $("#incident-log").innerHTML = s.incidents
    .slice(-6)
    .reverse()
    .map((i) => {
      const cat = categoryById[i.type];
      return `<li data-id="${i.id}"><span class="muted small">${time(i.at)}</span> ${cat?.icon ?? ""} ${esc(cat?.short ?? cat?.label ?? i.type)} – ${esc(i.person)} <button class="link danger" data-act="del-incident" title="Angre">✕</button></li>`;
    })
    .join("");
}

function renderPeople(s) {
  setOptions(
    $("#quote-person"),
    `<option value="">– Ingen bestemt –</option>` + s.participants.map((p) => `<option>${esc(p)}</option>`).join("")
  );
  $("#participants").innerHTML = s.participants
    .map(
      (p, i) => `<li data-person="${esc(p)}"><kbd>${i + 1}</kbd> ${esc(p)}
        <span><button class="link" data-act="p-up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="link danger" data-act="p-del">✕</button></span></li>`
    )
    .join("");
  const pulse = $("#pulse");
  const focused = document.activeElement?.closest?.("#pulse") ? document.activeElement.dataset.person : null;
  pulse.innerHTML = s.participants
    .map(
      (p) => `<label>${esc(p)} <input type="number" min="30" max="220" data-person="${esc(p)}" value="${
        s.measurements?.pulse?.[p] ?? ""
      }"></label>`
    )
    .join("");
  if (focused) pulse.querySelector(`input[data-person="${CSS.escape(focused)}"]`)?.focus();
}

let favourites = [];
function renderVideos(s) {
  const playing = s.tv.mode === "video" ? s.tv.video : null;
  $("#video-now").hidden = !playing;
  if (playing) $("#video-now-title").textContent = `▶ ${playing.title}`;
  const list = [...favourites.map((v) => ({ ...v, fav: true })), ...(s.videos ?? [])];
  $("#video-list").innerHTML = list
    .map(
      (v, i) => `<li class="${playing && videoKey(playing) === videoKey(v) ? "playing" : ""}" data-i="${i}">
        <span class="t" title="${esc(v.title)}">${v.fav ? "⭐" : "🎞️"} ${esc(v.title)}</span>
        <button class="btn small" data-act="play">▶</button>
        ${v.fav ? "" : `<button class="link danger" data-act="remove" title="Fjern frå lista">✕</button>`}
      </li>`
    )
    .join("");
  return list;
}

function playVideo(v) {
  store.update((s) => {
    s.tv = { ...s.tv, mode: "video", video: { title: v.title, youtube: v.youtube ?? null, file: v.file ?? null, start: v.start ?? 0 }, seq: (s.tv.seq ?? 0) + 1 };
  });
}

function render(s, status) {
  if (!s) return;
  renderVideos(s);
  renderStatus(status);
  renderTvBar(s);
  renderLineup(s);
  renderCurrent(s);
  renderQuotes(s);
  renderIncidents(s);
  if (!document.activeElement?.closest?.("#pulse, #participants, #add-participant")) renderPeople(s);
}

// ---------- Hendingar i UI ----------

$("#lineup").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  const li = e.target.closest("li.beer");
  if (!li) return;
  const id = li.dataset.id;
  const act = btn?.dataset.act;
  if (act === "start") {
    const prevBeer = current();
    const target = store.state.beers.find((x) => x.id === id);
    // Berre når me går vidare til eit nytt øl – ikkje når me går tilbake for å fylle inn ein karakter
    const unfinished = prevBeer && target.status === "queued" && prevBeer.status !== "done" && givenCount(prevBeer) > 0;
    store.update((s) => {
      // Gjekk me vidare før alle hadde stemt? Då tel det førre ølet med likevel, og kan fyllast ut seinare.
      if (unfinished) {
        const p = current(s);
        p.forcedDone = true;
        syncStatus(p, s.participants);
        p.status = "done";
        p.revealedAt ??= new Date().toISOString();
      }
      const b = s.beers.find((x) => x.id === id);
      s.currentBeerId = id;
      if (b.status === "queued") {
        b.status = "tasting";
        b.startedAt = new Date().toISOString();
      }
      s.tv = { ...s.tv, mode: "beer", beerId: id, seq: (s.tv.seq ?? 0) + 1 };
    });
    if (unfinished) toast(`«${prevBeer.name}» manglar nokre karakterar – du kan gå tilbake og fylle dei inn seinare`, 4000);
    setTimeout(() => $("#score-form input")?.focus(), 0);
  } else if (act === "up" || act === "down") {
    store.update((s) => {
      const i = s.beers.findIndex((x) => x.id === id);
      const j = act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= s.beers.length) return;
      [s.beers[i], s.beers[j]] = [s.beers[j], s.beers[i]];
    });
  } else if (act === "delete") {
    const b = store.state.beers.find((x) => x.id === id);
    if (!confirm(`Fjerne «${b.name}» frå lista?`)) return;
    store.update((s) => {
      s.beers = s.beers.filter((x) => x.id !== id);
      if (s.currentBeerId === id) s.currentBeerId = null;
    });
  }
});

$("#sync-lineup").addEventListener("click", async () => {
  const { beers, participants } = await beersFromLineup(year, store.state.beers);
  const newPeople = participants.filter((p) => !store.state.participants.includes(p));
  if (!beers.length && !newPeople.length) return toast("Ingen nye øl eller deltakarar i lineup-fila");
  store.update((s) => {
    s.beers.push(...beers);
    s.participants.push(...newPeople);
  });
  toast(`La til ${beers.length} øl og ${newPeople.length} deltakarar`);
});

$("#add-beer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const abv = parseFloat(String(f.get("abv")).replace(",", "."));
  const beer = manualBeer({
    name: f.get("name").trim(),
    brewery: f.get("brewery").trim() || null,
    abv: Number.isFinite(abv) ? abv : null,
    source: f.get("source"),
    image: f.get("image").trim() || null,
  });
  store.update((s) => s.beers.push(beer));
  e.target.reset();
  toast(`La til «${beer.name}»`);
});

// Karakterar
const scoreForm = $("#score-form");
function commitScore(input) {
  const cur = current();
  if (!cur) return true;
  const p = input.dataset.person;
  const r = parseScore(input.value);
  input.classList.toggle("invalid", !!r.error);
  if (r.error) {
    input.title = r.error;
    return false;
  }
  input.title = "";
  const before = cur.scores[p];
  if (r.empty && before === undefined) return true;
  if (!r.empty && before === r.value) return true;
  store.update((s) => {
    const b = current(s);
    if (r.empty) delete b.scores[p];
    else b.scores[p] = r.value;
    syncStatus(b, s.participants);
  });
  return true;
}
scoreForm.addEventListener("change", (e) => e.target.matches("input") && commitScore(e.target));
scoreForm.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.matches("input")) return;
  e.preventDefault();
  if (!commitScore(e.target)) return;
  const inputs = [...scoreForm.querySelectorAll("input")];
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else if (!$("#force-summary").hidden) $("#force-summary").focus();
});
scoreForm.addEventListener("submit", (e) => e.preventDefault());

$("#force-summary").addEventListener("click", () => {
  for (const input of scoreForm.querySelectorAll("input")) if (!commitScore(input)) return toast("Rett opp ugyldige karakterar først");
  const cur = current();
  if (!cur || beerAverage(cur) == null) return toast("Ingen karakterar registrerte enno");
  store.update((s) => {
    const b = current(s);
    b.forcedDone = true;
    b.status = "done";
    b.revealedAt ??= new Date().toISOString();
    s.tv = { ...s.tv, mode: "beer", beerId: b.id, seq: (s.tv.seq ?? 0) + 1 };
  });
});

$("#checkin-time").addEventListener("change", (e) => {
  const m = e.target.value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return;
  store.update((s) => {
    const b = current(s);
    const d = b.startedAt ? new Date(b.startedAt) : new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    b.startedAt = d.toISOString();
  });
  toast(`Innsjekk endra til ${e.target.value}`);
});

// Storskjerm
for (const b of document.querySelectorAll(".tvmode")) {
  if (b.dataset.mode === "message") continue;
  b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    const patch = { mode };
    if (mode === "beer" || mode === "reveal") patch.beerId = store.state.currentBeerId;
    setTv(patch);
  });
}
$("#message-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const message = $("#message-input").value.trim();
  if (!message) return;
  setTv({ mode: "message", message });
});
function stepAward(d) {
  const n = awards(store.state).length;
  if (!n) return toast("Ingen kåringar enno – avslør nokre øl først");
  const i = store.state.tv.mode === "awards" ? (store.state.tv.awardIndex ?? 0) + d : 0;
  setTv({ mode: "awards", awardIndex: Math.max(0, Math.min(n - 1, i)) });
}
$("#award-next").addEventListener("click", () => stepAward(1));
$("#award-prev").addEventListener("click", () => stepAward(-1));

$("#open-tv").addEventListener("click", () => {
  window.open(`tv.html?year=${year}`, "joleol-tv", "popup,width=1280,height=720");
});

$("#export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `joleolsmaking-${year}-${new Date().toISOString().slice(11, 16).replace(":", "")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Sitat
$("#quote-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#quote-text").value.trim();
  if (!text) return;
  const person = $("#quote-person").value || null;
  const beerId = $("#quote-beer").value || null;
  store.update((s) => s.quotes.push({ id: uid("q"), text, person, at: new Date().toISOString(), beerId }));
  $("#quote-text").value = "";
  $("#quote-person").value = "";
  $("#quote-beer").value = store.state.currentBeerId ?? ""; // neste sitat gjeld truleg ølet som er i gang
});
$("#quotes").addEventListener("click", (e) => {
  if (e.target.dataset.act !== "del-quote") return;
  const id = e.target.closest("li").dataset.id;
  store.update((s) => (s.quotes = s.quotes.filter((q) => q.id !== id)));
});

// Hendingar
$("#incidents").addEventListener("click", (e) => {
  const b = e.target.closest("button.count");
  if (!b) return;
  if (e.shiftKey || e.altKey) removeLastIncident(b.dataset.type, b.dataset.person);
  else addIncident(b.dataset.type, b.dataset.person);
});
$("#incidents").addEventListener("contextmenu", (e) => {
  const b = e.target.closest("button.count");
  if (!b) return;
  e.preventDefault();
  removeLastIncident(b.dataset.type, b.dataset.person);
});
$("#incident-log").addEventListener("click", (e) => {
  if (e.target.dataset.act !== "del-incident") return;
  const id = e.target.closest("li").dataset.id;
  store.update((s) => (s.incidents = s.incidents.filter((i) => i.id !== id)));
});

$("#key-legend").innerHTML =
  `Hurtigtastar (når du ikkje skriv i eit felt): ${CATEGORIES.map((c) => `<kbd>${c.key}</kbd> ${c.icon}`).join(" ")} + persontal, t.d. <kbd>s</kbd><kbd>3</kbd>. Høgreklikk/shift-klikk i tabellen = −1.`;

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest?.("input, textarea, select");
  if (typing || e.metaKey || e.ctrlKey) return;
  const pend = $("#key-pending");
  if (e.key === "Escape") {
    pendingCategory = null;
    pend.hidden = true;
    return;
  }
  const cat = CATEGORIES.find((c) => c.key === e.key.toLowerCase());
  if (cat) {
    pendingCategory = cat.id;
    pend.hidden = false;
    pend.textContent = `${cat.icon} ${cat.short ?? cat.label}: kven? (1–${store.state.participants.length}, Esc avbryt)`;
    return;
  }
  if (pendingCategory && /^[1-9]$/.test(e.key)) {
    const person = store.state.participants[Number(e.key) - 1];
    if (person) addIncident(pendingCategory, person);
    pendingCategory = null;
    pend.hidden = true;
  }
});

// Puls og deltakarar
$("#pulse").addEventListener("change", (e) => {
  const p = e.target.dataset.person;
  const v = parseInt(e.target.value, 10);
  store.update((s) => {
    s.measurements ??= { pulse: {} };
    s.measurements.pulse ??= {};
    if (Number.isFinite(v)) s.measurements.pulse[p] = v;
    else delete s.measurements.pulse[p];
  });
});
$("#participants").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  const p = e.target.closest("li")?.dataset.person;
  if (!act || !p) return;
  if (act === "p-del") {
    const hasScores = store.state.beers.some((b) => p in (b.scores ?? {}));
    if (!confirm(hasScores ? `${p} har alt gitt karakterar – fjerne frå lista likevel? (karakterane blir verande)` : `Fjerne ${p}?`)) return;
    store.update((s) => (s.participants = s.participants.filter((x) => x !== p)));
  } else if (act === "p-up") {
    store.update((s) => {
      const i = s.participants.indexOf(p);
      if (i > 0) [s.participants[i - 1], s.participants[i]] = [s.participants[i], s.participants[i - 1]];
    });
  }
});
$("#add-participant").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name || store.state.participants.includes(name)) return;
  store.update((s) => s.participants.push(name));
  e.target.reset();
});

// Videoar
$("#video-list").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  const li = e.target.closest("li");
  if (!act || !li) return;
  const list = renderVideos(store.state);
  const v = list[Number(li.dataset.i)];
  if (act === "play") playVideo(v);
  if (act === "remove") store.update((s) => (s.videos = (s.videos ?? []).filter((x) => videoKey(x) !== videoKey(v))));
});
$("#video-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("#video-input").value;
  const parsed = parseVideo(raw);
  if (!parsed) return toast("Skjønte ikkje lenkja – lim inn ei YouTube-lenkje eller eit filnamn (t.d. video.mp4)");
  const known = [...favourites, ...(store.state.videos ?? [])].find((v) => videoKey(v) === videoKey(parsed));
  const v = known ?? { title: parsed.file ?? `YouTube ${parsed.youtube}`, ...parsed };
  if (!known) store.update((s) => (s.videos ??= []).push(v)); // hugs videoen resten av kvelden
  playVideo({ ...v, start: parsed.start ?? v.start });
  $("#video-input").value = "";
  if (!known && v.youtube) fetchTitle(v.youtube);
});
/** Hent tittelen frå YouTube (krev nett – går det ikkje, blir ID-en ståande). */
async function fetchTitle(id) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
    const { title } = await res.json();
    if (!title) return;
    store.update((s) => {
      for (const v of s.videos ?? []) if (v.youtube === id) v.title = title;
      if (s.tv.video?.youtube === id) s.tv.video = { ...s.tv.video, title };
    });
  } catch {
    /* utan nett – ikkje noko å gjere */
  }
}

$("#video-toggle").addEventListener("click", () => {
  store.update((s) => (s.tv = { ...s.tv, videoCmd: { cmd: "toggle", n: (s.tv.videoCmd?.n ?? 0) + 1 } }));
});
$("#video-stop").addEventListener("click", () => setTv({ mode: "dashboard", video: null }));

// ---------- Oppstart ----------

store.subscribe(render);
try {
  const { created } = await store.load();
  render(store.state, store.status);
  if (created) toast(`Ny kveld oppretta frå lineup: ${store.state.beers.length} øl, ${store.state.participants.length} deltakarar`, 4000);
} catch (e) {
  $("#save-status").textContent = `⚠️ Klarte ikkje å laste: ${e.message}. Køyrer serveren? (node server.mjs)`;
  $("#save-status").className = "save-status error";
}
favourites = await loadFavourites();
if (store.state) render(store.state, store.status);
const { people } = await loadPeople();
$("#known-people").innerHTML = people.map((p) => `<option value="${esc(p.name)}">`).join("");
