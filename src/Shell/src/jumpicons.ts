// The pictures on Samara's taskbar right-click list (moved out of taskbar.ts on 2026-11-20, phase 1 of Samara's own repo,
// docs/SAMARA-REPO-PLAN.md): the pop-out tasks' 16 px glyphs (taskbaricons.ts) written once as .ico files.
import { nativeImage } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TASK_GLYPH, glyphBitmap, icoFromPngs } from './taskbaricons.ts';
import type { PopoutTask } from './jumplist.ts';

/**
 * The right-click list's Pop-outs icons as .ico files (Windows reads a jump list's icons from files, after the Shell is
 * gone too): made once into `dir`, from the same pixels as the buttons. Gather wears Aang's own face (`aangIco`).
 */
export function jumpIcons(dir: string, aangIco: string): Partial<Record<PopoutTask, string>> {
  const out: Partial<Record<PopoutTask, string>> = { 'popouts-gather': aangIco };
  try { mkdirSync(dir, { recursive: true }); } catch { return out; }
  for (const [task, glyph] of Object.entries(TASK_GLYPH)) {
    const f = path.join(dir, `jump-${glyph}.ico`);
    try {
      if (!existsSync(f)) {
        const png = (k: number) => nativeImage.createFromBitmap(glyphBitmap(glyph, k), { width: 16 * k, height: 16 * k }).toPNG();
        writeFileSync(f, icoFromPngs([{ size: 16, png: png(1) }, { size: 32, png: png(2) }]));
      }
      out[task as PopoutTask] = f;
    } catch { /* that one keeps the lantern */ }
  }
  return out;
}
