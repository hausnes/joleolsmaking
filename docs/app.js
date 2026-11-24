/* Joleølsmakinga – oppsummeringsside. Les data.json (laga av scripts/build_site.mjs). */
(() => {
  "use strict";

  // ---------- Hjelparar ----------
  const $ = (s) => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const nf = (x, d = 2) => (x == null ? "–" : x.toLocaleString("nn-NO", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const int = (x) => Math.round(x).toLocaleString("nn-NO");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const clock = (m) => {
    const h = Math.floor(m / 60) % 24;
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const COLORS = ["#f2c14e", "#ff6b5e", "#8fe0b0", "#8ab6ff", "#e79cff", "#ffa94d", "#5ad1d1", "#f7f1e3", "#b5e86b", "#ff8fb1"];

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(container, w, h) {
    container.innerHTML = "";
    const s = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });
    container.appendChild(s);
    return s;
  }
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  function text(s, x, y, str, attrs = {}) {
    const t = el("text", { x, y, ...attrs }, s);
    t.textContent = str;
    return t;
  }

  // Tooltip
  const tip = $("#tip");
  function bindTip(node, html) {
    const show = (e) => {
      tip.innerHTML = html;
      tip.classList.add("on");
      move(e);
    };
    const move = (e) => {
      const p = e.touches ? e.touches[0] : e;
      const r = tip.getBoundingClientRect();
      let x = p.clientX + 14, y = p.clientY + 14;
      if (x + r.width > innerWidth - 8) x = p.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = p.clientY - r.height - 14;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    node.addEventListener("mouseenter", show);
    node.addEventListener("mousemove", move);
    node.addEventListener("mouseleave", () => tip.classList.remove("on"));
    node.addEventListener("touchstart", show, { passive: true });
    node.style.cursor = "pointer";
  }
  document.addEventListener("touchstart", (e) => {
    if (!(e.target instanceof SVGElement)) tip.classList.remove("on");
  }, { passive: true });

  // ---------- Snø ----------
  function snow() {
    const c = $("#snow");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d");
    let W, H, flakes;
    const resize = () => {
      W = c.width = innerWidth * devicePixelRatio;
      H = c.height = innerHeight * devicePixelRatio;
      flakes = Array.from({ length: Math.min(140, Math.round(innerWidth / 9)) }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 2.2 + 0.6) * devicePixelRatio,
        s: Math.random() * 0.6 + 0.25, d: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    addEventListener("resize", resize);
    (function tick(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (const f of flakes) {
        f.y += f.s * devicePixelRatio;
        f.x += Math.sin(t / 1600 + f.d) * 0.35 * devicePixelRatio;
        if (f.y > H) { f.y = -5; f.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    })(0);
  }

  // ---------- Hovud ----------
  fetch("data.json")
    .then((r) => r.json())
    .then(render)
    .catch((e) => {
      document.querySelector("main").innerHTML = `<p class="note">Klarte ikkje å laste data.json (${esc(e.message)}).</p>`;
    });
  snow();

  function render(D) {
    const beers = D.beers.filter((b) => b.avg != null);
    const allScores = D.beers.flatMap((b) => Object.values(b.scores));
    const evTotal = (k) => sum(Object.values(D.events[k] ?? {}).flatMap((m) => Object.values(m)));
    const yearByNum = Object.fromEntries(D.years.map((y) => [y.year, y]));
    $("#gen").textContent = D.generated;

    // ----- Teljarar -----
    const counters = [
      [D.years.length, "kveldar"],
      [D.beers.length, "juleøl smakt"],
      [allScores.length, "karakterar gitt"],
      [D.people.length, "smakarar"],
      [new Set(D.beers.map((b) => b.brewery).filter(Boolean)).size, "bryggeri"],
      [evTotal("toilet"), "dobesøk loggført"],
    ];
    $("#counters").innerHTML = counters
      .map(([n, l]) => `<div class="counter"><b data-n="${n}">0</b><span>${l}</span></div>`)
      .join("");
    document.querySelectorAll(".counter b").forEach((b) => {
      const n = +b.dataset.n, t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1600);
        b.textContent = int(n * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    // ----- Julekalender -----
    const DECO = ["🎄", "⭐", "🔔", "🎁", "❄️", "🕯️", "🦌", "🍪", "🧦", "☃️", "🎅", "🌟", "🍺"];
    const advent = $("#advent");
    D.years.forEach((y, i) => {
      const b = document.createElement("button");
      b.className = "door";
      b.innerHTML = `<span class="deco">${DECO[i % DECO.length]}</span><span class="yr">${y.year}</span>
        <span class="meta"><b>${y.nBeers}</b> øl · <b>${y.participants.length}</b> smakarar<br>snitt <b>${nf(y.avg)}</b></span>`;
      b.addEventListener("click", () => openYear(y.year, b));
      advent.appendChild(b);
    });
    if (D.lineupNext) {
      const d = document.createElement("div");
      d.className = "door locked";
      d.innerHTML = `<span class="deco">🔒</span><span class="yr">${D.lineupNext.year}</span>
        <span class="meta"><b>${D.lineupNext.nBeers}</b> øl står klare<br>Opnar snart …</span>`;
      advent.appendChild(d);
    }
    function openYear(year, door) {
      document.querySelectorAll(".door").forEach((d) => d.classList.toggle("open", d === door));
      const y = yearByNum[year];
      const list = D.beers.filter((b) => b.y === year).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      const ev = Object.entries(D.events)
        .filter(([, byY]) => byY[year])
        .map(([k, byY]) => {
          const m = byY[year], tot = sum(Object.values(m));
          const [who, n] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
          return k === "pulse"
            ? `<li>❤️ Pulsrekord: <b>${esc(who)}</b> med ${n} slag/min</li>`
            : `<li>${D.catLabels[k]}: <b>${int(tot)}</b>${n > 0 ? ` (flest: ${esc(who)}, ${int(n)})` : ""}</li>`;
        });
      const det = $("#yearDetail");
      det.hidden = false;
      det.innerHTML = `
        <div class="yd-head"><h3>${year}</h3>
          <span class="small">${y.nBeers} øl · snitt ${nf(y.avg)}${y.start ? ` · ${clock(y.start)}–${clock(y.end)}` : ""}${y.homeCount ? ` · ${y.homeCount} heimabrygg` : ""}</span></div>
        <div class="yd-grid">
          <div><h4>Rundt bordet</h4><div class="pills">${y.participants.map((p) => `<span class="pill">${esc(p)}</span>`).join("")}</div>
            ${ev.length ? `<h4 style="margin-top:1rem">Kaos</h4><ul class="small" style="padding-left:1.1rem;margin:0">${ev.join("")}</ul>` : ""}</div>
          <div><h4>Pallen</h4><ol class="ranklist">${y.top.map((b, i) => `<li><div class="row"><span class="nm">${["🥇", "🥈", "🥉"][i]} ${esc(b.name)}</span><span class="sc">${nf(b.avg)}</span></div></li>`).join("")}</ol>
            <h4 style="margin-top:1rem">Botnen</h4><ol class="ranklist bucket"><li><div class="row"><span class="nm">🪣 ${esc(y.bottom.name)}</span><span class="sc">${nf(y.bottom.avg)}</span></div></li></ol></div>
        </div>
        <h4 style="margin-top:1.2rem">Alle øla, rangert</h4>
        <ol class="yd-beers">${list.map((b) => `<li><b>${esc(b.name)}</b> ${nf(b.avg)}${b.home ? " 🏡" : ""}</li>`).join("")}</ol>`;
      det.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ----- Utvikling per år -----
    {
      const W = 900, H = 340, m = { l: 44, r: 44, t: 20, b: 34 };
      const s = svg($("#chartYears"), W, H);
      const ys = D.years;
      const x = scale(0, ys.length - 1, m.l + 20, W - m.r - 20);
      const yA = scale(2.6, 4.0, H - m.b, m.t);
      const yN = scale(0, 35, H - m.b, m.t);
      const g = el("g", { class: "grid" }, s);
      for (let v = 2.6; v <= 4.01; v += 0.2) {
        el("line", { x1: m.l, x2: W - m.r, y1: yA(v), y2: yA(v) }, g);
        text(s, m.l - 8, yA(v) + 4, nf(v, 1), { "text-anchor": "end" });
      }
      ys.forEach((y, i) => {
        const bw = 26;
        const r = el("rect", { x: x(i) - bw / 2, y: yN(y.nBeers), width: bw, height: H - m.b - yN(y.nBeers), rx: 5, fill: "rgba(63,166,107,0.35)" }, s);
        bindTip(r, `<b>${y.year}</b><br>${y.nBeers} øl, ${y.participants.length} smakarar`);
        text(s, x(i), H - m.b + 18, String(y.year).slice(2).padStart(3, "’"), { "text-anchor": "middle" });
        text(s, x(i), yN(y.nBeers) - 5, y.nBeers, { "text-anchor": "middle", "font-size": 10, fill: "#8fe0b0" });
      });
      const d = ys.map((y, i) => `${i ? "L" : "M"}${x(i)},${yA(y.avg)}`).join("");
      const path = el("path", { d, fill: "none", stroke: "#f2c14e", "stroke-width": 3, "stroke-linejoin": "round" }, s);
      const len = 2000;
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.style.transition = "stroke-dashoffset 2s ease-out";
      onVisible($("#chartYears"), () => (path.style.strokeDashoffset = 0));
      ys.forEach((y, i) => {
        const c = el("circle", { cx: x(i), cy: yA(y.avg), r: 6, fill: "#08130e", stroke: "#f2c14e", "stroke-width": 3 }, s);
        bindTip(c, `<b>${y.year}</b><br>Snitt ${nf(y.avg)}<br>Vinnar: ${esc(y.top[0].name)} (${nf(y.top[0].avg)})`);
      });
      text(s, W - m.r + 8, yN(30) + 4, "øl", { fill: "#8fe0b0" });
      const best = [...ys].sort((a, b) => b.avg - a.avg)[0], worst = [...ys].sort((a, b) => a.avg - b.avg)[0];
      const most = [...ys].sort((a, b) => b.nBeers - a.nBeers)[0];
      $("#yearsNote").innerHTML = `Beste årgang: <b>${best.year}</b> (snitt ${nf(best.avg)}). Tyngste år: <b>${worst.year}</b> (${nf(worst.avg)}).
        Flest øl: <b>${most.year}</b> med heile ${most.nBeers} stykk.`;
    }

    // ----- Hall of Fame -----
    const sorted = [...beers].sort((a, b) => b.avg - a.avg);
    const li = (b) => `<li><div class="row"><span class="nm">${esc(b.name)} <span class="y">${b.y}${b.home ? " · 🏡" : ""}</span></span><span class="sc">${nf(b.avg)}</span></div></li>`;
    const [p1, p2, p3] = sorted;
    $("#podium").innerHTML = [[p2, "s2", "🥈", 2], [p1, "s1", "🥇", 1], [p3, "s3", "🥉", 3]]
      .map(([b, c, m, n]) => `<div class="step ${c}"><div class="who"><span class="medal">${m}</span>${esc(b.name)}<div class="yr">${b.y}</div></div><div class="block">${nf(b.avg)}</div></div>`)
      .join("");
    $("#top10").innerHTML = sorted.slice(3, 13).map(li).join("");
    $("#top10").start = 4;
    $("#bottom5").innerHTML = sorted.slice(-5).reverse().map(li).join("");

    // ----- Gjengangarar -----
    {
      const rec = D.recurring;
      const on = new Set(rec.filter((r) => /Kinn Julefred|Hansa Julebrygg|Ægir Ylir|Nøgne Ø God Jul/.test(r.label)).map((r) => r.key));
      const color = Object.fromEntries(rec.map((r, i) => [r.key, COLORS[i % COLORS.length]]));
      const chips = $("#recurringChips");
      rec.forEach((r) => {
        const b = document.createElement("button");
        b.className = "chip" + (on.has(r.key) ? " on" : "");
        b.style.setProperty("--c", color[r.key]);
        b.textContent = `${r.label} (${r.points.length})`;
        b.onclick = () => {
          on.has(r.key) ? on.delete(r.key) : on.add(r.key);
          b.classList.toggle("on");
          draw();
        };
        chips.appendChild(b);
      });
      const yrs = D.years.map((y) => y.year);
      function draw() {
        const W = 900, H = 360, m = { l: 40, r: 20, t: 16, b: 30 };
        const s = svg($("#chartRecurring"), W, H);
        const x = scale(yrs[0], yrs.at(-1), m.l + 10, W - m.r - 10);
        const y = scale(1, 5, H - m.b, m.t);
        const g = el("g", { class: "grid" }, s);
        for (let v = 1; v <= 5; v += 0.5) {
          el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
          if (v % 1 === 0) text(s, m.l - 8, y(v) + 4, v, { "text-anchor": "end" });
        }
        yrs.forEach((yr) => text(s, x(yr), H - 8, `’${String(yr).slice(2)}`, { "text-anchor": "middle" }));
        if (!on.size) text(s, W / 2, H / 2, "Vel eitt eller fleire øl over", { "text-anchor": "middle", class: "lbl" });
        for (const r of rec.filter((r) => on.has(r.key))) {
          const c = color[r.key];
          el("path", { d: r.points.map((p, i) => `${i ? "L" : "M"}${x(p.y)},${y(p.avg)}`).join(""), fill: "none", stroke: c, "stroke-width": 2.5, opacity: 0.9 }, s);
          r.points.forEach((p) => {
            const dot = el("circle", { cx: x(p.y), cy: y(p.avg), r: 5.5, fill: c, stroke: "#08130e", "stroke-width": 2 }, s);
            bindTip(dot, `<b>${esc(r.label)}</b><br>${p.y}: ${nf(p.avg)}`);
          });
        }
      }
      draw();
    }

    // ----- Bryggeriliga (prikkdiagram) -----
    {
      const list = D.breweries.filter((b) => b.n >= 4).sort((a, b) => b.avg - a.avg);
      const W = 900, rowH = 30, m = { l: 190, r: 70, t: 24, b: 30 };
      const H = m.t + m.b + list.length * rowH;
      const s = svg($("#chartBreweries"), W, H);
      const x = scale(2.6, 4.3, m.l, W - m.r);
      const overall = mean(beers.map((b) => b.avg));
      const g = el("g", { class: "grid" }, s);
      for (let v = 2.6; v <= 4.31; v += 0.2) {
        el("line", { x1: x(v), x2: x(v), y1: m.t - 8, y2: H - m.b }, g);
        text(s, x(v), H - 10, nf(v, 1), { "text-anchor": "middle" });
      }
      el("line", { x1: x(overall), x2: x(overall), y1: m.t - 14, y2: H - m.b, stroke: "#ff6b5e", "stroke-dasharray": "4 4" }, s);
      text(s, x(overall), m.t - 16, `snitt alle øl ${nf(overall)}`, { "text-anchor": "middle", fill: "#ff6b5e", "font-size": 11 });
      list.forEach((b, i) => {
        const cy = m.t + i * rowH + rowH / 2;
        text(s, m.l - 12, cy + 4, b.name, { "text-anchor": "end", class: "lbl", "font-size": 13 });
        el("line", { x1: x(2.6), x2: x(b.avg), y1: cy, y2: cy, stroke: "rgba(255,255,255,0.12)" }, s);
        const home = /Hausnesbrogg|Mjøstølen/.test(b.name);
        const c = el("circle", { cx: x(b.avg), cy, r: 4 + Math.sqrt(b.n) * 2.2, fill: home ? "#f2c14e" : b.avg >= overall ? "#8fe0b0" : "#ff6b5e", opacity: 0.85 }, s);
        bindTip(c, `<b>${esc(b.name)}</b><br>${b.n} øl over ${b.years} år<br>Snitt ${nf(b.avg)}<br>Best: ${esc(b.best.name)} (${b.best.y}, ${nf(b.best.avg)})`);
        text(s, W - m.r + 10, cy + 4, `${b.n} øl`, { "font-size": 11 });
      });
    }

    // ----- ABV-spreiing -----
    {
      const pts = beers.filter((b) => b.abv != null);
      const W = 900, H = 400, m = { l: 40, r: 20, t: 16, b: 40 };
      const s = svg($("#chartAbv"), W, H);
      const x = scale(0, 17, m.l, W - m.r), y = scale(1, 5, H - m.b, m.t);
      const g = el("g", { class: "grid" }, s);
      for (let v = 0; v <= 17; v += 2) {
        el("line", { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }, g);
        text(s, x(v), H - m.b + 18, `${v} %`, { "text-anchor": "middle" });
      }
      for (let v = 1; v <= 5; v++) {
        el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        text(s, m.l - 8, y(v) + 4, v, { "text-anchor": "end" });
      }
      // lineær regresjon
      const mx = mean(pts.map((p) => p.abv)), my = mean(pts.map((p) => p.avg));
      const sxy = sum(pts.map((p) => (p.abv - mx) * (p.avg - my))), sxx = sum(pts.map((p) => (p.abv - mx) ** 2));
      const syy = sum(pts.map((p) => (p.avg - my) ** 2));
      const k = sxy / sxx, c0 = my - k * mx, r = sxy / Math.sqrt(sxx * syy);
      el("line", { x1: x(0), y1: y(c0), x2: x(17), y2: y(c0 + k * 17), stroke: "#ff6b5e", "stroke-width": 2, "stroke-dasharray": "6 5" }, s);
      for (const p of pts) {
        const jitter = (Math.sin(p.y * 13 + p.order * 7) * 0.12);
        const dot = el("circle", { cx: x(p.abv + jitter), cy: y(p.avg), r: 5, fill: p.home ? "#f2c14e" : "#8fe0b0", opacity: 0.75, stroke: "#08130e" }, s);
        bindTip(dot, `<b>${esc(p.name)}</b><br>${p.y} · ${nf(p.abv, 1)} % · snitt ${nf(p.avg)}`);
      }
      text(s, W - m.r, m.t + 10, "Alkoholprosent →", { "text-anchor": "end" });
      const strongest = [...pts].sort((a, b) => b.abv - a.abv)[0];
      $("#abvNote").innerHTML = `Trendlinja stig med <b>${nf(k * 1, 2)}</b> poeng per prosentpoeng (r = ${nf(r)}). Altså: litt betre, men det er ikkje berre promillen som tel.
        Sterkaste øl: <b>${esc(strongest.name)}</b> (${nf(strongest.abv, 1)} %), som fekk ${nf(strongest.avg)}. Rundt ${Math.round((pts.length / beers.length) * 100)} % av øla har kjend alkoholprosent.`;
    }

    // ----- Rekkjefølgje -----
    {
      const byPos = {};
      beers.forEach((b) => (byPos[b.order] ??= []).push(b.avg));
      const pos = Object.keys(byPos).map(Number).filter((p) => byPos[p].length >= 4).sort((a, b) => a - b);
      const W = 900, H = 300, m = { l: 40, r: 20, t: 16, b: 40 };
      const s = svg($("#chartOrder"), W, H);
      const x = scale(0.5, pos.at(-1) + 0.5, m.l, W - m.r), y = scale(2.5, 4, H - m.b, m.t);
      const g = el("g", { class: "grid" }, s);
      for (let v = 2.5; v <= 4.01; v += 0.25) {
        el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        text(s, m.l - 8, y(v) + 4, nf(v, 2), { "text-anchor": "end" });
      }
      const bw = (W - m.l - m.r) / pos.length - 4;
      const avgs = pos.map((p) => mean(byPos[p]));
      pos.forEach((p, i) => {
        const v = avgs[i];
        const r = el("rect", { x: x(p) - bw / 2, y: y(v), width: bw, height: H - m.b - y(v), rx: 4, fill: `hsl(${10 + (v - 2.5) * 70}, 70%, 58%)`, opacity: 0.85 }, s);
        bindTip(r, `<b>Øl nr. ${p}</b><br>Snitt ${nf(v)} (${byPos[p].length} øl)`);
        if (pos.length < 30 || p % 2) text(s, x(p), H - m.b + 16, p, { "text-anchor": "middle", "font-size": 11 });
      });
      text(s, W - m.r, H - 6, "Nummer i rekkjefølgja →", { "text-anchor": "end" });
      const first = mean(pos.filter((p) => p <= 5).map((p) => mean(byPos[p])));
      const late = mean(pos.filter((p) => p >= 15).map((p) => mean(byPos[p])));
      $("#orderNote").innerHTML = `Dei fem første øla får i snitt <b>${nf(first)}</b>, øla frå nr. 15 og utover får <b>${nf(late)}</b>.
        ${late > first ? "Ølbrillene verkar. 🥴" : "Ganen blir trøytt, eller så sparer me ikkje det beste til slutt."}`;
    }

    // ----- Histogram -----
    {
      const bins = {};
      allScores.forEach((v) => {
        const k = Math.round(v * 4) / 4;
        bins[k] = (bins[k] ?? 0) + 1;
      });
      const keys = Object.keys(bins).map(Number).sort((a, b) => a - b);
      const W = 900, H = 300, m = { l: 40, r: 20, t: 24, b: 40 };
      const s = svg($("#chartHist"), W, H);
      const x = scale(0, 6.25, m.l, W - m.r), maxN = Math.max(...Object.values(bins));
      const y = scale(0, maxN, H - m.b, m.t);
      const bw = (W - m.l - m.r) / 26 - 2;
      for (let v = 0; v <= 6; v++) text(s, x(v + 0.125), H - m.b + 18, v, { "text-anchor": "middle" });
      keys.forEach((k) => {
        const n = bins[k];
        const r = el("rect", { x: x(k), y: y(n), width: bw, height: H - m.b - y(n), rx: 3, fill: k >= 5.5 ? "#f2c14e" : k % 1 === 0 ? "#ff6b5e" : "#8fe0b0", opacity: 0.85 }, s);
        bindTip(r, `<b>${nf(k)}</b><br>${int(n)} karakterar`);
      });
      const six = D.beers.flatMap((b) => Object.entries(b.scores).filter(([, v]) => v > 5).map(([p]) => `${p} (${b.name}, ${b.y})`));
      if (six.length) {
        const ann = text(s, x(6.1), y(bins[6] ?? 0) - 10, "6 av 5?!", { "text-anchor": "middle", fill: "#f2c14e", "font-weight": 700 });
        bindTip(ann, `Karakterskalaen er visst berre ein tilråding:<br>${six.map(esc).join("<br>")}`);
      }
      const mode = keys.reduce((a, b) => (bins[a] >= bins[b] ? a : b));
      text(s, W - m.r, m.t, `Mest brukte karakter: ${nf(mode)} · snitt ${nf(mean(allScores))}`, { "text-anchor": "end", class: "lbl" });
      const rated = beers.filter((b) => b.n >= 5);
      const polar = [...rated].sort((a, b) => b.sd - a.sd).slice(0, 5);
      const cons = [...rated].sort((a, b) => a.sd - b.sd).slice(0, 5);
      const sdli = (b) => `<li><div class="row"><span class="nm">${esc(b.name)} <span class="y">${b.y} · snitt ${nf(b.avg)}</span></span><span class="sc">±${nf(b.sd)}</span></div></li>`;
      $("#polar").innerHTML = polar.map(sdli).join("");
      $("#consensus").innerHTML = cons.map(sdli).join("");
    }

    // ----- Oppmøte -----
    {
      const P = D.people, yrs = D.years.map((y) => y.year);
      const W = 900, cell = Math.min(46, (W - 130) / yrs.length), rowH = 22, m = { l: 120, t: 26 };
      const H = m.t + P.length * rowH + 8;
      const s = svg($("#attendance"), W, H);
      yrs.forEach((y, j) => text(s, m.l + j * cell + cell / 2, 16, `’${String(y).slice(2)}`, { "text-anchor": "middle" }));
      P.forEach((p, i) => {
        const cy = m.t + i * rowH;
        text(s, m.l - 10, cy + 15, p.name, { "text-anchor": "end", class: "lbl", "font-size": 12.5 });
        yrs.forEach((y, j) => {
          const here = p.years.includes(y);
          const myScores = here ? D.beers.filter((b) => b.y === y && b.scores[p.name] != null).map((b) => b.scores[p.name]) : [];
          const avg = mean(myScores);
          const r = el("rect", {
            x: m.l + j * cell + 2, y: cy + 2, width: cell - 4, height: rowH - 4, rx: 5,
            fill: here ? `hsl(${avg != null ? 0 + (avg - 2) * 55 : 45}, 65%, ${here ? 52 : 20}%)` : "rgba(255,255,255,0.04)",
          }, s);
          if (here) bindTip(r, `<b>${esc(p.name)} ${y}</b><br>${myScores.length} øl, snittkarakter ${nf(avg)}`);
        });
        text(s, m.l + yrs.length * cell + 8, cy + 15, `${p.years.length}`, { "font-size": 11 });
      });
    }

    // ----- Snill/streng og kompass -----
    {
      const P = D.people.filter((p) => p.nScores >= 40);
      const bar = (container, key, fmt, domain, colorFn, label) => {
        const list = [...P].sort((a, b) => b[key] - a[key]);
        const W = 440, rowH = 24, m = { l: 92, r: 50, t: 6, b: 22 };
        const H = m.t + m.b + list.length * rowH;
        const s = svg(container, W, H);
        const x = scale(domain[0], domain[1], m.l, W - m.r);
        const zero = x(Math.max(domain[0], 0));
        el("line", { x1: zero, x2: zero, y1: 0, y2: H - m.b, stroke: "rgba(255,255,255,0.3)" }, s);
        list.forEach((p, i) => {
          const cy = m.t + i * rowH;
          const v = p[key];
          text(s, m.l - 8, cy + 16, p.name, { "text-anchor": "end", class: "lbl", "font-size": 12 });
          const r = el("rect", { x: Math.min(zero, x(v)), y: cy + 4, width: Math.abs(x(v) - zero), height: rowH - 8, rx: 4, fill: colorFn(v) }, s);
          bindTip(r, `<b>${esc(p.name)}</b><br>${label(p)}`);
          text(s, Math.max(zero, x(v)) + 6, cy + 16, fmt(v), { "font-size": 11 });
        });
        text(s, m.l, H - 4, domain[0] < 0 ? "← strengare" : "", {});
        text(s, W - m.r, H - 4, domain[0] < 0 ? "snillare →" : "", { "text-anchor": "end" });
      };
      bar($("#chartBias"), "bias", (v) => (v > 0 ? "+" : "") + nf(v), [-1, 0.3], (v) => (v >= 0 ? "#8fe0b0" : "#ff6b5e"),
        (p) => `Gir i snitt ${nf(p.bias)} ${p.bias >= 0 ? "meir" : "mindre"} enn resten av bordet<br>${p.nScores} karakterar, snitt ${nf(p.mean)}`);
      bar($("#chartCorr"), "corr", (v) => nf(v), [0, 1], (v) => `hsl(${40 + v * 100}, 65%, 58%)`,
        (p) => `Korrelasjon med resten av bordet: ${nf(p.corr)}<br>${p.nScores} karakterar`);
    }

    // ----- Smakarprofil -----
    {
      const sel = $("#personSelect");
      sel.innerHTML = D.people.map((p, i) => `<option value="${i}">${esc(p.name)} (${p.years.length} år)</option>`).join("");
      const show = () => {
        const p = D.people[+sel.value];
        const evs = Object.entries(p.events).filter(([k, v]) => v > 0 && k !== "pulse");
        const reg = D.people.filter((q) => q.nScores >= 40);
        const rankBias = reg.length && p.nScores >= 40 ? [...reg].sort((a, b) => b.bias - a.bias).findIndex((q) => q.name === p.name) + 1 : null;
        $("#personBody").innerHTML = `
          <div class="pstats">
            <div class="pstat"><b>${p.years.length}</b><span>kveldar (${p.years[0]}${p.years.length > 1 ? `–${p.years.at(-1)}` : ""})</span></div>
            <div class="pstat"><b>${p.nScores}</b><span>karakterar gitt</span></div>
            <div class="pstat"><b>${nf(p.mean)}</b><span>snittkarakter</span></div>
            <div class="pstat"><b>${p.bias > 0 ? "+" : ""}${nf(p.bias)}</b><span>mot resten av bordet</span></div>
            ${p.homeMean != null ? `<div class="pstat"><b>${nf(p.homeMean)}</b><span>snitt til heimabrygg</span></div>` : ""}
          </div>
          <div class="ptext">
            <p>❤️ <b>Høgaste karakter:</b> ${nf(p.fav.s)} til ${esc(p.fav.name)} (${p.fav.y}). Bordet gav ${nf(p.fav.avg)}.</p>
            <p>💀 <b>Lågaste karakter:</b> ${nf(p.worst.s)} til ${esc(p.worst.name)} (${p.worst.y}). Bordet gav ${nf(p.worst.avg)}.</p>
            ${rankBias ? `<p>⚖️ Nr. <b>${rankBias}</b> av ${reg.length} på snillheitsskalaen (minst 40 karakterar).</p>` : ""}
            ${evs.length ? `<p>🧻 <b>Kaoskonto:</b> ${evs.map(([k, v]) => `${D.catLabels[k]} ${int(v)}`).join(" · ")}</p>` : ""}
            ${p.events.pulse ? `<p>❤️ Puls i 2025: <b>${p.events.pulse}</b></p>` : ""}
          </div>`;
      };
      sel.onchange = show;
      show();
    }

    // ----- Heimabrygg -----
    {
      const groups = [
        ["🏡 Heimabrygg", beers.filter((b) => b.home), "#f2c14e"],
        ["🍷 Polet & butikk", beers.filter((b) => !b.home), "#8fe0b0"],
      ];
      const W = 440, H = 260, m = { l: 20, r: 20, t: 30, b: 60 };
      const s = svg($("#chartHome"), W, H);
      const y = scale(0, 4.5, H - m.b, m.t);
      groups.forEach(([label, list, c], i) => {
        const v = mean(list.map((b) => b.avg));
        const cx = 120 + i * 200, w = 110;
        el("rect", { x: cx - w / 2, y: y(v), width: w, height: H - m.b - y(v), rx: 10, fill: c, opacity: 0.85 }, s);
        // skum
        for (let k = 0; k < 5; k++) el("circle", { cx: cx - w / 2 + 12 + k * 21.5, cy: y(v) - 2, r: 14, fill: "#fff8e6" }, s);
        text(s, cx, y(v) - 22, nf(v), { "text-anchor": "middle", class: "lbl", "font-size": 22, "font-weight": 800 });
        text(s, cx, H - m.b + 22, label, { "text-anchor": "middle", class: "lbl", "font-size": 14 });
        text(s, cx, H - m.b + 40, `${list.length} øl`, { "text-anchor": "middle" });
      });
      $("#homeTop").innerHTML = beers.filter((b) => b.home).sort((a, b) => b.avg - a.avg).slice(0, 6).map(li).join("");
    }

    // ----- Kaos -----
    {
      const cats = Object.keys(D.events).filter((k) => k !== "pulse");
      const EMO = { toilet: "🚽", spill: "🍺💦", fart: "💨", idiocy: "🤪", offence: "😤" };
      // Rekordar: høgaste enkelttal per kategori
      const recs = cats.map((k) => {
        let best = { n: -1 };
        for (const [y, m] of Object.entries(D.events[k])) for (const [p, n] of Object.entries(m)) if (n > best.n) best = { n, p, y };
        return { k, ...best };
      });
      $("#records").innerHTML = recs
        .map((r) => `<div class="card record"><div class="emo">${EMO[r.k] ?? "⭐"}</div><b>${int(r.n)}</b><p>${D.catLabels[r.k]}: <span class="nm">${esc(r.p)}</span> i ${r.y}</p></div>`)
        .join("");
      const personColor = (p) => COLORS[Math.max(0, D.people.findIndex((q) => q.name === p)) % COLORS.length];
      let cat = "toilet";
      const chips = $("#kaosChips");
      cats.forEach((k) => {
        const b = document.createElement("button");
        b.className = "chip" + (k === cat ? " on" : "");
        b.textContent = `${EMO[k] ?? ""} ${D.catLabels[k]}`;
        b.onclick = () => {
          cat = k;
          chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b));
          draw();
        };
        chips.appendChild(b);
      });
      function draw() {
        const byY = D.events[cat];
        const yrs = Object.keys(byY).map(Number).sort();
        const W = 900, H = 320, m = { l: 44, r: 20, t: 20, b: 34 };
        const s = svg($("#chartKaos"), W, H);
        const tot = yrs.map((y) => sum(Object.values(byY[y])));
        const maxT = Math.max(...tot, 1);
        const useLog = maxT / (mean(tot) || 1) > 4;
        const f = useLog ? (v) => Math.log10(v + 1) : (v) => v;
        const y = scale(0, f(maxT), H - m.b, m.t);
        const x = scale(0, yrs.length, m.l, W - m.r);
        const bw = (W - m.l - m.r) / yrs.length - 10;
        yrs.forEach((yr, i) => {
          let acc = 0;
          const entries = Object.entries(byY[yr]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
          entries.forEach(([p, n], j) => {
            const y0 = y(f(acc)), y1 = y(f(acc + n));
            acc += n;
            const r = el("rect", { x: x(i) + 5, y: y1, width: bw, height: Math.max(1, y0 - y1), fill: personColor(p), opacity: 0.85, stroke: "#08130e" }, s);
            bindTip(r, `<b>${esc(p)}</b> ${yr}<br>${D.catLabels[cat]}: ${int(n)}`);
          });
          text(s, x(i) + 5 + bw / 2, H - m.b + 18, yr, { "text-anchor": "middle" });
          text(s, x(i) + 5 + bw / 2, y(f(tot[i])) - 6, int(tot[i]), { "text-anchor": "middle", class: "lbl", "font-size": 12 });
        });
        if (useLog) text(s, W - m.r, m.t, "logaritmisk skala – elles hadde ikkje dei andre åra synst", { "text-anchor": "end", "font-size": 11 });
      }
      draw();
    }

    // ----- Klokka -----
    {
      const ys = D.years.filter((y) => y.start != null);
      const W = 900, rowH = 30, m = { l: 60, r: 30, t: 30, b: 10 };
      const H = m.t + m.b + ys.length * rowH;
      const s = svg($("#chartClock"), W, H);
      const lo = 17 * 60, hi = 26 * 60;
      const x = scale(lo, hi, m.l, W - m.r);
      const g = el("g", { class: "grid" }, s);
      for (let t = lo; t <= hi; t += 60) {
        el("line", { x1: x(t), x2: x(t), y1: m.t - 6, y2: H - m.b }, g);
        text(s, x(t), m.t - 12, clock(t), { "text-anchor": "middle" });
      }
      el("line", { x1: x(24 * 60), x2: x(24 * 60), y1: m.t - 6, y2: H - m.b, stroke: "#8ab6ff", "stroke-dasharray": "3 4" }, s);
      ys.forEach((y, i) => {
        const cy = m.t + i * rowH;
        text(s, m.l - 10, cy + 19, y.year, { "text-anchor": "end", class: "lbl" });
        const r = el("rect", { x: x(y.start), y: cy + 6, width: x(y.end) - x(y.start), height: rowH - 12, rx: 9, fill: "url(#gradClock)" }, s);
        bindTip(r, `<b>${y.year}</b><br>Første øl ${clock(y.start)}, siste ${clock(y.end)}<br>${Math.floor((y.end - y.start) / 60)} t ${(y.end - y.start) % 60} min · ${y.nBeers} øl`);
        text(s, x(y.end) + 6, cy + 19, "🍺", { "font-size": 13 });
      });
      const defs = el("defs", {}, s);
      const lg = el("linearGradient", { id: "gradClock" }, defs);
      el("stop", { offset: "0", "stop-color": "#3fa66b" }, lg);
      el("stop", { offset: "1", "stop-color": "#d9433b" }, lg);
    }

    // ----- Sitat -----
    $("#quotes").innerHTML = D.quotes
      .map((q, i) => `<figure class="quote" style="--r:${((i * 37) % 7) - 3}deg"><q>${esc(q.text.replace(/^«|»$/g, ""))}</q>
        <span class="src">${q.who ? `${esc(q.who)}, ` : ""}${q.y}${q.beer ? ` · ${esc(q.beer)}` : ""}</span></figure>`)
      .join("");

    // ----- Fun facts -----
    const facts = buildFacts(D, beers, allScores, sorted);
    let fi = -1;
    $("#factBtn").onclick = () => {
      let n;
      do n = Math.floor(Math.random() * facts.length); while (n === fi && facts.length > 1);
      fi = n;
      $("#factText").innerHTML = facts[n];
      const b = $("#factBtn");
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
    };

    // ----- Neste år -----
    if (D.lineupNext) {
      $("#next").innerHTML = `<h3>🎄 Kapittel ${D.years.length + 1}: ${D.lineupNext.year}</h3>
        <p><b>${D.lineupNext.nBeers}</b> øl står klare. Kven tek gullet i år, og kven sølar mest?</p>`;
    } else $("#next").remove();

    // Innfading
    document.querySelectorAll("section").forEach((sec) => {
      sec.classList.add("reveal");
      onVisible(sec, () => sec.classList.add("in"));
    });
  }

  function onVisible(node, fn) {
    if (!("IntersectionObserver" in window)) return fn();
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        fn();
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(node);
  }

  function buildFacts(D, beers, allScores, sorted) {
    const F = [];
    const byName = (re) => D.beers.filter((b) => re.test(b.name));
    const julefred = byName(/kinn.*julefred/i);
    F.push(`Kinn Julefred er det ølet som har vore med flest gonger: <b>${julefred.length}</b> gonger, med snitt ${nf(mean(julefred.map((b) => b.avg)))}.`);
    const hansa = byName(/hansa/i);
    F.push(`Hansa har vore på bordet <b>${hansa.length}</b> gonger. Snittet er ${nf(mean(hansa.map((b) => b.avg)))}. Trufast, om ikkje akkurat elska.`);
    const six = D.beers.flatMap((b) => Object.entries(b.scores).filter(([, v]) => v > 5).map(([p]) => p));
    if (six.length) F.push(`I 2013 gav ${six.join(" og ")} karakteren <b>6</b> til Ægir Ylir. Skalaen går til 5.`);
    const zero = D.beers.find((b) => b.abv === 0);
    if (zero) F.push(`Det alkoholfrie ${zero.name} (${zero.y}) fekk ${nf(zero.avg)}, betre enn ${Math.round((beers.filter((b) => b.avg < zero.avg).length / beers.length) * 100)} % av alle øla nokon gong.`);
    const worst = sorted.at(-1);
    F.push(`Det dårlegaste ølet nokon gong er <b>${worst.name}</b> (${worst.y}) med ${nf(worst.avg)}. Namnet seier det meste.`);
    const ev = D.events.fart?.[2021];
    if (ev) F.push(`I 2021 vart det loggført <b>${sum(Object.values(ev))}</b> tilfelle av fising/hikking/gupling. ${Object.entries(ev).sort((a, b) => b[1] - a[1])[0][0]} stod for mesteparten.`);
    const sp = D.events.spill?.[2017];
    if (sp) F.push(`2017 var søleåret: <b>${sum(Object.values(sp))}</b> sølingar, ${Object.entries(sp).sort((a, b) => b[1] - a[1])[0][1]} av dei frå éin person.`);
    const late = D.years.filter((y) => y.end).sort((a, b) => b.end - a.end)[0];
    F.push(`Seinaste øl nokon gong vart skjenka klokka <b>${clock(late.end)}</b> i ${late.year}.`);
    const early = D.years.filter((y) => y.start).sort((a, b) => a.start - b.start)[0];
    F.push(`Tidlegaste start: <b>${clock(early.start)}</b> i ${early.year}. Nokon hadde det travelt.`);
    const total = allScores.length;
    F.push(`Totalt er det gitt <b>${int(total)}</b> karakterar. Lagt saman blir det ${int(sum(allScores))} poeng.`);
    const strongest = [...beers].filter((b) => b.abv).sort((a, b) => b.abv - a.abv)[0];
    F.push(`Sterkaste øl: <b>${strongest.name}</b> på ${nf(strongest.abv, 1)} %.`);
    const alwaysThere = D.people.filter((p) => p.years.length === D.years.length).map((p) => p.name);
    F.push(`Berre ${alwaysThere.join(", ").replace(/, ([^,]*)$/, " og $1")} har vore med på <b>alle ${D.years.length}</b> kveldane.`);
    F.push(`Mjøstølen-ølet «Nytelse frå Nissemor» (2025) fekk ${nf(D.beers.find((b) => /Nytelse/.test(b.name))?.avg)}, det beste heimabrygget nokon gong.`);
    F.push(`Den same NRK-videoen har vore vist på smakinga i <b>seks</b> år. Det er ein tradisjon no.`);
    const pulse = D.events.pulse?.[2025];
    if (pulse) {
      const [p, n] = Object.entries(pulse).sort((a, b) => b[1] - a[1])[0];
      F.push(`Pulsmålinga i 2025: ${p} toppa med <b>${n}</b> slag i minuttet. Joleøl er spenning.`);
    }
    const fivePlus = beers.filter((b) => b.avg >= 4.5).length;
    F.push(`Berre <b>${fivePlus}</b> av ${beers.length} øl har fått snitt på 4,5 eller meir. Det er ${nf((fivePlus / beers.length) * 100, 1)} %.`);
    const g = D.recurring.find((r) => /Grevens/.test(r.label));
    if (g) F.push(`Grevens Julecider har vore med ${g.points.length} gonger. Han er ikkje øl. Han er ikkje god (snitt ${nf(mean(g.points.map((p) => p.avg)))}). Han kjem att.`);
    return F;
  }
})();
