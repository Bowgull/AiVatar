// The update engine's PC half (2026-10-30): Samara's own code from GitHub (pcupdate.ts) and the castLabs engine
// (engineupdate.ts) as the engine's two sources, so the PC keeps his key by the same rules as the Mac
// (updateengine.ts). On the PC the pet restarts Samara onto whatever was pointed at.
import { titleOf } from './ghrelease.ts';
import type { EngineUpdates } from './engineupdate.ts';
import type { SamaraUpdates } from './pcupdate.ts';
import type { CardGroup, Offer, Source } from './updateengine.ts';

export function pcSamara(su: SamaraUpdates): Source {
  return {
    id: 'samara', onKey: true,
    ready: (): Offer | null => {
      const r = su.ready;
      return r ? { version: r.version, since: r.since, title: titleOf(r), groups: [{ name: 'SAMARA', items: r.notes.map((text) => ({ text })) }], canBack: su.canBack() } : null;
    },
    check: (why) => su.check(why),
    go: async () => (su.go() ? { ok: true } : { ok: false, why: 'The update is not ready yet. It will show up again when it is.' }),
    file: () => su.put(), skip: () => su.skip(),
    canBack: () => !!su.pointer() && su.canBack(), back: () => su.goBack(),
    checkNow: () => su.checkNow(),
  };
}

/** Sheet 105's lines for a new engine: video wins, so there are no tick boxes. */
export function engineGroups(version: string, since: number, where: string, now = Date.now()): CardGroup[] {
  const days = Math.floor((now - since) / 86_400_000);
  return [{ name: "SAMARA'S ENGINE", items: [
    { text: "Chrome's newest security fixes.", note: `castLabs ${version}, out ${days < 1 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}.` },
    { text: 'Netflix and Prime keep playing in your tabs.', note: `Signed for video on this ${where}.` },
  ] }];
}

export function pcEngine(eu: EngineUpdates, o: { browserOpen: () => boolean }): Source & { overnight: { title: string; lines: string[] } | null } {
  const src = {
    id: 'engine' as const, onKey: true,
    /** Set by the engine just before an overnight update, for the "updated while you slept" line. */
    overnight: null as { title: string; lines: string[] } | null,
    ready: (): Offer | null => {
      if (eu.signin && eu.signinFor) return { version: eu.signinFor.version, since: eu.signinFor.since, title: `Samara's engine ${eu.signinFor.version}`, groups: engineGroups(eu.signinFor.version, eu.signinFor.since, 'PC'), signin: eu.signin };
      const r = eu.ready;
      if (!r) return null;
      return { version: r.version, since: r.since, title: `Samara's engine ${r.version}`, groups: engineGroups(r.version, r.since, 'PC'), canBack: eu.canBack(), ...(eu.behind ? { behind: eu.behind } : {}) };
    },
    check: () => eu.check(),
    go: () => eu.restartNow(o.browserOpen(), undefined, src.overnight ?? undefined),
    file: () => eu.file(), skip: () => eu.skip(),
    canBack: () => eu.canBack(), back: () => eu.goBack(),
    checkNow: () => { void eu.checkNow(); },
    signin: () => eu.openSignin(),
  };
  return src;
}
