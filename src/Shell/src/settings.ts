// The pop-out's switches, from sheet 4 section 7.
//
// Each one is a thing he asked for, and each default is the one he chose, not a guess:
//   alwaysOnTop   on   it exists to sit over WoW
//   rememberSize  on   "your size wins" (sheet 4, section 3)
//   fadeControls  on   the wood gets out of the way while the video plays
//   smoothVideo   on   backgroundThrottling off, measured free in 6.1
//   clickThrough  OFF  decision 32: it is a normal window. This is the optional switch, never the default
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';

export interface PopoutSettings {
  alwaysOnTop: boolean;
  rememberSize: boolean;
  fadeControls: boolean;
  smoothVideo: boolean;
  /** Clicks land on the game behind instead of the picture. His decision 32: off unless he asks. */
  clickThrough: boolean;
}

export const DEFAULTS: PopoutSettings = {
  alwaysOnTop: true,
  rememberSize: true,
  fadeControls: true,
  smoothVideo: true,
  clickThrough: false,
};

export const settingsFile = (stateDir: string) => path.join(stateDir, 'popout-settings.json');

export function readSettings(stateDir: string): PopoutSettings {
  try {
    const f = settingsFile(stateDir);
    if (!existsSync(f)) return { ...DEFAULTS };
    const j = JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof PopoutSettings)[]) {
      if (typeof j?.[k] === 'boolean') out[k] = j[k];
    }
    return out;
  } catch {
    // An unreadable file means the defaults, not a refusal to open: he should never lose the pop-out
    // because a settings file got mangled.
    return { ...DEFAULTS };
  }
}

export function writeSettings(stateDir: string, s: PopoutSettings): void {
  const f = settingsFile(stateDir);
  try { writeFileAtomic(f, JSON.stringify(s, null, 2)); }
  catch (e) { reportWriteFailure(f, e); }
}
