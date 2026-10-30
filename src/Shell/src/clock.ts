// The clock engine (2026-10-30): his time zone in one place, and the handful of ways a time is written here.
//
// "America/Toronto" used to be typed into ~16 files with ~21 formatters of their own. Each helper below is exactly one
// of those formatters (same locale, same options), so moving a file onto it changes no text he sees.
//
// ONE FILE, TWO COPIES, like atomic.ts: src/Core/src/clock.ts and src/Shell/src/clock.ts must match (test/twins.test.ts).

/** Where he lives. Every "today", every "2:30 pm" is in this zone, on the Mac and on Shadow alike. */
export const HOME_TZ = 'America/Toronto';

type When = Date | number | string;
const at = (w: When): Date => (w instanceof Date ? w : new Date(w));

/** Any formatter, in his zone: homeTime(d, { weekday: 'long' }). The named ones below are the common cases. */
export const homeTime = (w: When, opts: Intl.DateTimeFormatOptions = {}, locale = 'en-US'): string =>
  at(w).toLocaleString(locale, { ...opts, timeZone: HOME_TZ });
/** A date-only formatter in his zone (toLocaleDateString). */
export const homeDate = (w: When, opts: Intl.DateTimeFormatOptions = {}, locale = 'en-US'): string =>
  at(w).toLocaleDateString(locale, { ...opts, timeZone: HOME_TZ });
/** A time-only formatter in his zone (toLocaleTimeString). */
export const homeClock = (w: When, opts: Intl.DateTimeFormatOptions = {}, locale = 'en-US'): string =>
  at(w).toLocaleTimeString(locale, { ...opts, timeZone: HOME_TZ });

/** His calendar day as a key: "2026-10-30". */
export const dayKey = (w: When = new Date()): string => homeDate(w, {}, 'en-CA');
/** "2:31 pm" (lower case, no leading zero). */
export const shortTime = (w: When): string => homeClock(w, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
/** "2:31 PM", as the browser writes it. */
export const shortTimeUpper = (w: When): string => homeClock(w, { hour: 'numeric', minute: '2-digit' });
/** "Friday, October 30, 2026 at 2:31 PM". */
export const fullMoment = (w: When): string =>
  homeTime(w, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "October 30, 2026" (a release date). */
export const longDate = (w: When): string => homeDate(w, { year: 'numeric', month: 'long', day: 'numeric' }, 'en-CA');
/** His hour, 0 to 23. */
export const homeHour = (w: When = new Date()): number => Number(homeClock(w, { hour: '2-digit', hour12: false }, 'en-GB').slice(0, 2));
/** "2026-10-30-14-31-07": a time safe in a file name. */
export const fileStamp = (w: When = new Date()): string => homeTime(w, {}, 'sv-SE').replace(/[: ]/g, '-').slice(0, 19);

/** "2026-10-30 14:31:07" in this machine's own zone (shell.log). */
export function localStamp(w: When = new Date()): string {
  const d = at(w), z = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
/** "2026-10-30 18:31:07" in UTC (aang.log on the Mac). */
export const utcStamp = (w: When = new Date()): string => at(w).toISOString().slice(0, 19).replace('T', ' ');
