// Live account usage from the stream's rate_limit_event, and Joshua's rule: warn at 40% of the week,
// offer to save quota at 50% (opt-in, switch in and out any time). Utilization is account-level, so it
// already includes anyone else using the account.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';
import type { QuotaLevel } from './protocol.ts';

export interface Quota {
  five: number;
  week: number;
  fiveResetsAt: number;
  weekResetsAt: number;
}

/** Accepts the raw event, or its `rate_limit_info`. Returns null if it carries no usage numbers. */
export function parseRateLimit(ev: any): Quota | null {
  const info = ev?.rate_limit_info ?? ev;
  const w = info?.unifiedWindows;
  const five = w?.five_hour?.utilization;
  const week = w?.seven_day?.utilization;
  if (typeof five !== 'number' && typeof week !== 'number') return null;
  return {
    five: typeof five === 'number' ? five : 0,
    week: typeof week === 'number' ? week : 0,
    fiveResetsAt: w?.five_hour?.resetsAt ?? 0,
    weekResetsAt: w?.seven_day?.resetsAt ?? 0,
  };
}

export type Notice = 'warn' | 'offer' | null;

export class QuotaPolicy {
  static readonly WARN_AT = 0.4;
  static readonly OFFER_AT = 0.5;
  static readonly RESET_BELOW = 0.35; // hysteresis so a flickering reading does not re-announce

  saving = false;
  private warned = false;
  private offered = false;
  private declined = false;
  last: Quota | null = null;
  /** Where saving mode is remembered, or null when nothing was given (tests). */
  private file: string | null = null;

  /**
   * Saving mode used to live only in memory, so every restart turned it off and offered it again.
   * This machine restarted 4 to 22 times a day over 1 to 4 October while his week sat at 72% to 88%,
   * which is why the only duplicated message in his history is the "want me to save quota?" offer.
   * Decision 47, step Q2.
   */
  constructor(stateDir?: string) {
    if (!stateDir) return;
    this.file = path.join(stateDir, 'saving.json');
    try {
      if (!existsSync(this.file)) return;
      const j = JSON.parse(readFileSync(this.file, 'utf8').replace(/^﻿/, ''));
      this.saving = j.saving === true;
      this.declined = j.declined === true;
      // The one-time notices are remembered too, or a restart would say "you've used 88% of your
      // week" all over again, which at 4 to 22 restarts a day is the same nagging by another name.
      this.warned = j.warned === true;
      this.offered = j.offered === true;
    } catch { /* an unreadable file just means the default: not saving */ }
  }

  private remember(): void {
    if (!this.file) return;
    try {
      writeFileAtomic(this.file, JSON.stringify({
        saving: this.saving, declined: this.declined, warned: this.warned, offered: this.offered,
      }));
    }
    catch (e) { reportWriteFailure(this.file, e); }
  }

  /** Feed a new reading. Returns which one-time notice (if any) should be shown now. */
  update(q: Quota): Notice {
    this.last = q;
    // A new week resets the one-time notices, and that reset has to be remembered too.
    if (q.week < QuotaPolicy.RESET_BELOW && (this.warned || this.offered || this.declined)) {
      this.warned = false; this.offered = false; this.declined = false;
      this.remember();
    }
    if (q.week >= QuotaPolicy.OFFER_AT && !this.saving && !this.declined && !this.offered) {
      this.offered = true; this.warned = true;
      this.remember();
      return 'offer';
    }
    if (q.week >= QuotaPolicy.WARN_AT && !this.warned) {
      this.warned = true;
      this.remember();
      return 'warn';
    }
    return null;
  }

  setSaving(on: boolean): void {
    this.saving = on;
    if (on) this.declined = false;
    else if ((this.last?.week ?? 0) >= QuotaPolicy.OFFER_AT) this.declined = true; // "not now": do not nag
    this.remember();
  }

  get level(): QuotaLevel {
    if (this.saving) return 'saving';
    const w = this.last?.week ?? 0;
    if (w >= QuotaPolicy.OFFER_AT && !this.declined) return 'offer';
    if (w >= QuotaPolicy.WARN_AT) return 'warn';
    return 'ok';
  }
}
