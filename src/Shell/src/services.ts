// Which video services are paid, and therefore which ones are allowed into the DRM runtime.
//
// This list is a security boundary, not a convenience. The DRM runtime is castLabs Electron, which
// trails the stock build's security fixes by weeks, so the rule is: nothing loads there except the
// handful of sites that actually need Widevine. Everything else, including every ordinary web page,
// stays in the stock Shell.
//
// It is an allow-list on the HOST, never on the whole address, because a path can be anything.

/** The services he actually uses (decision 29). Netflix waits on castLabs signing (decision 31). */
export const PAID_SERVICES = [
  { id: 'prime', label: 'PRIME', hosts: ['primevideo.com', 'amazon.com', 'amazon.ca', 'amazon.co.uk'], ready: true },
  { id: 'crunchyroll', label: 'CRUNCHYROLL', hosts: ['crunchyroll.com'], ready: true },
  // Netflix rejects a development build outright with error M7121-1331. It only works once the app is
  // signed through castLabs' free EVS, which is his to sign up for (decision 31).
  { id: 'netflix', label: 'NETFLIX', hosts: ['netflix.com'], ready: false },
] as const;

export type ServiceId = typeof PAID_SERVICES[number]['id'];

export interface Service {
  id: ServiceId;
  label: string;
  /** False while something outside the code has to happen first, like Netflix's signing. */
  ready: boolean;
}

/** True if this host is the given host, or a subdomain of it. Never a loose "contains". */
const isHost = (host: string, root: string) => host === root || host.endsWith('.' + root);

/** Which paid service a link belongs to, or null if it is not one. */
export function serviceFor(link: string): Service | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== 'https:') return null;        // a paid service that is not on https is not itself
  const host = u.hostname.toLowerCase();
  for (const s of PAID_SERVICES) {
    if (s.hosts.some(h => isHost(host, h))) return { id: s.id, label: s.label, ready: s.ready };
  }
  return null;
}

/** Everything the DRM runtime is allowed to load. Used to refuse navigation inside it. */
export function allowedInDrm(link: string): boolean {
  return serviceFor(link) !== null;
}

/** What to tell him when a service is recognised but cannot play yet. */
export function notReadyBecause(id: ServiceId): string {
  if (id === 'netflix') {
    return 'Netflix will not play in a development build: it answers with error M7121-1331. '
      + 'It needs the free castLabs signing, which only you can sign up for.';
  }
  return 'That service is not ready yet.';
}
