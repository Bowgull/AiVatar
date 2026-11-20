// Samara's "Send to Aang" and "Send mockup to Aang" over the brain's relay (his "Fix it now", 2026-11-20). Since Samara
// runs as its own program (2026-11-17) nothing carried these to Aang's windows; now Samara hands them over the same way
// it hands a page or a question (relay), Aang's windows land them on the typing box, and answer. No answer means Aang's
// windows are not there, and Samara says so instead of doing nothing.
//
// A relay carries at most 64 000 characters (core.ts), so pictures never ride in it: Samara writes each one as a PNG in
// the state folder (sent-pictures/, mockup-sends/) and the message names the file. Aang's windows take only a plain file
// name in that folder (sendtoaang.ts cleanRelayFile), so a message can never point them anywhere else.
//
// The same request-and-answer carries "Take it back" on a Claude plan from Aang's bubble to Samara's plan memory.
// Plain logic, no Electron, so it is tested.
import { randomBytes } from 'node:crypto';
import type { MockSend, MockSendItem } from './mockups.ts';

/** The relay's own limit is 64 000 characters; this leaves room for the envelope. */
export const RELAY_MAX = 60_000;
/** A picture's file name as Samara writes it: digits, a dash, hex, .png. */
export const pictureName = (): string => `${Date.now()}-${randomBytes(4).toString('hex')}.png`;

/** A mockup item as it rides in the relay: its picture is a file name, never the picture. */
export type RelayMockItem = Omit<MockSendItem, 'picture'> & { picture: null; pictureFile: string | null };
export type RelayMock = RelayMockItem | { kind: 'mockups'; branch: string; items: RelayMockItem[] };

/**
 * The relay message for a mockup send. `files` gives each item's picture file name (or null), in item order. Notes are
 * cut shorter, then dropped, until it fits; null when even that does not fit (too many at once).
 */
export function mockRelay(id: string, m: MockSend, files: (string | null)[]): Record<string, unknown> | null {
  const items: MockSendItem[] = m.kind === 'mockup' ? [m] : m.items;
  for (const cut of [1500, 400, 0]) {
    const out = items.map((x, i): RelayMockItem => ({ ...x, notes: x.notes.slice(0, cut), picture: null, pictureFile: files[i] ?? null }));
    const mock: RelayMock = m.kind === 'mockup' ? out[0]! : { kind: 'mockups', branch: m.branch, items: out };
    const msg = { t: 'samara.mockup', id, m: mock };
    if (JSON.stringify(msg).length <= RELAY_MAX) return msg;
  }
  return null;
}

/** The relay message for a right-click send. Page text is already cut to 6000 by the browser; a long one is cut again. */
export function sendRelay(id: string, sent: Record<string, unknown>, pictureFile: string | null): Record<string, unknown> | null {
  const msg = { t: 'samara.send', id, sent: { ...sent, file: undefined, thumb: undefined }, picture: pictureFile };
  if (JSON.stringify(msg).length <= RELAY_MAX) return msg;
  const text = typeof sent.text === 'string' ? sent.text.slice(0, 2000) : sent.text;
  const short = { ...msg, sent: { ...msg.sent, text } };
  return JSON.stringify(short).length <= RELAY_MAX ? short : null;
}

/**
 * Asks that wait for one answer by id (`samara.sent`, `samara.forgot`), each with its own deadline. `ask` resolves with
 * the answer, or null when nothing came in time; `got` takes an answer and says whether it was one of ours.
 */
export class Answers<T> {
  private seq = 0;
  private wait = new Map<string, (a: T | null) => void>();
  private readonly prefix: string;
  constructor(prefix: string) { this.prefix = prefix; }
  newId(): string { return `${this.prefix}${Date.now().toString(36)}${++this.seq}`; }
  ask(id: string, send: () => boolean, ms: number): Promise<T | null> {
    return new Promise((done) => {
      const t = setTimeout(() => { if (this.wait.delete(id)) done(null); }, ms);
      this.wait.set(id, (a) => { clearTimeout(t); done(a); });
      if (!send()) { this.wait.delete(id); clearTimeout(t); done(null); }
    });
  }
  got(id: unknown, a: T): boolean {
    const f = this.wait.get(String(id ?? ''));
    if (!f) return false;
    this.wait.delete(String(id));
    f(a);
    return true;
  }
}
