import { createStore, currentYear } from "./store.js";
import { loadHistory, loadPeople, findPrevious, imageUrl, DATA } from "./data.js";
import {
  CATEGORIES, categoryById, beerAverage, givenScores, doneBeers, ranking, personStats, counts,
  beerOutliers, trend, awards, allTimePersonAverages, fmt, clock, minutesSincePrevious, tempo, checkedIn,
  pulseRounds, pulseChanges, pulseGuesses, latestPulse,
} from "./stats.js";
import { toggleSound, crash, ding, boing, fanfare } from "./sound.js";

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
let lastGiven = new Set(); // «øl|person» som alt viste karakter – berre nye brikker skal sprette inn
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
  // Vis klokkeslett under punkta – men ikkje fleire enn det er plass til
  const every = Math.ceil(n / 7);
  const labels = t
    .map((r, i) =>
      i % every === 0 || i === n - 1
        ? `<span style="left:${(x(i) / W) * 100}%">${clock(r.beer.startedAt)}</span>`
        : ""
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="trend" preserveAspectRatio="none">
      <line x1="${x(0)}" x2="${x(n - 1)}" y1="${y(my - slope * mx)}" y2="${y(my + slope * mx)}" class="trend-fit"/>
      <polyline points="${t.map((r, i) => `${x(i)},${y(r.average)}`).join(" ")}" class="trend-line"/>
      ${t.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.average)}" r="6" style="fill:${scoreColor(r.average)}"/>`).join("")}
    </svg><div class="trend-times">${labels}</div><p class="verdict">${verdict}</p>`;
}

const TOP_N = 8;
const BOTTOM_N = 3;

function rankRow(r, pos, total) {
  const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos === total && total > 3 ? "🪣" : pos;
  return `<li class="${pos === 1 ? "first" : ""}">
    <span class="pos">${medal}</span>
    ${bottle(r.beer, "mini")}
    <span class="nm">${esc(r.beer.name)}</span>
    <span class="tm">${clock(r.beer.startedAt)}</span>
    <span class="bar"><i style="width:${(r.average / 5) * 100}%;background:${scoreColor(r.average)}"></i></span>
    <b>${fmt(r.average)}</b>
  </li>`;
}

/** Topp 8 – og når lista er lang: dei 3 dårlegaste under ein strek. */
function toplist(rank) {
  const total = rank.length;
  if (total <= TOP_N + BOTTOM_N) return `<ol class="toplist ${total > TOP_N ? "compact" : ""}">${rank.map((r, i) => rankRow(r, i + 1, total)).join("")}</ol>`;
  const hidden = total - TOP_N - BOTTOM_N;
  return `<ol class="toplist compact">${rank.slice(0, TOP_N).map((r, i) => rankRow(r, i + 1, total)).join("")}</ol>
    <p class="toplist-gap">··· ${hidden} øl i midten ··· <span>🪣 Botnen</span></p>
    <ol class="toplist compact bottom">${rank.slice(-BOTTOM_N).map((r, i) => rankRow(r, total - BOTTOM_N + i + 1, total)).join("")}</ol>`;
}

// ---------- Heile lista: alle øla rangerte, i kolonner ----------

function viewRanking(s) {
  const rank = ranking(s);
  if (!rank.length) return `<section class="message enter"><h1>Rangeringa kjem når første øl er ferdig</h1></section>`;
  const total = rank.length;
  const cols = total <= 12 ? 1 : total <= 30 ? 2 : 3;
  const rows = Math.ceil(total / cols);
  const left = s.beers.filter((b) => b.status !== "done").length;
  return `<section class="ranking enter">
    <header class="ranking-head">
      <h1>📋 Kveldens rangering</h1>
      <p class="sub">${total} øl smakte${left ? ` · ${left} står att` : ""}</p>
    </header>
    <ol class="ranking-list" data-cols="${cols}" style="--cols:${cols};--rows:${rows}">${rank.map((r, i) => rankRow(r, i + 1, total).replace("<li", `<li style="--i:${i}"`)).join("")}</ol>
  </section>`;
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
  const pulse = latestPulse(s);
  const hasPulse = Object.keys(pulse).length > 0;

  const quotes = s.quotes.slice(-3).reverse();
  // Lang toppliste (topp + botn) tek plass – då viser me færre i «Står att»
  const queued = s.beers.filter((b) => b.status !== "done").slice(0, rank.length > 8 ? 3 : 6);
  const queuedMore = s.beers.filter((b) => b.status !== "done").length - queued.length;
  const started = checkedIn(s);
  const pace = tempo(s);

  return `<section class="dash enter-soft">
    <header class="dash-head">
      <h1>Joleølsmaking ${year}</h1>
      <div class="dash-stats">
        <span><b>${total}</b>/${s.beers.length} øl</span>
        ${started.length ? `<span>Første øl <b>${clock(started[0].startedAt)}</b></span>` : ""}
        ${pace ? `<span>Tempo <b>${pace}</b> min/øl</span>` : ""}
        <span>Kveldens snitt <b>${fmt(nightAvg)}</b>${lastYearAvg ? ` <small>(i fjor ${fmt(lastYearAvg)})</small>` : ""}</span>
      </div>
    </header>

    <div class="card top">
      <h2>🏆 Topplista</h2>
      ${toplist(rank)}
      ${queued.length ? `<h3 class="queued-head">Står att${queuedMore > 0 ? ` (${queued.length + queuedMore})` : ""}</h3><ul class="queued">${queued
        .map((b) =>
          b.startedAt
            ? `<li class="now">${esc(b.name)} <span>sjekka inn ${clock(b.startedAt)}</span></li>`
            : `<li>${esc(b.name)}</li>`
        )
        .join("")}</ul>` : ""}
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

function checkinBadge(s, beer) {
  if (!beer.startedAt) return "";
  const since = minutesSincePrevious(s, beer);
  return `<div class="checkin"><span class="checkin-icon">🕰️</span><span>Sjekka inn <b>${clock(beer.startedAt)}</b>${
    since != null ? `<small>${since} min etter førre øl</small>` : `<small>Kveldens første øl!</small>`
  }</span></div>`;
}

const scoreText = (v) => (v === null ? "–" : v === undefined ? "…" : fmt(v));

function scoreTiles(s, beer) {
  const people = s.participants;
  return `<div class="tiles" style="--n:${Math.max(people.length, 4)}">${people
    .map((p) => {
      const v = beer.scores?.[p];
      const state = typeof v === "number" ? "given" : v === null ? "skipped" : "waiting";
      return `<div class="tile ${state}" data-person="${esc(p)}" ${state === "given" ? `style="--c:${scoreColor(v)}"` : ""}>
        <span class="tile-score">${scoreText(v)}</span><span class="tile-name">${esc(p)}</span></div>`;
    })
    .join("")}</div>`;
}

function viewBeer(s, beer) {
  const idx = s.beers.indexOf(beer) + 1;
  const ch = beer.characteristics ?? {};
  const desc = [
    ["Farge", beer.color],
    ["Lukt", beer.smell],
    ["Smak", beer.taste],
  ].filter(([, v]) => v);
  const nReg = s.participants.filter((p) => p in (beer.scores ?? {})).length;
  return `<section class="beer-view enter">
    <div class="beer-img">${bottle(beer, "big")}</div>
    <div class="beer-info">
      <div class="beer-top">
        <p class="kicker">Øl ${idx} av ${s.beers.length}${brewer(beer) ? ` · ${esc(brewer(beer))}` : ""}</p>
        ${checkinBadge(s, beer)}
      </div>
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
      <p class="reg-label">Karakterar inne: ${nReg}/${s.participants.length} – oppsummeringa kjem når alle har stemt</p>
      ${scoreTiles(s, beer)}
    </div>
  </section>`;
}

function facts(s, beer) {
  const o = beerOutliers(beer);
  const out = [];
  const rank = ranking(s);
  const pos = rank.findIndex((r) => r.beer.id === beer.id) + 1;
  if (pos) out.push(`📊 Plass <b>${pos}</b> av ${rank.length} så langt i kveld`);
  if (o && o.spread > 0) {
    out.push(`😇 Snillast: <b>${esc(o.highest[0])}</b> (${fmt(o.highest[1])})`);
    out.push(`🧊 Strengast: <b>${esc(o.lowest[0])}</b> (${fmt(o.lowest[1])})`);
    if (Math.abs(o.contrarian[1] - o.average) >= 0.75)
      out.push(`🦄 Kontrær: <b>${esc(o.contrarian[0])}</b> – ${fmt(Math.abs(o.contrarian[1] - o.average))} frå snittet`);
  } else if (o) {
    out.push(`🤝 Heilt einige – alle gav ${fmt(o.average)}!`);
  }
  const before = findPrevious(beer, history);
  if (before.length) {
    const last = before[before.length - 1];
    const d = (beerAverage(beer) ?? 0) - last.average;
    out.push(`${d > 0.05 ? "📈" : d < -0.05 ? "📉" : "➡️"} I ${last.year}: ${fmt(last.average)} → i år ${fmt(beerAverage(beer))}`);
  }
  const missing = s.participants.filter((p) => !(p in (beer.scores ?? {})));
  if (missing.length) out.push(`⏳ Manglar framleis: ${missing.map(esc).join(", ")}`);
  return out.map((f, i) => `<li style="--i:${i}">${f}</li>`).join("");
}

/** Oppsummering når alle har stemt: alle karakterane, snittet og kven som skilde seg ut. */
function viewResult(s, beer) {
  const a = beerAverage(beer);
  return `<section class="result-view enter">
    <header class="reveal-head">
      ${bottle(beer, "small")}
      <div>
        <p class="kicker">Øl ${s.beers.indexOf(beer) + 1} av ${s.beers.length}${beer.startedAt ? ` · sjekka inn ${clock(beer.startedAt)}` : ""}</p>
        <h1>${esc(beer.name)}</h1>
      </div>
    </header>
    ${scoreTiles(s, beer)}
    <div class="result">
      <div class="big-avg"><span style="color:${scoreColor(a)}">${fmt(a)}</span><small>snitt</small></div>
      <ul class="facts">${facts(s, beer)}</ul>
    </div>
  </section>`;
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

// ---------- Tidslinje: alle øla i rekkjefølgje, med sitat og hendingar ----------

const TIMELINE_PER_PAGE = 4;
const TIMELINE_PAGE_MS = 12_000;

function timelinePage(s) {
  const pages = Math.max(1, Math.ceil(checkedIn(s).length / TIMELINE_PER_PAGE));
  return { pages, page: Math.floor(Date.now() / TIMELINE_PAGE_MS) % pages };
}

function viewTimeline(s) {
  const list = checkedIn(s);
  if (!list.length) return `<section class="message enter"><h1>Tidslinja startar når første øl er sjekka inn</h1></section>`;
  const { pages, page } = timelinePage(s);
  const slice = list.slice(page * TIMELINE_PER_PAGE, (page + 1) * TIMELINE_PER_PAGE);
  const loose = s.quotes.filter((q) => !q.beerId);

  const col = (b) => {
    const i = list.indexOf(b);
    const a = beerAverage(b);
    const done = b.status === "done";
    const quotes = s.quotes.filter((q) => q.beerId === b.id);
    const shown = quotes.slice(-3);
    const inc = s.incidents.filter((x) => x.beerId === b.id);
    const since = minutesSincePrevious(s, b);
    return `<article class="tl-col ${b.id === s.currentBeerId && !done ? "now" : ""}">
      <div class="tl-dot"></div>
      <div class="tl-time">${clock(b.startedAt)}${since != null ? `<small>+${since} min</small>` : `<small>start</small>`}</div>
      <div class="tl-card">
        <div class="tl-head">
          ${bottle(b, "tl")}
          <div class="tl-title">
            <span class="tl-num">Øl ${i + 1}</span>
            <h3>${esc(b.name)}</h3>
          </div>
        </div>
        <div class="tl-score">${
          done && a != null
            ? `<b style="color:${scoreColor(a)}">${fmt(a)}</b><span>snitt</span>`
            : `<span class="tl-pending">🍺 smakar no …</span>`
        }</div>
        ${
          shown.length
            ? `<ul class="tl-quotes">${shown
                .map((q) => `<li>«${esc(q.text)}»${q.person ? `<span>– ${esc(q.person)}</span>` : ""}</li>`)
                .join("")}</ul>${quotes.length > shown.length ? `<p class="tl-more">+ ${quotes.length - shown.length} sitat til</p>` : ""}`
            : `<p class="tl-empty">Ingen sitat</p>`
        }
        ${
          inc.length
            ? `<div class="tl-inc">${inc
                .map((x) => `<span title="${esc(categoryById[x.type]?.label ?? x.type)}">${categoryById[x.type]?.icon ?? "•"} ${esc(x.person)}</span>`)
                .join("")}</div>`
            : ""
        }
      </div>
    </article>`;
  };

  return `<section class="timeline enter">
    <header class="tl-header">
      <h1>Kveldens tidslinje</h1>
      <div class="tl-meta">${
        pages > 1 ? `<span class="tl-pages">${Array.from({ length: pages }, (_, p) => `<i class="${p === page ? "on" : ""}"></i>`).join("")}</span>` : ""
      }<span>${list.length} øl sidan ${clock(list[0].startedAt)}</span></div>
    </header>
    <div class="tl-track" style="--cols:${TIMELINE_PER_PAGE}">${slice.map(col).join("")}</div>
    ${
      loose.length
        ? `<p class="tl-loose">💬 ${loose.slice(-2).map((q) => `«${esc(q.text)}»${q.person ? ` – ${esc(q.person)}` : ""}`).join("  ·  ")}</p>`
        : ""
    }
  </section>`;
}

// ---------- Puls ----------

/** Farge for puls: roleg grøn (≤ 60) via gull til raud (≥ 130). */
function pulseColor(bpm) {
  const t = Math.max(0, Math.min(1, (bpm - 60) / 70));
  return scoreColor(5 - t * 4.2);
}

/** Pulsen i fjor (frå historikken), om personen var med. */
function lastYearPulse(person) {
  const y = history.find((h) => h.year === year - 1);
  return y?.categories?.pulse?.counts?.[person] ?? null;
}

function viewPulse(s) {
  const rounds = pulseRounds(s);
  const round = rounds.find((r) => r.id === s.tv.pulseRoundId) ?? rounds[rounds.length - 1];
  if (!round) return `<section class="message enter"><h1>❤️ Pulsmåling kjem …</h1></section>`;
  const first = rounds[0];
  const isFirst = round.id === first.id;
  const n = s.participants.filter((p) => typeof round.values?.[p] === "number").length;

  const tiles = s.participants
    .map((p) => {
      const v = round.values?.[p];
      if (typeof v !== "number")
        return `<div class="tile waiting" data-person="${esc(p)}"><span class="tile-score">…</span><span class="tile-name">${esc(p)}</span></div>`;
      const start = first.values?.[p];
      const ly = lastYearPulse(p);
      const sub = !isFirst && typeof start === "number"
        ? `<span class="tile-sub">${v - start >= 0 ? "▲" : "▼"} ${v - start >= 0 ? "+" : ""}${v - start} (${fmt(((v - start) / start) * 100, 0)} %)</span>`
        : ly ? `<span class="tile-sub">i fjor ${ly}</span>` : "";
      return `<div class="tile given" data-person="${esc(p)}" style="--c:${pulseColor(v)}">
        <span class="tile-score">${v}</span><span class="tile-name">${esc(p)}</span>${sub}</div>`;
    })
    .join("");

  // Etter første runde: kven har auka mest – og tippekonkurransen
  const changes = isFirst ? [] : pulseChanges({ ...s, pulse: { ...s.pulse, rounds: rounds.filter((r) => Date.parse(r.at) <= Date.parse(round.at)) } });
  const maxPct = Math.max(1, ...changes.map((c) => Math.abs(c.pct)));
  const isLast = round.id === rounds[rounds.length - 1].id;
  const guesses = !isFirst && isLast ? pulseGuesses(s) : [];

  return `<section class="pulse-view enter">
    <header class="pulse-head">
      <span class="heart">❤️</span>
      <div><p class="kicker">Pulsmåling · ${clock(round.at)}</p><h1>${esc(round.label)}</h1></div>
      <p class="pulse-count">${n}/${s.participants.length} målt</p>
    </header>
    <div class="tiles pulse-tiles" style="--n:${Math.max(s.participants.length, 4)}">${tiles}</div>
    ${
      changes.length || guesses.length
        ? `<div class="pulse-bottom">
        ${
          changes.length
            ? `<div class="card"><h2>📈 Størst auke sidan «${esc(first.label)}»</h2><ul class="pchange">${changes
                .map(
                  (c, i) => `<li style="--i:${i}"><span class="nm">${esc(c.person)}</span>
                  <span class="bar"><i style="width:${(Math.max(0, c.pct) / maxPct) * 100}%;background:${pulseColor(c.end)}"></i></span>
                  <b>${c.start} → ${c.end}</b><span class="pct">${c.pct >= 0 ? "+" : ""}${fmt(c.pct, 0)} %</span></li>`
                )
                .join("")}</ul></div>`
            : ""
        }
        ${
          guesses.length
            ? `<div class="card"><h2>🎯 Tippekonkurransen</h2><ul class="pguess">${guesses
                .map(
                  (g, i) => `<li class="${i === 0 ? "win" : ""}"><span class="nm">${i === 0 ? "🏆 " : ""}${esc(g.person)}</span>
                  <span>tippa ${g.guess}, fekk ${g.actual}</span><b>${g.off === 0 ? "BLINK!" : `± ${g.off}`}</b></li>`
                )
                .join("")}</ul></div>`
            : ""
        }
      </div>`
        : ""
    }
  </section>`;
}

// ---------- Video ----------

let player = null; // { toggle(), destroy() } for videoen som spelar no
let endedSeq = null; // seq for ein video som er ferdig – då viser me oversikta til sjefen gjer noko anna
let lastVideoCmd = null;
let ytApi = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytApi ??= new Promise((resolve, reject) => {
    const fail = (why) => {
      ytApi = null;
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("timeout"), 8000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      resolve(window.YT);
    };
    const sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    sc.onerror = () => {
      clearTimeout(timer);
      sc.remove();
      fail("offline");
    };
    document.head.append(sc);
  });
  return ytApi;
}

const viewVideo = (s) => `<section class="video-view enter-soft">
  <div class="video-frame" id="video-frame"></div>
  <p class="video-title">🎬 ${esc(s.tv.video?.title ?? "")}</p>
</section>`;

function startVideo(s) {
  const v = s.tv.video;
  const seq = s.tv.seq;
  const frame = $("#video-frame");
  const stillCurrent = () => store.state?.tv?.seq === seq;
  const ended = () => {
    if (!stillCurrent()) return;
    endedSeq = seq;
    render(store.state, store.status);
  };
  const fail = (msg) => {
    if (stillCurrent()) frame.innerHTML = `<div class="video-error">📡 ${esc(msg)}</div>`;
  };

  const youtube = async () => {
    if (!v.youtube) return fail(`Fann ikkje videofila «${v.file}» i data/videos/.`);
    try {
      const YT = await loadYouTubeApi();
      if (!stillCurrent()) return;
      const host = document.createElement("div");
      frame.append(host);
      const p = new YT.Player(host, {
        videoId: v.youtube,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, start: v.start || 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => e.target.playVideo(),
          onStateChange: (e) => e.data === YT.PlayerState.ENDED && ended(),
          onError: () => fail("YouTube ville ikkje spele denne videoen (kan vere sperra for innbygging)."),
        },
      });
      player = {
        toggle: () => (p.getPlayerState?.() === YT.PlayerState.PLAYING ? p.pauseVideo() : p.playVideo()),
        destroy: () => p.destroy?.(),
      };
    } catch {
      fail("Ingen kontakt med YouTube. Slå på hotspot på PC-en, eller legg videoen som fil i data/videos/.");
    }
  };

  if (v.file) {
    const el = document.createElement("video");
    el.src = `${DATA}/videos/${encodeURIComponent(v.file)}`;
    el.playsInline = true;
    el.onloadedmetadata = () => {
      if (v.start) el.currentTime = v.start;
      el.play().catch(() => fail("Nettlesaren stoppa avspelinga – klikk ein gong i dette vindauget og prøv igjen."));
    };
    el.onended = ended;
    el.onerror = () => {
      el.remove();
      youtube(); // fila manglar: prøv YouTube i staden
    };
    frame.append(el);
    player = {
      toggle: () => (el.paused ? el.play() : el.pause()),
      destroy: () => {
        el.pause();
        el.removeAttribute("src");
        el.load();
      },
    };
  } else {
    youtube();
  }
}

const viewMessage = (s) => `<section class="message enter-pop"><h1>${esc(s.tv.message)}</h1></section>`;

// ---------- Render ----------

function render(s, status) {
  const conn = $("#conn");
  conn.hidden = !status?.error;
  conn.textContent = status?.error ?? "";
  if (!s) return;

  announce(s);

  let mode = s.tv?.mode ?? "dashboard";
  if (mode === "reveal") mode = "beer"; // eldre tilstand frå før avsløringa vart fjerna
  if (mode === "video" && (!s.tv.video || endedSeq === s.tv.seq)) mode = "dashboard";
  const beer = s.beers.find((b) => b.id === s.tv?.beerId) ?? s.beers.find((b) => b.id === s.currentBeerId);
  const done = beer?.status === "done";
  // Kva som må til for å starte visninga på nytt (med animasjon)
  const key =
    mode === "awards" ? `awards|${s.tv.awardIndex}|${s.tv.seq}` :
    mode === "message" ? `message|${s.tv.message}|${s.tv.seq}` :
    mode === "timeline" ? `timeline|${timelinePage(s).page}` :
    mode === "video" ? `video|${s.tv.seq}` :
    mode === "pulse" ? `pulse|${s.tv.pulseRoundId}` :
    mode === "ranking" ? "ranking" :
    mode === "beer" ? `beer|${beer?.id}|${done ? "result" : "live"}` : "dashboard";
  const fresh = key !== lastKey;

  if (mode === "video" && !fresh) {
    // Ikkje teikn på nytt (då startar videoen om att) – berre ta imot pause/spel frå sjefen
    const n = s.tv.videoCmd?.n ?? null;
    if (n !== lastVideoCmd) {
      lastVideoCmd = n;
      player?.toggle();
    }
    return;
  }
  if (fresh && player) {
    player.destroy();
    player = null;
  }

  let html;
  if (mode === "beer" && beer) html = done ? viewResult(s, beer) : viewBeer(s, beer);
  else if (mode === "awards") html = viewAwards(s);
  else if (mode === "timeline") html = viewTimeline(s);
  else if (mode === "video") html = viewVideo(s);
  else if (mode === "pulse") html = viewPulse(s);
  else if (mode === "ranking") html = viewRanking(s);
  else if (mode === "message") html = viewMessage(s);
  else html = viewDashboard(s);

  if (!fresh) html = html.replace(/\benter(-soft|-pop)?\b/, ""); // ingen inngangsanimasjon ved små oppdateringar
  const wasLive = lastKey === `beer|${beer?.id}|live`;
  stage.innerHTML = html;
  stage.dataset.mode = mode;
  lastKey = key;

  const given = new Set();
  for (const t of stage.querySelectorAll(".tile.given")) {
    const k = `${mode === "pulse" ? s.tv.pulseRoundId : beer?.id}|${t.dataset.person}`;
    given.add(k);
    if (!fresh && !lastGiven.has(k)) t.classList.add("new");
  }
  lastGiven = given;

  if (fresh && mode === "beer" && done && wasLive) crash(); // siste karakter kom inn
  if (fresh && mode === "awards") fanfare();
  if (fresh && mode === "video") {
    lastVideoCmd = s.tv.videoCmd?.n ?? null;
    startVideo(s);
  }
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
  const box = $("#toasts");
  box.append(el);
  // Aldri meir enn 3 varsel samstundes – dei eldste forsvinn først
  while (box.children.length > 3) box.firstElementChild.remove();
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
// Tidslinja blar sjølv vidare til neste side
setInterval(() => store.state && lastKey?.startsWith("timeline") && render(store.state, store.status), 1000);
