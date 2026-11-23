// Videoar: favorittar frå data/videos.json, og tolking av YouTube-lenkjer og filnamn.
import { DATA, tryJson } from "./data.js";

export async function loadFavourites() {
  return (await tryJson(`${DATA}/videos.json`))?.favourites ?? [];
}

/** «1m20s», «80», «80s» → sekund */
function parseTime(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/**
 * Tolkar det sjefen limer inn:
 *  - YouTube-lenkjer (watch?v=, youtu.be/, shorts/, embed/, live/) eller ein rein 11-teikns ID
 *  - filnamn i data/videos/, t.d. «prestegard.mp4»
 * Returnerer { youtube, start } | { file } | null
 */
export function parseVideo(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return { youtube: s, start: 0 };
  if (/\.(mp4|m4v|webm|mov)$/i.test(s) && !/^https?:/i.test(s)) return { file: s.replace(/^.*videos\//, "") };
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1, 12);
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      id = u.searchParams.get("v") ?? /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null;
    }
    if (id && /^[\w-]{11}$/.test(id)) return { youtube: id, start: parseTime(u.searchParams.get("t") ?? u.searchParams.get("start")) };
  } catch {
    /* ikkje ei lenkje */
  }
  return null;
}

export const videoKey = (v) => v.file ?? v.youtube;
