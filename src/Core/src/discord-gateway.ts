// The real connections: discord.js to Discord, and a WebSocket to Aang's own Core. Deliberately thin - the
// decisions live in discord-logic.ts and discord.ts, where they are tested without a network.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { folderFor } from './claude.ts';
import { WebSocket } from 'ws';
import { DiscordAdapter } from './discord.ts';
import type { CoreLink } from './discord.ts';
import { DiscordGateway } from './discord-client.ts';
export { DiscordGateway };

/** Aang's own Core, as a client of its local connection - the same one the desktop Body uses. */
export class WsCoreLink implements CoreLink {
  private ws: WebSocket | null = null;
  private readonly cbs: ((m: any) => void)[] = [];
  private closed = false;
  private readonly port: number;
  constructor(port: number) { this.port = port; this.connect(); }
  private connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/body`);
    this.ws = ws;
    // Say who this is, so the Core sends Discord only what belongs here (see Core.whereHeIs).
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' })));
    ws.on('message', d => {
      let m: any; try { m = JSON.parse(String(d)); } catch { return; }
      if (m?.t === 'video.card') { const w = this.videoWait.get(String(m.id)); if (w) { this.videoWait.delete(String(m.id)); w(m); } return; }
      if (m?.t === 'mac.brief') { const w = this.macWait.get(String(m.id)); if (w) { this.macWait.delete(String(m.id)); w(m); } return; }
      if (m?.t === 'home.data') { const w = this.homeWait.get(String(m.id)); if (w) { this.homeWait.delete(String(m.id)); w(m); } return; }
      if (m?.t === 'card.png') { const w = this.cardWait.get(String(m.id)); if (w) { this.cardWait.delete(String(m.id)); w(m.ok && typeof m.png === 'string' ? Buffer.from(m.png, 'base64') : null); } return; }
      for (const cb of this.cbs) cb(m);
    });
    ws.on('close', () => { if (!this.closed) setTimeout(() => this.connect(), 2000).unref?.(); });
    ws.on('error', () => { /* close follows */ });
  }
  private send(o: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }
  /** 9.D D3: a card Aang draws, as a PNG, or null when it could not be drawn (then Discord gets plain text). */
  private cardSeq = 0;
  private readonly cardWait = new Map<string, (png: Buffer | null) => void>();
  drawCard(kind: string, data: unknown): Promise<Buffer | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = 'card' + ++this.cardSeq;
    return new Promise(res => {
      const t = setTimeout(() => { this.cardWait.delete(id); res(null); }, 20_000);
      this.cardWait.set(id, png => { clearTimeout(t); res(png); });
      this.send({ t: 'card.draw', id, kind, data });
    });
  }
  submit(id: string, text: string, opts: { ephemeral?: boolean; mode?: 'auto' | 'smart' } = {}) { this.send({ t: 'submit', id, text, mode: opts.mode ?? 'auto', ...(opts.ephemeral ? { ephemeral: true } : {}) }); }
  // Discord's own Yes/No only ever offers a binary choice (no verb button, no separate "always"), so yes maps
  // to 'always' - the same thing a plain "yes" always meant before the desktop bubble grew a third option.
  // Found live, 2026-09-22: this still sent the old {allow} shape after core.ts moved to {choice}, so every
  // "Yes" pressed in Discord was silently read as "no".
  // S2 2.11: a yes from his phone is for this once. "Always" is only ever given at the desktop, where he can read it.
  permission(id: string, allow: boolean) { this.send({ t: 'permission.reply', id, choice: allow ? 'once' : 'no' }); }
  runOnMac(text: string) { this.send({ t: 'mac.run', text }); }
  stop() { this.send({ t: 'stop' }); }
  status() { this.send({ t: 'status' }); }
  actions() { this.send({ t: 'actions' }); }
  trust() { this.send({ t: 'trust' }); }
  revoke(kind: string) { this.send({ t: 'revoke', kind }); }
  hush(minutes: number) { this.send({ t: 'hush', minutes }); }
  saving(on: boolean) { this.send({ t: 'saving', on }); }
  mailAct(id: string, hash: string, action: 'send' | 'save' | 'discard') { this.send({ t: 'mail.act', id, hash, action }); }
  brief() { this.send({ t: 'brief' }); }
  claudeReply(cwd: string, text: string) { this.send({ t: 'claude.reply', cwd, text }); }
  openClaude(cwd: string) { this.send({ t: 'claude.open', cwd }); }
  stepAway() { this.send({ t: 'away' }); }
  addIdea(text: string) { this.send({ t: 'idea.add', text }); }
  /** 9.D D7: watch a video and say what it is. Up to two minutes: Qwen reads it, or Claude Quick when it cannot. */
  private videoWait = new Map<string, (d: any) => void>(); private videoSeq = 0;
  watchVideo(url: string): Promise<any | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = 'vid' + ++this.videoSeq;
    return new Promise(res => {
      const t = setTimeout(() => { this.videoWait.delete(id); res(null); }, 150_000);
      this.videoWait.set(id, d => { clearTimeout(t); res(d); });
      this.send({ t: 'video.watch', id, url });
    });
  }
  putOn(words: string) { this.send({ t: 'puton', words }); }
  /** 9.D D6: the home card's numbers from the brain, or null if it does not answer. */
  private homeWait = new Map<string, (d: any) => void>(); private homeSeq = 0;
  homeData(): Promise<{ week: number | null; pace: string; running: number; waiting: string[] } | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = 'home' + ++this.homeSeq;
    return new Promise(res => {
      const t = setTimeout(() => { this.homeWait.delete(id); res(null); }, 10_000);
      this.homeWait.set(id, d => { clearTimeout(t); res(d); });
      this.send({ t: 'home.data', id });
    });
  }
  /** M4: what the Mac needs to answer as Aang while this PC is off; null if the brain does not answer. */
  private macWait = new Map<string, (d: any) => void>(); private macSeq = 0;
  macBrief(): Promise<{ prompt: string; facts: string[]; recent: { who: 'you' | 'Aang'; text: string }[] } | null> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = 'mac' + ++this.macSeq;
    return new Promise(res => {
      const t = setTimeout(() => { this.macWait.delete(id); res(null); }, 15_000);
      this.macWait.set(id, d => { clearTimeout(t); res(typeof d.prompt === 'string' ? { prompt: d.prompt, facts: d.facts ?? [], recent: d.recent ?? [] } : null); });
      this.send({ t: 'mac.brief', id });
    });
  }
  macHandled(items: import('./macbrain.ts').Handled[]) { this.send({ t: 'mac.handled', items }); }
  onEvent(cb: (m: any) => void) { this.cbs.push(cb); }
  close() { this.closed = true; this.ws?.close(); }
}

/**
 * M3: the MacBook's front desk, if it has been set up (frontdesk.json beside the key). Then the Mac holds the one
 * connection to Discord and this PC never logs in to Discord itself, so there are never two connections answering.
 */
export function frontDeskConfig(stateDir: string): { url: string; key: string } | null {
  try {
    const c = JSON.parse(readFileSync(path.join(stateDir, 'frontdesk.json'), 'utf8'));
    const key = readFileSync(path.join(stateDir, 'frontdesk.key'), 'utf8').trim();
    if (typeof c?.mac !== 'string' || !/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(c.mac) || !Number.isInteger(c.port) || key.length < 20) return null;
    return { url: `ws://${c.mac}:${c.port}`, key };
  } catch { return null; }
}

/** Start Discord if Joshua has set it up (a token file, or the Mac front desk). Never throws: Aang runs without it. */
export async function startDiscord(stateDir: string, port: number, log: (s: string) => void = console.log, attempt = 0, onRefused?: () => void): Promise<DiscordAdapter | null> {
  const jobDir = folderFor('job hunt');
  let made: { close: () => void } | null = null;
  const tokenFile = path.join(stateDir, 'discord.token');
  const desk = frontDeskConfig(stateDir);
  if (process.env.AANG_DISCORD === '0' || (!desk && !existsSync(tokenFile))) return null;
  try {
    let gw: import('./discord.ts').Gateway;
    if (desk) {
      const { FrontDeskGateway } = await import('./frontdesk-link.ts');
      const fd = new FrontDeskGateway({ url: desk.url, key: desk.key, log, ...(onRefused ? { onRefused } : {}) });
      made = fd;
      log('discord: waiting for the front desk on the MacBook');
      await fd.ready;
      gw = fd;
    } else {
      const token = readFileSync(tokenFile, 'utf8').trim();
      if (!token) return null;
      const dg = new DiscordGateway(token);
      await dg.login();
      gw = dg;
    }
    const adapter = new DiscordAdapter(gw, new WsCoreLink(port), stateDir, {
      catchUp: !desk,
      log, shortlistFile: path.join(jobDir, 'shortlist.json'), draftsFile: path.join(jobDir, 'drafts.json'),
      answersFile: path.join(jobDir, 'answers-approved.json'), appliedFile: path.join(jobDir, 'applied.json'), criteriaFile: path.join(jobDir, 'memory', 'project_job_search_criteria.md'),
      inboxDir: path.join(os.homedir(), 'Documents', 'AangInbox'),
    });
    await adapter.start();
    log('discord: connected');
    return adapter;
  } catch (e) {
    // Never left down until the next restart (found 2026-10-13): close this attempt's connection, so two never
    // fight over the front desk, and try again by itself, after a minute, then up to every five.
    try { made?.close(); } catch { /* gone */ }
    const wait = Math.min(5 * 60_000, 60_000 * 2 ** Math.min(attempt, 3));
    log(`discord: could not start: ${(e as Error).message}. Trying again in ${Math.round(wait / 60_000)} min.`);
    setTimeout(() => { void startDiscord(stateDir, port, log, attempt + 1, onRefused); }, wait).unref?.();
    return null;
  }
}
