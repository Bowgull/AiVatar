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
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, G4 = 392, E6 = 1318.5, F4 = 349.23, F5 = 698.46, F6 = 1396.9;

// v2 (2026-10-22): the timer gets its OWN note. His chimes use C, D, E, G and A (job complete climbs C-E-G-A-G-C, the
// question G-C-D, permission G-D-G, plan ready E-D-G, needs you E-A-E, done G-C, failed D-A, step a C tick). Nothing
// uses F, and nothing repeats one note. So the timer strikes F, three times, evenly: a clock striking, which no other
// sound in the set does. Same wooden marimba, a faint bell partial so it reads "clock"; peak -15 dBFS because three strikes carry more
// energy, which puts its loudness (RMS -24.5) inside the family's -24..-27.
/** A marimba bar with a faint bell partial (2.76x, the clock-bell colour). */
function strike(b, at, f, gain = 1, tau = 0.5) { marimba(b, at, f, gain, tau); bell(b, at, f * 2.76, gain * 0.07); }
function bell(b, at, f, gain) { const s0 = Math.round(at * SR); for (let i = 0; s0 + i < b.length; i++) { const t = i / SR; if (t > 1.2) break; b[s0 + i] += gain * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.35) * (t < 0.004 ? t / 0.004 : 1); } }

// A (recommended): a breath of sand, then three even strikes on F5. 1.5 s.
{ const b = buf(1.5); sand(b, 0, 0.28, 0.09); strike(b, 0.20, F5, 0.9); strike(b, 0.50, F5, 0.9); strike(b, 0.80, F5, 1.0, 0.6); save('times-up-wood', b, -15); }
// A, ignored for a minute: the same three strikes and a fourth an octave up, a touch louder (+3 dB). Then it stops.
{ const b = buf(1.9); strike(b, 0.02, F5, 0.9); strike(b, 0.32, F5, 0.9); strike(b, 0.62, F5, 0.9); strike(b, 0.92, F6, 0.8, 0.55); save('times-up-wood-again', b, -12); }
// B: the bowl, moved from G4 (where the question and permission chimes start) down to F4, and shortened.
{ const b = buf(2.6); sand(b, 0, 0.28, 0.08); bowl(b, 0.18, F4, 1); save('times-up-bowl', b, -14); }
// Turning it over: a hollow low knock on F4 (the step chime is a high C tick) and a short pour.
{ const b = buf(0.6); knock(b, 0, F4, 1); sand(b, 0.07, 0.42, 0.3); save('flip', b, -20); }
// One scroll notch: a tiny tick on F6, in key now (v1's was an F#, outside the set's key), the quietest sound.
{ const b = buf(0.07); knock(b, 0, F6, 1); save('notch', b, -26); }
// v1's A, kept only so the sheet can play the clash next to job complete.
{ const b = buf(1.7); sand(b, 0, 0.32, 0.10); marimba(b, 0.22, E5, 0.75); marimba(b, 0.36, G5, 0.8); marimba(b, 0.50, C6, 1.0, 0.6); save('v1-times-up', b, -14); }
