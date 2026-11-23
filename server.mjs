#!/usr/bin/env node
/**
 * Lokal server for smakekvelden. Ingen avhengigheiter, ingen internett.
 *
 *   node server.mjs            # http://localhost:8026
 *   PORT=9000 node server.mjs
 *
 * - Serverer app/ og data/
 * - GET  /api/event/<år>          -> kveldens tilstand (data/events/<år>.json)
 * - PUT  /api/event/<år>          -> lagrar tilstanden (med jamlege tryggleikskopiar)
 * - GET  /api/event/<år>/stream   -> Server-Sent Events: ny tilstand kvar gong han blir lagra
 */
import http from "node:http";
import { readFile, writeFile, rename, mkdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = path.join(ROOT, "data", "events");
const BACKUP_DIR = path.join(EVENTS_DIR, "backups");
const PORT = Number(process.env.PORT) || 8026;
const STATIC_DIRS = ["app", "data"];
const BACKUP_EVERY_MS = 60_000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

const clients = new Map(); // år -> Set<res>
const lastBackup = new Map(); // år -> ms

const eventFile = (year) => path.join(EVENTS_DIR, `${year}.json`);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit = 5_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("For stor førespurnad");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function saveEvent(year, state) {
  await mkdir(BACKUP_DIR, { recursive: true });
  const file = eventFile(year);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n");
  await rename(tmp, file); // atomisk: fila blir aldri halvskriven
  const now = Date.now();
  if (now - (lastBackup.get(year) ?? 0) > BACKUP_EVERY_MS) {
    lastBackup.set(year, now);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await copyFile(file, path.join(BACKUP_DIR, `${year}-${stamp}.json`));
  }
}

function broadcast(year, state) {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients.get(year) ?? []) res.write(data);
}

async function handleApi(req, res, url) {
  const m = url.pathname.match(/^\/api\/event\/(\d{4})(\/stream)?$/);
  if (!m) return send(res, 404, { error: "Ukjend API" });
  const year = m[1];

  if (m[2]) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write(": hei\n\n");
    if (!clients.has(year)) clients.set(year, new Set());
    clients.get(year).add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(ping);
      clients.get(year)?.delete(res);
    });
    return;
  }

  if (req.method === "GET") {
    try {
      return send(res, 200, await readFile(eventFile(year), "utf8"));
    } catch {
      return send(res, 404, { error: "Ingen kveld lagra enno" });
    }
  }

  if (req.method === "PUT") {
    try {
      const state = JSON.parse(await readBody(req));
      if (String(state.year) !== year) return send(res, 400, { error: "Feil år" });
      await saveEvent(year, state);
      broadcast(year, state);
      return send(res, 200, { ok: true, version: state.version });
    } catch (e) {
      console.error("Lagring feila:", e);
      return send(res, 500, { error: String(e.message || e) });
    }
  }

  send(res, 405, { error: "Metode ikkje støtta" });
}

async function handleStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") {
    res.writeHead(302, { Location: "/app/" });
    return res.end();
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || !STATIC_DIRS.includes(top)) return send(res, 404, "Ikkje funne", "text/plain");
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      res.writeHead(302, { Location: url.pathname + "/" });
      return res.end();
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(await readFile(file));
  } catch {
    send(res, 404, "Ikkje funne", "text/plain");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "Intern feil" });
  }
});

// Berre localhost: gjestane skal ikkje (og kan ikkje) kople seg på.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`🍺 Joleølsmaking køyrer på http://localhost:${PORT}`);
  console.log(`   Registrering: http://localhost:${PORT}/app/operator.html`);
  console.log(`   Storskjerm:   http://localhost:${PORT}/app/tv.html`);
});
