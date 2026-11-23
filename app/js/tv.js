import { createStore, currentYear } from "./store.js";
import { loadHistory, loadPeople, findPrevious, imageUrl } from "./data.js";
import {
  CATEGORIES, categoryById, beerAverage, givenScores, doneBeers, ranking, personStats, counts,
  beerOutliers, trend, awards, allTimePersonAverages, fmt,
} from "./stats.js";
import { toggleSound, drumroll, crash, flip, ding, boing, fanfare } from "./sound.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const year = currentYear();
const store = createStore(year);
const stage = $("#stage");
document.title = `Storskjerm ${year} – Joleølsmaking`;

let history = [];
let allTime = {};
let people = [];
let lastKey = null;
let timers = [];
let prev = null; // førre tilstand, for å oppdage nye hendingar

// ---------- Små byggjeklossar ----------

/** Farge frå raud (0) via gull (2,5) til grøn (5). */
const COLOR_STOPS = [
  [0, 2, 62, 50],
  [2, 18, 70, 54],
  [3, 42, 78, 56],
  [4, 95, 42, 50],
  [5, 145, 48, 46],
]; // [karakter, kulør, metting, lysheit]
function scoreColor(v) {
  const x = Math.max(0, Math.min(5, v ?? 0));
  const i = Math.max(0, COLOR_STOPS.findIndex((s) => s[0] >= x) - 1);
  const [a, b] = [COLOR_STOPS[i], COLOR_STOPS[Math.min(i + 1, COLOR_STOPS.length - 1)]];
  const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return `hsl(${mix(1).toFixed(0)} ${mix(2).toFixed(0)}% ${mix(3).toFixed(0)}%)`;
}
const brewer = (b) => (b.brewery ?? "").replace(/\s+(AS|ASA|AB|A\/S|SA|NV|BV|Ltd\.?)$/i, "");

function bottle(beer, cls = "") {
  const img = imageUrl(beer);
  if (img) return `<div class="bottle framed ${cls}"><img src="${esc(img)}" alt=""></div>`;
  const initials = (beer.brewery ?? beer.name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return `<div class="bottle placeholder ${cls}"><svg viewBox="0 0 60 160" aria-hidden="true">
    <path d="M24 4h12v30c0 8 14 14 14 30v86c0 3-2 6-6 6H16c-4 0-6-3-6-6V64c0-16 14-22 14-30z" fill="currentColor"/>
    <rect x="14" y="86" width="32" height="40" rx="3" fill="var(--bg)"/>
    <text x="30" y="112" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${esc(initials)}</text></svg></div>`;
}

function meta(beer) {
  return [
    beer.style,
    beer.abv != null ? `${fmt(beer.abv, 1)} %` : null,
    beer.volumeCl ? `${beer.volumeCl} cl` : null,
    beer.price ? `kr ${fmt(beer.price, 2)}` : null,
    beer.country && beer.country !== "Norge" ? beer.country : null,
    { pol: "Polet", butikk: "Butikk", heimebrygg: "Heimebrygg" }[beer.source],
  ]
    .filter(Boolean)
    .map((m) => `<span class="chip">${esc(m)}</span>`)
    .join("");
}

function scale(label, value, max = 12) {
  if (value == null) return "";
  return `<div class="scale"><span>${label}</span><div class="scale-bar"><i style="width:${(value / max) * 100}%"></i></div><b>${value}</b></div>`;
}

function previousChips(beer) {
  const prevYears = findPrevious(beer, history);
  if (!prevYears.length) return `<div class="history-line new">✨ Ny for gjengen – aldri smakt før!</div>`;
  return `<div class="history-line">Smakt før: ${prevYears
    .map((p) => `<span class="chip hist" style="--c:${scoreColor(p.average)}">${p.year}: <b>${fmt(p.average)}</b></span>`)
    .join("")}</div>`;
}

// ---------- Visningar ----------

function viewWelcome(s) {
  const edition = history.filter((h) => h.year < year).length + 1;
  const winners = history
    .map((h) => {
      const best = [...h.beers].sort((a, b) => b.average - a.average)[0];
      return best && { year: h.year, name: best.name.replace(/\s*\([^)]*%\)\s*$/, ""), average: best.average };
    })
    .filter(Boolean)
    .reverse()
    .slice(0, 8);
  const byName = Object.fromEntries(people.map((p) => [p.name, p]));
  return `<section class="welcome enter">
    <div class="welcome-head">
      <p class="kicker">Velkommen til den ${edition}.</p>
      <h1>Joleølsmaking ${year}</h1>
      <p class="sub">${s.beers.length} øl står klare · ${s.participants.length} dommarar</p>
    </div>
    <div class="welcome-grid">
      <div class="card">
        <h2>Dommarpanelet</h2>
        <ul class="judges">${s.participants
          .map((p) => {
            const n = (byName[p]?.years.filter((y) => y < year).length ?? 0) + 1;
            const a = allTime[p];
            return `<li><b>${esc(p)}</b><span>${n === 1 ? "🆕 debutant" : `${n}. gong`}${a ? ` · snitt ${fmt(a.average)}` : ""}</span></li>`;
          })
          .join("")}</ul>
      </div>
      <div class="card">
        <h2>Tidlegare vinnarar</h2>
        <ul class="winners">${winners
          .map((w) => `<li><span class="yr">${w.year}</span><span class="nm">${esc(w.name)}</span><b>${fmt(w.average)}</b></li>`)
          .join("")}</ul>
      </div>
    </div>
  </section>`;
}

function trendSvg(s) {
  const t = trend(s);
  if (t.length < 2) return `<p class="muted">Kjem når to øl er avslørte …</p>`;
  const vals = t.map((r) => r.average);
  const lo = Math.max(0, Math.min(...vals) - 0.3);
  const hi = Math.min(5, Math.max(...vals) + 0.3);
  const W = 600, H = 170, P = 18;
  const x = (i) => P + (i * (W - 2 * P)) / (t.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  // Enkel lineær regresjon for å svare på spørsmålet
  const n = vals.length;
  const mx = (n - 1) / 2;
  const my = vals.reduce((a, b) => a + b, 0) / n;
  const slope = vals.reduce((a, v, i) => a + (i - mx) * (v - my), 0) / vals.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  const verdict = slope > 0.03 ? "Ja! Me blir snillare ↗" : slope < -0.03 ? "Nei – strengare og strengare ↘" : "Stødig som fjell →";
  return `<svg viewBox="0 0 ${W} ${H}" class="trend" preserveAspectRatio="none">
      <line x1="${x(0)}" x2="${x(n - 1)}" y1="${y(my - slope * mx)}" y2="${y(my + slope * mx)}" class="trend-fit"/>
      <polyline points="${t.map((r, i) => `${x(i)},${y(r.average)}`).join(" ")}" class="trend-line"/>
      ${t.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.average)}" r="6" style="fill:${scoreColor(r.average)}"/>`).join("")}
    </svg><p class="verdict">${verdict}</p>`;
}

function viewDashboard(s) {
  const rank = ranking(s);
  if (!rank.length) return viewWelcome(s);
  const ps = personStats(s)
    .filter((p) => p.n)
    .sort((a, b) => b.average - a.average);
  const total = rank.length;
  const allScores = doneBeers(s).flatMap((b) => givenScores(b).map(([, v]) => v));
  const nightAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const lastYear = history.find((h) => h.year === year - 1);
  const lastYearAvg = lastYear
    ? (() => {
        const xs = lastYear.beers.flatMap((b) => Object.values(b.scores).filter((v) => typeof v === "number"));
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      })()
    : null;

  const c = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, counts(s, cat.id)]));
  const leaders = Object.fromEntries(
    CATEGORIES.map((cat) => [cat.id, Math.max(0, ...Object.values(c[cat.id]))])
  );
  const pulse = s.measurements?.pulse ?? {};
  const hasPulse = Object.keys(pulse).length > 0;

  const quotes = s.quotes.slice(-3).reverse();
  const queued = s.beers.filter((b) => b.status !== "done").slice(0, 6);

  return `<section class="dash enter-soft">
    <header class="dash-head">
      <h1>Joleølsmaking ${year}</h1>
      <div class="dash-stats">
        <span><b>${total}</b>/${s.beers.length} øl</span>
        <span>Kveldens snitt <b>${fmt(nightAvg)}</b>${lastYearAvg ? ` <small>(i fjor ${fmt(lastYearAvg)})</small>` : ""}</span>
      </div>
    </header>

    <div class="card top">
      <h2>🏆 Topplista</h2>
      <ol class="toplist">${rank
        .slice(0, 8)
        .map(
          (r, i) => `<li class="${i === 0 ? "first" : ""}">
            <span class="pos">${i + 1}</span>
            ${bottle(r.beer, "mini")}
            <span class="nm">${esc(r.beer.name)}</span>
            <span class="bar"><i style="width:${(r.average / 5) * 100}%;background:${scoreColor(r.average)}"></i></span>
            <b>${fmt(r.average)}</b>
          </li>`
        )
        .join("")}</ol>
      ${rank.length > 8 ? `<p class="muted small">+ ${rank.length - 8} til</p>` : ""}
      ${queued.length ? `<h3 class="queued-head">Står att</h3><ul class="queued">${queued.map((b) => `<li>${esc(b.name)}</li>`).join("")}</ul>` : ""}
    </div>

    <div class="card people">
      <h2>😇 Snillast → strengast 🧊</h2>
      <ul class="plist">${ps
        .map((p) => {
          const at = allTime[p.person]?.average;
          return `<li>
            <span class="nm">${esc(p.person)}</span>
            <span class="bar"><i style="width:${(p.average / 5) * 100}%;background:${scoreColor(p.average)}"></i>${
              at ? `<em class="marker" style="left:${(at / 5) * 100}%" title="Snitt alle år"></em>` : ""
            }</span>
            <b>${fmt(p.average)}</b>
          </li>`;
        })
        .join("")}</ul>
      <p class="muted small legend"><em class="marker static"></em> = eige snitt alle tidlegare år</p>
    </div>

    <div class="card shame">
      <h2>🙈 Skamtavla</h2>
      <table>
        <thead><tr><th></th>${CATEGORIES.map((cat) => `<th title="${esc(cat.label)}">${cat.icon}</th>`).join("")}${hasPulse ? "<th>❤️</th>" : ""}</tr></thead>
        <tbody>${s.participants
          .map(
            (p) => `<tr><th>${esc(p)}</th>${CATEGORIES.map((cat) => {
              const n = c[cat.id][p] ?? 0;
              return `<td class="${n && n === leaders[cat.id] ? "lead" : ""}">${n || "·"}</td>`;
            }).join("")}${hasPulse ? `<td>${pulse[p] ?? "·"}</td>` : ""}</tr>`
          )
          .join("")}</tbody>
      </table>
    </div>

    <div class="card trendcard">
      <h2>📈 Blir me snillare utover kvelden?</h2>
      ${trendSvg(s)}
    </div>

    <div class="card quotescard">
      <h2>💬 Sitat</h2>
      ${
        quotes.length
          ? `<ul class="qlist">${quotes
              .map((q) => `<li>«${esc(q.text)}»${q.person ? ` <span>– ${esc(q.person)}</span>` : ""}</li>`)
              .join("")}</ul>`
          : `<p class="muted">Ingen sitat enno. Kom igjen!</p>`
      }
    </div>
  </section>`;
}

function viewBeer(s, beer) {
  const idx = s.beers.indexOf(beer) + 1;
  const ch = beer.characteristics ?? {};
  const desc = [
    ["Farge", beer.color],
    ["Lukt", beer.smell],
    ["Smak", beer.taste],
  ].filter(([, v]) => v);
  const registered = s.participants.map((p) => [p, p in (beer.scores ?? {})]);
  const nReg = registered.filter(([, r]) => r).length;
  return `<section class="beer-view enter">
    <div class="beer-img">${bottle(beer, "big")}</div>
    <div class="beer-info">
      <p class="kicker">Øl ${idx} av ${s.beers.length}${brewer(beer) ? ` · ${esc(brewer(beer))}` : ""}</p>
      <h1>${esc(beer.name)}</h1>
      <div class="chips">${meta(beer)}</div>
      ${desc.length ? `<dl class="desc">${desc.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${
        ch.fylde != null || ch.friskhet != null || ch.bitterhet != null
          ? `<div class="scales">${scale("Fylde", ch.fylde)}${scale("Friskheit", ch.friskhet)}${scale("Bitterheit", ch.bitterhet)}</div>`
          : ""
      }
      ${beer.goodFor?.length ? `<p class="goodfor">Passar til: ${beer.goodFor.map(esc).join(", ")}</p>` : ""}
      ${previousChips(beer)}
      <div class="registered">
        <span class="reg-label">${nReg === s.participants.length ? "Alle har stemt – klar for avsløring!" : `Karakterar inne: ${nReg}/${s.participants.length}`}</span>
        ${registered.map(([p, r]) => `<span class="reg ${r ? "yes" : ""}">${r ? "✓" : "…"} ${esc(p)}</span>`).join("")}
      </div>
    </div>
  </section>`;
}

function viewReveal(s, beer) {
  const scores = s.participants.filter((p) => typeof beer.scores?.[p] === "number").map((p) => [p, beer.scores[p]]);
  const skipped = s.participants.filter((p) => beer.scores?.[p] === null);
  return `<section class="reveal">
    <header class="reveal-head">
      ${bottle(beer, "small")}
      <div><p class="kicker">Øl ${s.beers.indexOf(beer) + 1} av ${s.beers.length}</p><h1>${esc(beer.name)}</h1></div>
    </header>
    <div class="cards" style="--n:${Math.max(scores.length, 4)}">${scores
      .map(
        ([p, v]) => `<div class="flip" data-person="${esc(p)}"><div class="flip-inner">
          <div class="face front">?</div>
          <div class="face back" style="--c:${scoreColor(v)}">${fmt(v)}</div>
        </div><span class="flip-name">${esc(p)}</span></div>`
      )
      .join("")}</div>
    ${skipped.length ? `<p class="muted center">Smakte ikkje: ${skipped.map(esc).join(", ")}</p>` : ""}
    <div class="result" hidden>
      <div class="big-avg"><span id="avg-num">0,00</span><small>snitt</small></div>
      <div class="facts" id="facts"></div>
    </div>
  </section>`;
}

function runReveal(s, beer) {
  const cards = [...stage.querySelectorAll(".flip")];
  const step = cards.length > 8 ? 550 : 750;
  drumroll((cards.length * step) / 1000 + 0.6);
  cards.forEach((card, i) =>
    timers.push(
      setTimeout(() => {
        card.classList.add("flipped");
        flip();
      }, 600 + i * step)
    )
  );
  const finish = 600 + cards.length * step + 500;
  timers.push(
    setTimeout(() => {
      crash();
      const res = stage.querySelector(".result");
      res.hidden = false;
      const a = beerAverage(beer) ?? 0;
      const num = $("#avg-num");
      num.style.color = scoreColor(a);
      const t0 = performance.now();
      const anim = (t) => {
        const p = Math.min(1, (t - t0) / 1200);
        num.textContent = fmt(a * (1 - (1 - p) ** 3));
        if (p < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
      timers.push(setTimeout(() => showFacts(s, beer), 1400));
    }, finish)
  );
}

function showFacts(s, beer) {
  const o = beerOutliers(beer);
  const facts = [];
  const rank = ranking(s);
  const pos = rank.findIndex((r) => r.beer.id === beer.id) + 1;
  if (pos) facts.push(`<li>📊 Plass <b>${pos}</b> av ${rank.length} så langt i kveld</li>`);
  if (o && o.spread > 0) {
    facts.push(`<li>⬆️ Høgast: <b>${esc(o.highest[0])}</b> (${fmt(o.highest[1])})</li>`);
    facts.push(`<li>⬇️ Lågast: <b>${esc(o.lowest[0])}</b> (${fmt(o.lowest[1])})</li>`);
    if (Math.abs(o.contrarian[1] - o.average) >= 0.75)
      facts.push(`<li>🦄 Kontrær: <b>${esc(o.contrarian[0])}</b> – ${fmt(Math.abs(o.contrarian[1] - o.average))} frå snittet</li>`);
  } else if (o) {
    facts.push(`<li>🤝 Heilt einige – alle gav ${fmt(o.average)}!</li>`);
  }
  const before = findPrevious(beer, history);
  if (before.length) {
    const last = before[before.length - 1];
    const d = (beerAverage(beer) ?? 0) - last.average;
    facts.push(
      `<li>${d > 0.05 ? "📈" : d < -0.05 ? "📉" : "➡️"} I ${last.year}: ${fmt(last.average)} → i år ${fmt(beerAverage(beer))}</li>`
    );
  }
  const f = $("#facts");
  if (!f) return;
  f.innerHTML = `<ul>${facts.join("")}</ul>`;
  f.classList.add("show");
}

function viewAwards(s) {
  const list = awards(s);
  if (!list.length) return `<section class="message enter"><h1>Kåringane kjem …</h1></section>`;
  const i = Math.max(0, Math.min(list.length - 1, s.tv.awardIndex ?? 0));
  const a = list[i];
  return `<section class="award enter-pop">
    <p class="kicker">Kåring ${i + 1} av ${list.length}</p>
    <div class="award-icon">${a.icon}</div>
    <h1>${esc(a.title)}</h1>
    ${a.subtitle ? `<p class="sub">${esc(a.subtitle)}</p>` : ""}
    ${a.beers ? `<div class="award-bottles">${a.beers.map((b) => bottle(b, "big")).join("")}</div>` : ""}
    <div class="award-names">${a.names.map((n) => `<span>${esc(n)}</span>`).join("")}</div>
    <p class="award-value">${esc(a.value)}</p>
  </section>`;
}

const viewMessage = (s) => `<section class="message enter-pop"><h1>${esc(s.tv.message)}</h1></section>`;

// ---------- Render ----------

function render(s, status) {
  const conn = $("#conn");
  conn.hidden = !status?.error;
  conn.textContent = status?.error ?? "";
  if (!s) return;

  announce(s);

  const mode = s.tv?.mode ?? "dashboard";
  const beer = s.beers.find((b) => b.id === s.tv?.beerId) ?? s.beers.find((b) => b.id === s.currentBeerId);
  // Kva som må til for å starte visninga på nytt (med animasjon)
  const key =
    mode === "reveal" ? `reveal|${beer?.id}|${s.tv.seq}` :
    mode === "awards" ? `awards|${s.tv.awardIndex}|${s.tv.seq}` :
    mode === "message" ? `message|${s.tv.message}|${s.tv.seq}` :
    mode === "beer" ? `beer|${beer?.id}` : "dashboard";
  const fresh = key !== lastKey;

  if (mode === "reveal" && !fresh) return; // ikkje forstyrr avsløringa
  if (fresh) {
    timers.forEach(clearTimeout);
    timers = [];
  }

  let html;
  if (mode === "beer" && beer) html = viewBeer(s, beer);
  else if (mode === "reveal" && beer) html = viewReveal(s, beer);
  else if (mode === "awards") html = viewAwards(s);
  else if (mode === "message") html = viewMessage(s);
  else html = viewDashboard(s);

  if (!fresh) html = html.replace(/\benter(-soft|-pop)?\b/, ""); // ingen inngangsanimasjon ved små oppdateringar
  stage.innerHTML = html;
  stage.dataset.mode = mode;
  lastKey = key;

  if (fresh && mode === "reveal" && beer) runReveal(s, beer);
  if (fresh && mode === "awards") fanfare();
}

/** Nye hendingar og sitat dukkar opp som små varsel, uansett kva som blir vist. */
function announce(s) {
  if (prev) {
    const known = new Set(prev.incidents.map((i) => i.id));
    for (const i of s.incidents.filter((x) => !known.has(x.id))) {
      const c = categoryById[i.type];
      if (!c) continue;
      const n = s.incidents.filter((x) => x.type === i.type && x.person === i.person).length;
      showToast(`<span class="t-icon">${c.icon}</span><span><b>${esc((c.short ?? c.label).toUpperCase())}!</b> ${esc(i.person)} <small>(${n}. gong i kveld)</small></span>`);
      i.type === "toilet" ? ding() : boing();
    }
    const knownQ = new Set(prev.quotes.map((q) => q.id));
    for (const q of s.quotes.filter((x) => !knownQ.has(x.id))) {
      showToast(`<span class="t-icon">💬</span><span>«${esc(q.text)}»${q.person ? ` <small>– ${esc(q.person)}</small>` : ""}</span>`, 7000);
      ding();
    }
  }
  prev = structuredClone(s);
}

function showToast(html, ms = 5000) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = html;
  $("#toasts").append(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 600);
}

// ---------- Snø og lyd ----------

const snow = $(".snow");
for (let i = 0; i < 40; i++) {
  const f = document.createElement("i");
  f.style.left = `${Math.random() * 100}%`;
  f.style.animationDuration = `${10 + Math.random() * 18}s`;
  f.style.animationDelay = `${-Math.random() * 25}s`;
  f.style.setProperty("--s", `${0.3 + Math.random() * 0.7}`);
  f.style.setProperty("--drift", `${(Math.random() - 0.5) * 12}vw`);
  snow.append(f);
}

$("#sound").addEventListener("click", (e) => {
  e.currentTarget.textContent = toggleSound() ? "🔊" : "🔇";
});

// Dobbeltklikk = fullskjerm
document.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// ---------- Oppstart ----------

store.subscribe(render);
[history, { people }] = await Promise.all([loadHistory(year), loadPeople()]);
allTime = allTimePersonAverages(history);
try {
  await store.load({ create: false });
  render(store.state, store.status);
} catch {
  stage.innerHTML = `<section class="message"><h1>Ventar på registreringa …</h1><p class="sub">Opne registreringssida først.</p></section>`;
}
store.live();
// Oppdater klokka/visinga av og til (t.d. tidsavhengige ting)
setInterval(() => store.state && lastKey === "dashboard" && render(store.state, store.status), 60_000);
