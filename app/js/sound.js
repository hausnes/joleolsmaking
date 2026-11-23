// Små lydeffektar laga med Web Audio – ingen lydfiler, fungerer utan nett.
// Nettlesaren krev eit klikk i vindauget før lyd kan spelast.

let ctx = null;
let enabled = false;

export function soundEnabled() {
  return enabled && ctx;
}

export function toggleSound() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  enabled = !enabled;
  return enabled;
}

function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function hit(at, { gain = 0.25, decay = 0.08, freq = 1800, type = "bandpass" } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(decay + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + decay);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(at);
  src.stop(at + decay + 0.05);
}

/** Trommevirvel som aukar i fart og styrke. */
export function drumroll(seconds = 2.5) {
  if (!soundEnabled()) return;
  const t0 = ctx.currentTime;
  let t = 0;
  while (t < seconds) {
    const p = t / seconds;
    hit(t0 + t, { gain: 0.08 + 0.25 * p, decay: 0.06, freq: 1400 + 600 * p });
    t += 0.085 - 0.05 * p;
  }
}

export function crash() {
  if (!soundEnabled()) return;
  const t = ctx.currentTime;
  hit(t, { gain: 0.5, decay: 0.18, freq: 160, type: "lowpass" });
  hit(t, { gain: 0.35, decay: 1.6, freq: 6000, type: "highpass" });
}

function tone(freq, at, dur, { type = "triangle", gain = 0.18 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function flip() {
  if (!soundEnabled()) return;
  tone(660, ctx.currentTime, 0.12, { type: "sine", gain: 0.12 });
}

export function ding() {
  if (!soundEnabled()) return;
  const t = ctx.currentTime;
  tone(988, t, 0.5, { type: "sine" });
  tone(1319, t + 0.12, 0.7, { type: "sine" });
}

/** «Boing» for søl, fis og andre uhell. */
export function boing() {
  if (!soundEnabled()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.18);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.6);
}

export function fanfare() {
  if (!soundEnabled()) return;
  const t = ctx.currentTime;
  const notes = [523, 659, 784, 1047, 784, 1047];
  const times = [0, 0.15, 0.3, 0.45, 0.75, 0.9];
  notes.forEach((f, i) => tone(f, t + times[i], i === notes.length - 1 ? 0.9 : 0.25));
}
