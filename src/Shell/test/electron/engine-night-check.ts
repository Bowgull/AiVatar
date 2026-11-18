// Phase 2 of the browser plan (his call, 2026-11-17): a passing engine with Chrome security fixes goes in by itself
// overnight, on trial, and a broken one goes back. This plays one night through with Samara's real update code
// (updateengine.ts, pcsource.ts, engineupdate.ts) on throwaway engine folders: the clock says 3:15 am, he has been away
// an hour, no call, no game, and his "Update by itself overnight" toggle is OFF.
//
//   1. A security engine (44.99.0) is ready. The night tick puts it in: engines/current.json points at it as a TRIAL,
//      with the engine before as the way back, and Samara restarts (exit 75, as for any update).
//   2. The new engine starts (as the pet would start it) and marks itself good after its trial.
//   3. A second security engine that is broken (44.98.0: it exits at once) is put in the same way. The pet's own
//      rollback (src/Body/EnginePointer.cs, run by Body.Tests EngineNightRollback) sends it back; here, Samara then
//      never offers it again (failed.txt) and says nothing about an update that did not happen.
//
// The engine folders are hard links to the stock engine's files (nothing copied, nothing of his touched); every child
// runs as plain Node (ELECTRON_RUN_AS_NODE), so no window is made at all.
//
// Run: node --no-warnings test/electron/engine-night-check.ts
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const SHELL = path.resolve(path.dirname(HERE), '..', '..');

if (process.argv[2] === 'child') await child(process.argv[3]!, process.argv[4]!, process.argv[5]!);
else await main();

/** Inside an engine (run as Node): what Samara itself does. */
async function child(step: string, shellDir: string, stateDir: string): Promise<void> {
  const { EngineUpdates } = await import('../../src/engineupdate.ts');
  const { pcEngine } = await import('../../src/pcsource.ts');
  const { UpdateEngine } = await import('../../src/updateengine.ts');
  const eu = new EngineUpdates({ shellDir, stateDir, quietNow: () => false, changed: () => {} });
  if (step === 'night') {
    const src = pcEngine(eu, { browserOpen: () => true });
    const engine = new UpdateEngine({
      sources: [src], overnight: () => false,
      moment: () => ({ now: new Date(2026, 10, 18, 3, 15), idleSeconds: 3600, inCall: false, inGame: false, work: null }),
      changed: (c) => console.log(`KEY ${JSON.stringify({ version: c?.version, security: c?.security, tonight: c?.tonight })}`),
      beforeGo: (w) => { src.overnight = w.overnight ? { title: w.title, lines: w.lines } : null; },
      restart: (w) => { console.log(`RESTART ${JSON.stringify(w)}`); process.exit(75); },
      log: (s) => console.log(s),
    });
    await engine.tick();
    console.log('NO RESTART'); process.exit(0);
  }
  if (step === 'trial') {
    console.log(`RUNNING ${process.versions.electron} from ${path.basename(path.dirname(process.execPath))}`);
    eu.trialCheck(1500);
    await new Promise((r) => setTimeout(r, 3000));
    process.exit(0);
  }
  if (step === 'after') {
    console.log(`JUST ${JSON.stringify(eu.justUpdated())}`);
    process.exit(0);
  }
}

async function main(): Promise<void> {
  let bad = 0;
  const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
  const T = mkdtempSync(path.join(os.tmpdir(), 'engine-night-'));
  const shell = path.join(T, 'shell'), state = path.join(T, 'state'), engines = path.join(shell, 'engines');
  mkdirSync(state, { recursive: true });
  const dist = path.join(SHELL, 'node_modules', 'electron', 'dist');
  const link = (from: string, to: string) => {
    mkdirSync(to, { recursive: true });
    for (const n of readdirSync(from)) {
      const a = path.join(from, n), b = path.join(to, n);
      if (statSync(a).isDirectory()) link(a, b); else linkSync(a, b);
    }
  };
  link(dist, path.join(engines, '44.7.0'));    // the engine running today
  link(dist, path.join(engines, '44.99.0'));   // a newer one with security fixes
  // The engine folder needs the Shell's code beside it, as in the real src/Shell: the children import it from here.
  writeFileSync(path.join(engines, 'current.json'), JSON.stringify({ version: '44.7.0', dir: '44.7.0', status: 'good', previous: null, at: new Date().toISOString() }));
  const pointer = () => JSON.parse(readFileSync(path.join(engines, 'current.json'), 'utf8'));
  const run = (dir: string, step: string) => {
    const r = spawnSync(path.join(engines, dir, 'electron.exe'), [HERE, 'child', step, shell, state], { cwd: SHELL, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60_000, windowsHide: true });
    return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const ready = (v: string) => writeFileSync(path.join(state, 'engine-update.json'), JSON.stringify({ version: v, since: Date.now() - 3_600_000, castlabs: false, security: true }));

  // ---------------------------------------------------------------- 1. the night tick puts it in
  ready('44.99.0');
  const n1 = run('44.7.0', 'night');
  console.log(n1.out.split('\n').filter((l) => /^(KEY|RESTART|update:|shell:)/.test(l)).join('\n'));
  check('at 3:15 am, idle, toggle off: the security engine goes in and Samara restarts', n1.code === 75 && /RESTART .*"sources":\["engine"\].*"overnight":true/.test(n1.out), `exit ${n1.code}`);
  const p1 = pointer();
  check('it is pointed at as a TRIAL, with today\'s engine as the way back', p1.version === '44.99.0' && p1.status === 'trial' && p1.previous?.dir === '44.7.0', JSON.stringify(p1));
  const done = JSON.parse(readFileSync(path.join(state, 'engine-just-updated.json'), 'utf8'));
  check('it is noted as put in overnight, for the "updated while you slept" card', done.overnight === true && done.to === '44.99.0', JSON.stringify(done));

  // ---------------------------------------------------------------- 2. it runs, and passes its trial
  const t = run('44.99.0', 'trial');
  check('the new engine starts and marks itself good after its trial', t.code === 0 && pointer().status === 'good' && pointer().version === '44.99.0', `${t.out.trim().split('\n').filter((l) => /RUNNING|passed/.test(l)).join(' | ')} -> ${JSON.stringify(pointer())}`);

  // ---------------------------------------------------------------- 3. a broken one: put in, then sent back
  // 44.98.0 "exits at once": Windows' own where.exe with no arguments (exit 2), standing in for an engine that crashes.
  // The fake is newer than nothing here, so the pointer is made by hand as the night tick would make it.
  mkdirSync(path.join(engines, '44.98.0'));
  copyFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe'), path.join(engines, '44.98.0', 'electron.exe'));
  writeFileSync(path.join(engines, 'current.json'), JSON.stringify({ version: '44.98.0', dir: '44.98.0', status: 'trial', previous: { version: '44.99.0', dir: '44.99.0' }, at: new Date().toISOString() }));
  writeFileSync(path.join(state, 'engine-just-updated.json'), JSON.stringify({ from: '44.7.0', to: '44.98.0', browser: true, overnight: true, title: "Samara's engine 44.98.0", lines: [] }));
  const started = Date.now();
  const broken = spawnSync(path.join(engines, '44.98.0', 'electron.exe'), [], { encoding: 'utf8', windowsHide: true });
  const ranFor = Date.now() - started;
  check('the broken engine dies at once', broken.status !== 0 && ranFor < 60_000, `exit ${broken.status} after ${ranFor} ms`);
  // The pet's rollback is C# (EnginePointer.AfterExit); Body.Tests runs it on this exact layout. Here, its result:
  const dotnet = spawnSync('dotnet', ['test', path.join(SHELL, '..', '..', 'tests', 'Body.Tests'), '--nologo', '-v', 'q', '--filter', 'FullyQualifiedName~EngineNightRollback'], { encoding: 'utf8', env: { ...process.env, AANG_NIGHT_SHELL: shell, AANG_NIGHT_RANMS: String(ranFor) }, timeout: 300_000, windowsHide: true });
  const passedLine = (dotnet.stdout ?? '').split('\n').find((l) => /Passed!|Failed!|error/i.test(l)) ?? (dotnet.stdout ?? '').slice(-400);
  check("the pet's own rollback (EnginePointer.AfterExit) runs on it", dotnet.status === 0, passedLine.trim());
  const p3 = pointer();
  check('it went back to the engine before, marked good', p3.version === '44.99.0' && p3.status === 'good' && p3.previous === null, JSON.stringify(p3));
  const failed = existsSync(path.join(engines, 'failed.txt')) ? readFileSync(path.join(engines, 'failed.txt'), 'utf8') : '';
  check('the broken one is on failed.txt, never offered again', /^44\.98\.0\s*$/m.test(failed), JSON.stringify(failed));
  const a = run('44.99.0', 'after');
  check('back on the old engine, Samara says nothing about an update that did not happen', /JUST null/.test(a.out), a.out.trim().split('\n').at(-1));

  try { rmSync(T, { recursive: true, force: true }); } catch { /* temp; hard links only */ }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
}
