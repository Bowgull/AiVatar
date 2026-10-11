// 6.17 Highlight: the text he has selected in the app in front, read by the window reader (Reader,
// `--selection`). Read only: nothing is copied, typed or changed, and his clipboard is never touched.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { READER } from './screen.ts';

export interface Selection { ok: boolean; text: string; app: string; error?: string }

export function readSelection(): Promise<Selection> {
  if (!existsSync(READER)) return Promise.resolve({ ok: false, text: '', app: '', error: 'the window reader is not built' });
  return new Promise(resolve => {
    let out = '';
    const child = spawn(READER, ['--selection'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const kill = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 3500);
    kill.unref?.();
    child.stdout.on('data', d => { out += d; });
    child.on('close', () => {
      clearTimeout(kill);
      const line = out.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
      try {
        const j = JSON.parse(line);
        resolve({ ok: j.ok === true && typeof j.text === 'string' && j.text.length > 0, text: String(j.text ?? ''), app: String(j.app ?? ''), ...(j.error ? { error: String(j.error) } : {}) });
      } catch { resolve({ ok: false, text: '', app: '', error: 'the reader did not answer' }); }
    });
    child.on('error', e => { clearTimeout(kill); resolve({ ok: false, text: '', app: '', error: e.message }); });
  });
}
