// Sheet 69 (his picks, 2026-10-22): a site may talk to a keyboard or mouse he picked for it (WebHID), asked once per
// site and remembered; Forget in the shield takes it back. Kept on this machine only: the devices are plugged in here.
//
// A device is known by its maker and model number (and serial, when it has one), never by Chromium's per-run id.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

export interface KnownDevice { key: string; name: string }
/** The parts of an Electron HIDDevice this needs. */
export interface HidLike { vendorId: number; productId: number; serialNumber?: string; name?: string }

export const deviceKey = (d: HidLike): string => `${d.vendorId}:${d.productId}:${String(d.serialNumber ?? '').slice(0, 64)}`;
/** The name to show: the device's own, tidied; a blank one says what it is. */
export const deviceName = (d: HidLike): string => String(d.name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Keyboard or mouse';

export class DeviceOk {
  private sites = new Map<string, KnownDevice[]>();
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try {
      if (!existsSync(file)) return;
      const j = JSON.parse(readFileSync(file, 'utf8'));
      for (const [host, list] of Object.entries(j ?? {})) {
        if (!/^[a-z0-9.-]+$/.test(host) || !Array.isArray(list)) continue;
        const ok = (list as KnownDevice[]).filter((d) => typeof d?.key === 'string' && /^\d+:\d+:/.test(d.key) && typeof d?.name === 'string').slice(0, 20);
        if (ok.length) this.sites.set(host, ok.map((d) => ({ key: d.key.slice(0, 100), name: d.name.slice(0, 60) })));
      }
    } catch { /* none kept */ }
  }
  /** May this site use this device without asking? */
  allowed(host: string, d: HidLike): boolean { const k = deviceKey(d); return (this.sites.get(host) ?? []).some((x) => x.key === k); }
  list(host: string): KnownDevice[] { return [...(this.sites.get(host) ?? [])]; }
  add(host: string, d: HidLike): void {
    if (!/^[a-z0-9.-]+$/.test(host) || this.allowed(host, d)) return;
    this.sites.set(host, [...this.list(host), { key: deviceKey(d), name: deviceName(d) }].slice(-20));
    this.save();
  }
  forget(host: string, key: string): void {
    const left = this.list(host).filter((x) => x.key !== key);
    if (left.length) this.sites.set(host, left); else this.sites.delete(host);
    this.save();
  }
  private save(): void {
    try { writeFileAtomic(this.file, JSON.stringify(Object.fromEntries(this.sites))); } catch (e) { console.error('shell: the device list could not be saved: ' + (e as Error).message); }
  }
}
