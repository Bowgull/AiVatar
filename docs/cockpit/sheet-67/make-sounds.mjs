// Sheet 67 (2026-10-22): the timer's sound options, made in code in the same family as sounds-45b (wooden marimba,
// C major, mono, 44.1 kHz, peaks at -14 dBFS). Writes WAVs (what the pet plays) next to this file's output folder, then
// the sheet uses small MP3 copies (ffmpeg) so the page stays light.
//
//   node docs/cockpit/sheet-67/make-sounds.mjs <out folder for the .wav files>
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SR = 44100;
const out = process.argv[2];
if (!out) { console.log('usage: make-sounds.mjs <out folder>'); process.exit(1); }
mkdirSync(out, { recursive: true });

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function buf(sec) { return new Float64Array(Math.round(sec * SR)); }
/** A wooden bar: fundamental + the marimba's 4x overtone + a click of mallet, soft 5 ms attack. */
function marimba(b, at, f, gain = 1, tau = null) {
  const t1 = tau ?? Math.max(0.25, 0.75 - (f - 400) / 2000), t2 = t1 * 0.25, s0 = Math.round(at * SR);
  for (let i = 0; s0 + i < b.length; i++) {
    const t = i / SR; if (t > t1 * 7) break;
    const att = t < 0.005 ? 0.5 - 0.5 * Math.cos(Math.PI * t / 0.005) : 1;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / t1) + 0.16 * Math.sin(2 * Math.PI * 3.93 * f * t) * Math.exp(-t / t2) + 0.04 * Math.sin(2 * Math.PI * 9.2 * f * t) * Math.exp(-t / 0.015);
    b[s0 + i] += gain * att * v;
  }
}
/** A struck bowl: a few out-of-tune partials, two fundamentals 1.6 Hz apart so it breathes. */
function bowl(b, at, f, gain = 1) {
  const parts = [[1, 1, 2.4], [1.004, 0.7, 2.4], [2.76, 0.32, 1.3], [5.40, 0.12, 0.6], [8.93, 0.05, 0.3]];
  const s0 = Math.round(at * SR);
  for (let i = 0; s0 + i < b.length; i++) {
    const t = i / SR, att = t < 0.012 ? 0.5 - 0.5 * Math.cos(Math.PI * t / 0.012) : 1;
    let v = 0; for (const [m, a, tau] of parts) v += a * Math.sin(2 * Math.PI * f * m * t) * Math.exp(-t / tau);
    b[s0 + i] += gain * att * v;
  }
}
/** Sand: soft noise, low-passed, with a little grain to it. */
function sand(b, at, sec, gain) {
  const s0 = Math.round(at * SR), n = Math.round(sec * SR); let lp = 0, lp2 = 0;
  for (let i = 0; i < n && s0 + i < b.length; i++) {
    const t = i / n, env = Math.sin(Math.PI * t) ** 1.5 * (0.6 + 0.4 * (rnd() > 0.7 ? 1 : 0));
    lp += 0.18 * (rnd() - lp); lp2 += 0.35 * (lp - lp2);
    b[s0 + i] += gain * env * (lp - lp2 * 0.6);
  }
}
/** A small woodblock knock. */
function knock(b, at, f, gain) {
  const s0 = Math.round(at * SR);
  for (let i = 0; s0 + i < b.length; i++) { const t = i / SR; if (t > 0.12) break; b[s0 + i] += gain * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.3 * t)) * Math.exp(-t / 0.018); }
}
function save(name, b, peakDb) {
  // fade the tail, scale to the family's peak
  const fade = Math.round(0.08 * SR); for (let i = 0; i < fade; i++) b[b.length - 1 - i] *= i / fade;
  let pk = 0; for (const v of b) pk = Math.max(pk, Math.abs(v));
  const k = Math.pow(10, peakDb / 20) / (pk || 1);
  const data = Buffer.alloc(b.length * 2);
  for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(b[i] * k * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(out, name + '.wav'), Buffer.concat([h, data]));
  console.log(name, (b.length / SR).toFixed(2) + ' s');
}
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, G4 = 392, E6 = 1318.5;

// A: the wooden timer. The last sand settles (a breath of hiss), then three soft bars climb to C.
{ const b = buf(1.7); sand(b, 0, 0.32, 0.10); marimba(b, 0.22, E5, 0.75); marimba(b, 0.36, G5, 0.8); marimba(b, 0.50, C6, 1.0, 0.6); save('times-up-wood', b, -14); }
// A, ignored for a minute: the same climb, then one more step up, a touch louder (+3 dB). Then it stops.
{ const b = buf(2.1); marimba(b, 0.02, E5, 0.75); marimba(b, 0.16, G5, 0.8); marimba(b, 0.30, C6, 1.0, 0.5); marimba(b, 0.62, G5, 0.6); marimba(b, 0.76, C6, 0.8); marimba(b, 0.90, E6, 0.85, 0.55); save('times-up-wood-again', b, -11); }
// B: the air temple bowl. One struck bowl on G, long and soft, with the sand settling under it.
{ const b = buf(3.4); sand(b, 0, 0.32, 0.08); bowl(b, 0.2, G4, 1); save('times-up-bowl', b, -14); }
// The small sound: flipping the hourglass (Again) or starting a timer. A knock and a short pour.
{ const b = buf(0.6); knock(b, 0, 900, 0.9); sand(b, 0.06, 0.45, 0.35); save('flip', b, -20); }
// The smallest: one notch of the scroll wheel (+/- 1 minute). A tiny tick, quieter than anything else in the set.
{ const b = buf(0.12); knock(b, 0, 1500, 1); save('notch', b, -26); }
