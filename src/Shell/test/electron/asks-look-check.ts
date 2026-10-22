// Sheet 64 v3 (APPROVED 2026-10-22): the kind of ask in Aang's real speech bubble.
//
// bubble.html as it ships (look B, the wood rim, the cockpit closed), fed each ask exactly as main.ts feeds it (through
// the test preload). Checks, per kind: the tag's words and deep colour, the icon and the rim/tail tint in the mark's own
// colour (src/Body/ClaudeMarks.cs), who is asking ("Aang" plain; "Claude · <project>" a door that opens that exact
// session and closes the bubble, with a pointer, an underline and a lift on hover), "Exactly this" on OKs only, no
// "Claude's words", the keys' words, and the keys waiting for 1.5 s of the mouse resting on the bubble (then staying).
// Plain talk and a timer stay untagged.
//
// Off screen, never focused, no real input, never the clipboard: mouse moves go to this page only. Errors exit, never
// a dialog. Run (from src/Shell): npx electron test/electron/asks-look-check.ts [--shots=<dir>]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const STUB = path.join(HERE, 'cockpit-stub.cjs');
const SHOTS = process.argv.find((a) => a.startsWith('--shots='))?.slice(8) ?? '';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { const s = typeof d === 'string' ? d : JSON.stringify(d); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${s ? '  -- ' + s.slice(0, 260) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 900, fx = W - 300, fy = H - 240, head = { x: fx + 112, y: fy + 96 };

const JOB = { id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 60000, prompt: 'Build the route screen', tasks: [], current: '', percent: 40, etaMs: 60000, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0 };
const CPERM = { id: 'toolu_01perm', session: 's-waymark', project: 'Waymark', kind: 'permission', tool: 'Bash', summary: 'Waymark wants to run the route tests on this PC.', input: '{"command":"npm test -- routes"}', canAlways: true };
const CQ = { id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' }, { label: 'Split: map and list', description: 'Turns listed underneath.' }] }] };
const CPLAN = { id: 'toolu_09plan', session: 's-waymark', project: 'Waymark', kind: 'plan', tool: 'ExitPlanMode', summary: '', plain: 'Waymark has a plan for the route screen.',
  plan: '1. Add a grid for the map\n2. Wire the route list under it\n3. Write the tests\n4. Run the checks', canAlways: false };

const MARK = { question: '#b07cff', ok: '#7cc4ff', plan: '#f3e2b8' } as const;
const DEEP = { question: 'rgb(107, 63, 184)', ok: 'rgb(31, 111, 176)', plan: 'rgb(118, 96, 42)' } as const;

const app0 = app.whenReady();
app0.then(async () => {
  const pages = await servePages(path.join(ROOT, 'src', 'Shell', 'pages'));
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  let shots = 0;

  async function open() {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(600);
    const js = <T = unknown>(s: string) => w.webContents.executeJavaScript(s, true) as Promise<T>;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(`html,body{background:#191b24 !important}.wrap{margin:0 ${W - (fx + 140)}px ${H - (fy + 46)}px 14px !important}.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`)}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    const move = async (x: number, y: number) => { w.webContents.sendInputEvent({ type: 'mouseMove', x, y }); await wait(30); };
    const onBubble = async () => { const p = await js<{ x: number; y: number }>(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; })()`); await move(p.x, p.y); };
    const shot = async (name: string) => {
      if (!SHOTS || shots >= 4) return;
      const r = await js<{ x: number; y: number; width: number; height: number }>(`(() => { const sk = document.getElementById('skin'), a = document.querySelector('.stg.aang');
        const rs = [a.getBoundingClientRect(), sk.getBoundingClientRect()];
        const x0 = Math.max(0, Math.min(...rs.map((q) => q.left)) - 12), y0 = Math.max(0, Math.min(...rs.map((q) => q.top)) - 12);
        return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(Math.max(...rs.map((q) => q.right)) - 40 - x0), height: Math.ceil(Math.max(...rs.map((q) => q.bottom)) - 10 - y0) }; })()`);
      const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
      writeFileSync(path.join(SHOTS, `asks-${name}.png`), img.toPNG()); shots++;
      console.log(`  picture asks-${name}.png ${JSON.stringify(img.getSize())}`);
    };
    /** What the bubble shows now: its kind, the tag, the who, the rim tint, "Exactly this", the keys and whether they show. */
    const state = () => js<any>(`(() => {
      const b = document.getElementById('bubble'), shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const tag = [...b.querySelectorAll('.ktag')].find(shown), kt = tag?.querySelector('.kt'), who = tag?.querySelector('.kwho');
      const flood = document.querySelector('#skin #ktf feFlood'), rim = document.querySelector('#skin g.rim');
      const keyEls = [...b.querySelectorAll('#asks button.key, #asks .lever, #ckpins .ckeys button.key, #opts .opt, #ckpins .opts .opt')];
      const kq = [...b.querySelectorAll('.kq')].find(shown);
      return { hidden: b.hidden, kind: b.dataset.kind ?? null, kshow: b.classList.contains('kshow'),
        tag: kt?.textContent ?? null, tagBg: kt ? getComputedStyle(kt).backgroundColor : null, tagColor: kt ? getComputedStyle(kt).color : null,
        icon: kt?.querySelector('path')?.getAttribute('fill') ?? null,
        who: who?.textContent ?? null, door: !!who?.classList.contains('door'), whoTag: who?.tagName ?? null,
        rimTint: rim?.getAttribute('filter') === 'url(#ktf)' ? { c: flood?.getAttribute('flood-color'), o: flood?.getAttribute('flood-opacity') } : null,
        rimmed: document.getElementById('skin').classList.contains('rimmed'),
        exact: kq ? kq.textContent : null, words: !!b.querySelector('.cw, .cwbox'),
        keys: keyEls.map((k) => k.firstChild?.textContent ?? k.textContent), keysShown: keyEls.some(shown),
        plaque: shown(b.querySelector(':scope > .who')) };
    })()`);
    return { w, js, move, onBubble, shot, state, errors };
  }

  // ---------------------------------------------------------------- Aang's own question
  {
    const t = await open();
    await t.js(`window.__deliver({ t: 'choice', id: 'c-1', question: 'What should I play while you raid?', options: [{ label: 'Lo-fi, no words' }, { label: 'Your Ragnaros playlist' }] }); true`);
    await wait(1300);
    let s = await t.state();
    check('Aang question: kind question, tag "Question" deep lavender, white words', s.kind === 'question' && s.tag === 'Question' && s.tagBg === DEEP.question && s.tagColor === 'rgb(255, 255, 255)', s);
    check('Aang question: icon and rim + tail in the mark lavender #b07cff (half strength)', s.icon === MARK.question && s.rimmed && s.rimTint?.c === MARK.question && s.rimTint?.o === '0.5', s);
    check('Aang question: who is "Aang", not a link; plaque gone; no Exactly this', s.who === 'Aang' && !s.door && !s.plaque && s.exact === null, s);
    check('Aang question: the answer rows wait (not shown on landing)', !s.keysShown && !s.kshow, s);
    await t.onBubble();
    await wait(800);
    s = await t.state();
    check('Aang question: still waiting 0.8 s into the hover', !s.keysShown, s);
    await wait(1000);
    s = await t.state();
    check('Aang question: rows slide in after 1.5 s of hover', s.kshow && s.keysShown && s.keys.includes('Lo-fi, no words'), s);
    await t.move(5, 5);
    await wait(400);
    s = await t.state();
    check('Aang question: once out they stay when the mouse leaves', s.keysShown, s);
    await t.shot('aangq');
    check('Aang question: no page errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  // ---------------------------------------------------------------- Aang asking first (an OK)
  {
    const t = await open();
    await t.js(`window.__deliver({ t: 'permission', id: 'p-1', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB. Nothing else uses them.', exact: 'AangApp\\\\build: old-1, old-2, old-3' }); true`);
    await wait(1300);
    let s = await t.state();
    check('Aang OK: kind ok, tag "Needs your OK" deep blue', s.kind === 'ok' && s.tag === 'Needs your OK' && s.tagBg === DEEP.ok, s);
    check('Aang OK: icon and rim in the mark blue #7cc4ff', s.icon === MARK.ok && s.rimTint?.c === MARK.ok, s);
    check('Aang OK: "Exactly this" quotes the thing word for word', /^Exactly this:“AangApp\\build: old-1, old-2, old-3”$/.test(s.exact ?? ''), s.exact);
    check('Aang OK: keys wait', !s.keysShown, s);
    await t.shot('aangok-rest');
    await t.onBubble();
    await wait(1900);
    s = await t.state();
    check('Aang OK: Allow / Not this time after the hover', s.keysShown && s.keys.join('|') === 'Allow|Not this time', s.keys);
    const allow = await t.js<string>(`getComputedStyle(document.querySelector('#asks .key.primary')).backgroundImage`);
    check('Aang OK: Allow is the OK blue, not the answer yellow', /154, 210, 255|90, 166, 224/.test(allow), allow);
    t.w.destroy();
  }

  // ---------------------------------------------------------------- Claude asks (the card in the closed bubble)
  for (const [name, item, kind] of [['claudeok', CPERM, 'ok'], ['claudeq', CQ, 'question'], ['plan', CPLAN, 'plan']] as const) {
    const t = await open();
    await t.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}] }); window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(item)}] }); true`);
    await wait(1400);
    let s = await t.state();
    const word = { ok: 'Needs your OK', question: 'Question', plan: 'Plan to OK' }[kind];
    check(`Claude ${name}: kind ${kind}, tag "${word}" on ${DEEP[kind]}`, !s.hidden && s.kind === kind && s.tag === word && s.tagBg === DEEP[kind], s);
    check(`Claude ${name}: icon + rim in the mark ${MARK[kind]}`, s.icon === MARK[kind] && s.rimTint?.c === MARK[kind] && s.rimTint?.o === (kind === 'plan' ? '0.7' : '0.5'), s);
    check(`Claude ${name}: who "Claude · Waymark" is the door; no Claude's words`, s.who === 'Claude · Waymark' && s.door && !s.words, s);
    check(`Claude ${name}: Exactly this ${kind === 'ok' ? 'shows the command' : 'is absent'}`, kind === 'ok' ? s.exact === 'Exactly this:“npm test -- routes”' : s.exact === null, s.exact);
    check(`Claude ${name}: keys wait for the hover`, !s.keysShown, s);
    if (kind === 'plan') await t.shot('plan-rest');
    await t.onBubble();
    await wait(1900);
    s = await t.state();
    const want = { ok: 'Allow|Always|Not this time|No, and...', question: 'Full-screen mapBEST|Split: map and list|Something else', plan: 'Go|Change it' }[kind];
    check(`Claude ${name}: keys in after 1.5 s: ${want}`, s.keysShown && s.keys.join('|').replace(/The map fills the screen\.|Turns listed underneath\./g, '') === want, s.keys);
    if (kind === 'ok') {
      await t.shot('claudeok-in');
      // The door, hovered: pointer, underline, a lift.
      const p = await t.js<{ x: number; y: number }>(`(() => { const r = document.querySelector('#ckpins .kwho.door').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
      await t.move(p.x, p.y);
      await wait(250);
      const hov = await t.js<any>(`(() => { const d = document.querySelector('#ckpins .kwho.door'), cs = getComputedStyle(d); return { hover: d.matches(':hover'), cursor: cs.cursor, deco: cs.textDecorationLine, tf: cs.transform }; })()`);
      check('Claude door: hand cursor, underline and a 1 px lift on hover', hov.cursor === 'pointer' && hov.deco.includes('underline') && /, -1\)$/.test(hov.tf), hov);
      await t.js(`window.__sent.length = 0; document.querySelector('#ckpins .kwho.door').click(); true`);
      await wait(200);
      const after = await t.js<any>(`({ sent: window.__sent.filter((x) => x[0] === 'openClaude' || x[0] === 'claude'), hidden: document.getElementById('bubble').hidden })`);
      check('Claude door: opens that exact session, answers nothing, bubble closes', JSON.stringify(after.sent) === JSON.stringify([['openClaude', ['claude://claude.ai/epitaxy/s-waymark']]]) && after.hidden === true, after);
    }
    check(`Claude ${name}: no page errors`, !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  // ---------------------------------------------------------------- untagged: plain news and a timer
  {
    const t = await open();
    await t.js(`window.__deliver({ t: 'bubble', text: 'Your build finished. Every test passed.', stream: false, turn: 11, proactive: true }); true`);
    await wait(1200);
    let s = await t.state();
    check('Plain news: no kind, no tag, rim untinted', !s.hidden && s.kind === null && s.tag === null && s.rimTint === null, s);
    await t.js(`window.__deliver({ t: 'timer.done', id: 't-1', total: 600000, label: 'Tea' }); true`);
    await wait(1200);
    s = await t.state();
    check('Timer: no kind, no tag', s.kind === null && s.tag === null && s.rimTint === null, s);
    // A new ask after a shown one starts at rest again.
    await t.js(`window.__deliver({ t: 'backup.ask', id: 'b-1', days: 4, changed: 12 }); true`);
    await wait(1200);
    s = await t.state();
    check('Backup offer: an OK, at rest, no Exactly this (nothing exact to quote)', s.kind === 'ok' && !s.kshow && s.exact === null, s);
    t.w.destroy();
  }

  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
}).catch((e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
