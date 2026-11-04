// Turns his walk log (%LOCALAPPDATA%\Aang\botw\walks\<day>.jsonl, written by botwlive.ts while Cemu runs) into the
// route engine's numbers (BUGS.md 29-31 in botw-guide-mockups: route times, climb and swim limits were guesses).
//   node scripts/botw-walks.mjs [--dir <walks folder>] [--days 14]
// Each pair of lines 2-6 s apart is one step. A step is sorted by what Link was doing from its speeds alone:
//   on foot  horizontal 1.5-11 m/s, height change small next to it (running, sprinting, horse excluded above 11)
//   climbing rising at least 0.4 m/s while moving under 1.2 m/s across
//   gliding  falling at least 1 m/s while moving at least 4 m/s across (checked first)
// Medians, not means: one warp or a cutscene jump is thrown out, not averaged in. Read-only; prints a short report.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('--dir', path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw', 'walks'));
const DAYS = Number(arg('--days', 14));
if (!existsSync(DIR)) { console.log(`No walk log yet (${DIR}). It fills while Cemu runs with Aang open.`); process.exit(0); }
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
const pts = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) >= since).sort()
  .flatMap((f) => readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));

const foot = [], climb = [], glide = [];
let steps = 0, gaps = 0;
for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1], b = pts[i], dt = (Date.parse(b.t) - Date.parse(a.t)) / 1000;
  if (!(dt >= 1.5 && dt <= 6)) { gaps++; continue; }
  steps++;
  const h = Math.hypot(b.x - a.x, b.z - a.z) / dt, v = (b.y - a.y) / dt;
  if (h > 40) continue;                                         // a warp or a load
  if (v <= -1 && h >= 4) glide.push({ h, v: -v });             // first: a glide also moves fast across, but falls steadily
  else if (h >= 1.5 && h <= 11 && Math.abs(v) < 0.35 * h) foot.push(h);
  else if (v >= 0.4 && h < 1.2) climb.push(v);
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const f1 = (n) => n == null ? 'not enough yet' : n.toFixed(2);
console.log(`Walk log: ${pts.length} points over ${DAYS} days, ${steps} steps (${gaps} breaks: loads, menus, warps)`);
console.log(`On foot:  ${foot.length} steps, median ${f1(med(foot))} m/s  (route times: metres / this)`);
console.log(`Climbing: ${climb.length} steps, median ${f1(med(climb))} m/s up`);
console.log(`Gliding:  ${glide.length} steps, median ${f1(med(glide.map((g) => g.h)))} m/s across, ${f1(med(glide.map((g) => g.v)))} m/s down (glide ratio ${glide.length ? (med(glide.map((g) => g.h)) / med(glide.map((g) => g.v))).toFixed(1) : '?'})`);
if (foot.length < 100) console.log('Note: under 100 steps on foot; play a bit more for numbers worth tuning on.');
