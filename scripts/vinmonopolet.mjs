#!/usr/bin/env node
/**
 * Hentar produktinfo og bilete frå Vinmonopolet, slik at alt ligg lokalt på smakekvelden.
 *
 *   node scripts/vinmonopolet.mjs search julefred       # finn varenummer
 *   node scripts/vinmonopolet.mjs fetch 9520801 ...     # hent eitt eller fleire produkt
 *   node scripts/vinmonopolet.mjs lineup 2026           # hent alt i data/lineup/2026.json
 *
 * Lagrar til data/products/<varenummer>.json og data/products/images/<varenummer>.jpg.
 * NB: Brukar dei same (uoffisielle) endepunkta som vinmonopolet.no sjølv – dei kan endre seg.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_DIR = path.join(ROOT, "data", "products");
const IMAGES_DIR = path.join(PRODUCTS_DIR, "images");
const BASE = "https://www.vinmonopolet.no";
const HEADERS = { "User-Agent": "Mozilla/5.0 (joleolsmaking)", "Accept-Language": "nb-NO" };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

export async function search(query, pageSize = 10) {
  const url = `${BASE}/vmpws/v2/vmp/products/search?q=${encodeURIComponent(query)}&pageSize=${pageSize}`;
  const data = await (await get(url)).json();
  return (data.products ?? []).map((p) => ({
    id: p.code,
    name: p.name,
    abv: p.alcohol?.value ?? null,
    price: p.price?.value ?? null,
    volumeCl: p.volume?.value ?? null,
    style: p.main_sub_category?.name ?? p.main_category?.name ?? null,
    expired: p.expired,
  }));
}

/** Produktsida har heile produktet som JSON i ein <script type="application/json">. */
async function fetchProductJson(id) {
  const html = await (await get(`${BASE}/p/${id}`)).text();
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes('"product"')) continue;
    try {
      const data = JSON.parse(m[1]);
      if (data?.product?.code === String(id)) return data.product;
    } catch {
      /* ikkje denne */
    }
  }
  throw new Error(`Fann ikkje produktdata på sida for ${id}`);
}

function parseAbv(s) {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function simplify(p) {
  const chars = Object.fromEntries(
    (p.content?.characteristics ?? []).map((c) => [c.name.toLowerCase(), c.value == null ? null : Number(c.value)])
  );
  const img =
    p.images?.find((i) => i.format === "zoom") ??
    p.images?.find((i) => i.format === "superZoom") ??
    p.images?.[0];
  return {
    id: p.code,
    name: p.name,
    producer: p.main_producer?.name ?? null,
    country: p.main_country?.name ?? null,
    district: p.district?.name ?? null,
    style: p.main_sub_category?.name ?? p.main_category?.name ?? null,
    abv: p.alcohol?.value ?? parseAbv(p.content?.traits?.find((t) => t.name === "Alkohol")?.formattedValue),
    volumeCl: p.volume?.value ?? null,
    price: p.price?.value ?? null,
    litrePrice: p.litrePrice?.value ?? null,
    color: p.color || null,
    smell: p.smell || null,
    taste: p.taste || null,
    method: p.method || null,
    ingredients: p.content?.ingredients?.map((i) => i.formattedValue).join(", ") || null,
    goodFor: (p.content?.isGoodFor ?? []).map((g) => g.name),
    // Vinmonopolet sine skalaer går frå 0 til 12
    characteristics: { fylde: chars.fylde ?? null, friskhet: chars.friskhet ?? null, bitterhet: chars.bitterhet ?? null },
    packaging: p.packageType ?? null,
    selection: p.product_selection ?? null,
    url: `${BASE}${p.url ?? `/p/${p.code}`}`,
    imageUrl: img?.url ?? null,
    image: null,
    fetchedAt: new Date().toISOString(),
  };
}

const exists = (f) => access(f).then(() => true, () => false);

export async function fetchProduct(id) {
  const product = simplify(await fetchProductJson(id));
  // Eige bilete (t.d. eit mobilbilete) i images/<varenr>.own.jpg vinn alltid
  const own = `${id}.own.jpg`;
  if (await exists(path.join(IMAGES_DIR, own))) {
    product.image = `products/images/${own}`;
  } else if (product.imageUrl) {
    const res = await get(product.imageUrl);
    // Manglar Vinmonopolet bilete, får ein ei grå standardflaske som PNG – den vil me ikkje ha
    const placeholder = (res.headers.get("content-type") ?? "").includes("png");
    const buf = Buffer.from(await res.arrayBuffer());
    if (!placeholder) {
      await writeFile(path.join(IMAGES_DIR, `${id}.jpg`), buf);
      product.image = `products/images/${id}.jpg`;
    }
  }
  await writeFile(path.join(PRODUCTS_DIR, `${id}.json`), JSON.stringify(product, null, 2) + "\n");
  return product;
}

async function fetchMany(ids, { force = false } = {}) {
  await mkdir(IMAGES_DIR, { recursive: true });
  let ok = 0;
  for (const id of ids) {
    if (!force && (await exists(path.join(PRODUCTS_DIR, `${id}.json`)))) {
      console.log(`  ${id}: finst allereie (bruk --force for å hente på nytt)`);
      ok++;
      continue;
    }
    try {
      const p = await fetchProduct(id);
      console.log(`  ${id}: ${p.name} (${p.abv}%, ${p.style}, kr ${p.price}) ${p.image ? "🖼" : `– utan bilete (legg eit eige i data/products/images/${id}.own.jpg)`}`);
      ok++;
    } catch (e) {
      console.error(`  ${id}: FEIL – ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400)); // ver snill med serveren
  }
  console.log(`${ok}/${ids.length} produkt klare i data/products/`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const force = args.includes("--force");
  const rest = args.filter((a) => a !== "--force");

  if (cmd === "search" && rest.length) {
    const hits = await search(rest.join(" "));
    if (!hits.length) return console.log("Ingen treff.");
    for (const h of hits)
      console.log(`${h.id.padEnd(9)} ${h.name} – ${h.abv}% – ${h.style} – kr ${h.price}${h.expired ? " (utgått)" : ""}`);
  } else if (cmd === "fetch" && rest.length) {
    await fetchMany(rest, { force });
  } else if (cmd === "lineup" && rest.length) {
    const file = path.join(ROOT, "data", "lineup", `${rest[0]}.json`);
    const lineup = JSON.parse(await readFile(file, "utf8"));
    const ids = lineup.beers.map((b) => b.vinmonopoletId).filter(Boolean);
    console.log(`${ids.length} øl frå Vinmonopolet i ${path.relative(ROOT, file)}:`);
    await fetchMany(ids, { force });
  } else {
    console.log(
      "Bruk:\n  node scripts/vinmonopolet.mjs search <tekst>\n  node scripts/vinmonopolet.mjs fetch <varenr> [...] [--force]\n  node scripts/vinmonopolet.mjs lineup <år> [--force]"
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
