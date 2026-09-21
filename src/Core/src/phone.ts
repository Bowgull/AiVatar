// What Aang tells Joshua's phone without asking the model, and what may leave this machine for it.
// Pure, so it is tested for free.
import path from 'node:path';

const TZ = 'America/Toronto';
const clock = (d: Date) => d.toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
/** Reset times arrive as unix seconds; tolerate milliseconds too. */
const at = (v: number) => new Date(v < 1e12 ? v * 1000 : v);

export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h} h ${r} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export interface StatusInfo {
  now: Date;
  startedAt: Date;
  desktop: boolean;
  atDesk: boolean;
  discord: boolean;
  working: boolean;
  muted: boolean;
  quota: { five: number; week: number; fiveResetsAt: number; weekResetsAt: number } | null;
  claudeSessions: string;
  reminders: number;
}

export function statusText(i: StatusInfo): string {
  const lines: string[] = [];
  lines.push(`Aang is up (since ${clock(i.startedAt)}).${i.working ? ' Working on something right now.' : ''}`);
  lines.push(i.desktop ? `Desktop: connected, and you are ${i.atDesk ? 'at the PC' : 'away from it'}.` : 'Desktop: not connected, so I cannot reach your windows.');
  if (i.muted) lines.push('Muted: nothing unprompted goes to the desktop.');
  if (i.quota) {
    const q = i.quota;
    const wk = q.weekResetsAt ? `, resets in ${span(at(q.weekResetsAt).getTime() - i.now.getTime())}` : '';
    const fv = q.fiveResetsAt ? `, resets in ${span(at(q.fiveResetsAt).getTime() - i.now.getTime())}` : '';
    lines.push(`Your week: ${Math.round(q.week * 100)}% used${wk}. Last 5 hours: ${Math.round(q.five * 100)}%${fv}.`);
  } else lines.push('Your week: no usage reading yet. It appears after my first reply.');
  lines.push(i.claudeSessions.trim() || 'No Claude Code sessions are running right now.');
  lines.push(i.reminders ? `Reminders waiting: ${i.reminders}.` : 'No reminders waiting.');
  return lines.join('\n');
}

// ------------------------------------------------------------------ what may be sent out

export const MAX_SEND_BYTES = 8 * 1024 * 1024;   // Discord's upload limit without boosts is 10 MB; leave room

/** Files that hold secrets. Never sent anywhere, however he asks, and no yes can change that. */
const SECRET = [
  /[\\/]\.ssh[\\/]/i, /[\\/]\.gnupg[\\/]/i, /[\\/]\.aws[\\/]/i, /[\\/]\.env(\.|$)/i, /\.(pem|key|pfx|p12|kdbx|ppk)$/i,
  /(^|[\\/])(id_rsa|id_ed25519|credentials|secrets?)(\.|$|[\\/])/i, /discord\.token/i, /(^|[\\/])(Login Data|Cookies|Web Data|Local State)$/i,
  /[\\/]Microsoft[\\/](Credentials|Protect|Vault)[\\/]/i, /[\\/]\.claude[\\/]?\.credentials/i, /[\\/]\.claude\.json$/i,
];
export function whyNotSend(file: string, protectedDirs: string[]): string | null {
  if (!path.isAbsolute(file)) return 'give the full path, starting with the drive';
  const full = path.resolve(file).toLowerCase();
  for (const d of protectedDirs) {
    const dd = path.resolve(d).toLowerCase();
    if (full === dd || full.startsWith(dd + path.sep)) return 'that is inside my own settings and memory, which never leave this machine';
  }
  if (SECRET.some(r => r.test(file))) return 'that looks like it holds a password, key or login, and those never leave this machine';
  return null;
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json' };
export const mimeOf = (file: string) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';


