// Live account usage from the stream's rate_limit_event, and Joshua's rule: warn at 40% of the week,
// offer to save quota at 50% (opt-in, switch in and out any time). Utilization is account-level, so it
// already includes anyone else using the account.
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

  /** Feed a new reading. Returns which one-time notice (if any) should be shown now. */
  update(q: Quota): Notice {
    this.last = q;
    if (q.week < QuotaPolicy.RESET_BELOW) { this.warned = false; this.offered = false; this.declined = false; }
    if (q.week >= QuotaPolicy.OFFER_AT && !this.saving && !this.declined && !this.offered) {
      this.offered = true; this.warned = true;
      return 'offer';
    }
    if (q.week >= QuotaPolicy.WARN_AT && !this.warned) {
      this.warned = true;
      return 'warn';
    }
    return null;
  }

  setSaving(on: boolean): void {
    this.saving = on;
    if (on) this.declined = false;
    else if ((this.last?.week ?? 0) >= QuotaPolicy.OFFER_AT) this.declined = true; // "not now": do not nag
  }

  get level(): QuotaLevel {
    if (this.saving) return 'saving';
    const w = this.last?.week ?? 0;
    if (w >= QuotaPolicy.OFFER_AT && !this.declined) return 'offer';
    if (w >= QuotaPolicy.WARN_AT) return 'warn';
    return 'ok';
  }
}
