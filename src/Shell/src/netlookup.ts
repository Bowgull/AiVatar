// DNS rebinding guard (Phase 1, parity sweep 2026-11-12): "rebind.example.com" can point at 192.168.1.1, and the
// name-only check let a public page reach his router through it. Each name a public page's parts go to is looked up
// once a minute; a name whose address is on this computer or the home network is treated as such.
import { lookup } from 'node:dns/promises';
import { privateHost } from './driverrules.ts';

const KEEP_MS = 60_000, MAX = 2000;
const seen = new Map<string, { inward: boolean; at: number }>();

/** Does this name lead to this computer or the home network? A name that does not resolve is left to the engine. */
export async function resolvesInward(host: string, look: typeof lookup = lookup): Promise<boolean> {
  const now = Date.now();
  const hit = seen.get(host);
  if (hit && now - hit.at < KEEP_MS) return hit.inward;
  let inward = false;
  try { inward = (await look(host, { all: true })).some((a) => privateHost(a.address)); } catch { inward = false; }
  if (seen.size >= MAX) seen.clear();
  seen.set(host, { inward, at: now });
  return inward;
}
