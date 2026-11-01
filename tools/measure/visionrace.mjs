// visionrace.mjs - race local vision models on screens and snips (2026-11-01, his "vision and understanding", on ask only).
//
// The pictures and answers come from visionset.mjs (the page's own text and control boxes) plus two Snipit-sized crops,
// so scoring is mechanical:
//   what / read  the reply must match the page's pattern
//   find         the model gives a point; it passes when the point is inside the control's box (8 px slack)
// Points are asked for on a 0-1000 scale of the picture (Qwen-VL models' own convention); a reply in pixels that does not
// fit that scale is read as pixels.
//
//   node tools/measure/visionrace.mjs <set dir> model1 model2 ...
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HOST = 'http://127.0.0.1:11434';
const [dir, ...models] = process.argv.slice(2);
const set = JSON.parse(readFileSync(path.join(dir, 'set.json'), 'utf8'));
const SLACK = 8;

async function ask(model, img, prompt, tokens) {
  const t0 = performance.now();
  const r = await fetch(HOST + '/api/chat', { method: 'POST', signal: AbortSignal.timeout(180_000), body: JSON.stringify({
    model, stream: false, think: false, keep_alive: '10m', options: { temperature: 0, num_predict: tokens },
    messages: [{ role: 'user', content: prompt, images: [img] }] }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return { text: String(j.message?.content ?? '').trim(), ms: performance.now() - t0 };
}

function point(text, w, h) {
  const n = (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (n.length < 2) return null;
  let [x, y] = n.length >= 4 ? [(n[0] + n[2]) / 2, (n[1] + n[3]) / 2] : [n[0], n[1]];   // a box: its centre
  if (x <= 1000 && y <= 1000) { x = x / 1000 * w; y = y / 1000 * h; }
  return [x, y];
}

for (const model of models) {
  let pass = 0, total = 0; const ms = []; const by = { what: [0, 0], read: [0, 0], find: [0, 0] }; const misses = [];
  try { await ask(model, readFileSync(path.join(dir, set[0].file)).toString('base64'), 'Say ok.', 4); }
  catch (e) { console.log(`\n${model}: could not run (${e.message.slice(0, 120)})`); continue; }
  for (const p of set) {
    const img = readFileSync(path.join(dir, p.file)).toString('base64');
    const [w, h] = p.w ? [p.w, p.h] : [1280, 800];
    for (const q of p.qs) {
      total++; by[q.kind][1]++;
      const prompt = q.kind === 'find'
        ? `Where is ${q.q} in this screenshot? Answer only with its centre as (x, y), where x and y go from 0 to 1000 across the image's width and height.`
        : `${q.q} Answer briefly.`;
      let ok = false, said = '';
      try {
        const r = await ask(model, img, prompt, q.kind === 'find' ? 600 : 300); ms.push(r.ms); said = r.text;
        if (q.kind === 'find') {
          // UI-Venus thinks out loud (<think>...</think><answer>...</answer>) whatever think:false says: score only the answer.
          const answer = r.text.replace(/[\s\S]*<\/think>/, '').replace(/[\s\S]*<answer>/, '');
          const pt = point(answer, w, h), b = q.box;
          ok = !!pt && pt[0] >= b.x - SLACK && pt[0] <= b.x + b.width + SLACK && pt[1] >= b.y - SLACK && pt[1] <= b.y + b.height + SLACK;
        } else ok = new RegExp(q.want, q.flags).test(r.text);
      } catch (e) { said = 'ERROR ' + e.message.slice(0, 60); }
      if (ok) { pass++; by[q.kind][0]++; } else misses.push(`${p.id} ${q.kind}: ${q.q.slice(0, 40)} => ${said.replace(/\s+/g, ' ').slice(0, 70)}`);
    }
  }
  ms.sort((a, b) => a - b);
  const ps = await (await fetch(HOST + '/api/ps')).json().catch(() => ({ models: [] }));
  const m = ps.models?.find(x => x.name === model || x.model === model);
  console.log(`\n${model}: ${pass}/${total} (what ${by.what.join('/')}, read ${by.read.join('/')}, find ${by.find.join('/')}), median ${(ms[ms.length >> 1] / 1000).toFixed(2)} s${m ? `, card ${(m.size_vram / 1e9).toFixed(1)}/${(m.size / 1e9).toFixed(1)} GB` : ''}`);
  for (const x of misses) console.log('   ' + x);
  await fetch(HOST + '/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) });   // off the card before the next
}
