// Sheet 16: his rule for Aang's choices (2026-10-12), "ask once, remember, then confirm".
//
// The first time Aang needs him to pick (which machine a show goes on, say) it asks with the glove list.
// The pick is kept under a short name. Next time Aang just does it and says so in one line, with a gold
// "change" link that forgets it. His own words always win: "on the Mac" in the message is never overruled.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

export interface SavedChoice { key: string; question: string; pick: string; at: string }

/** The name a choice is saved under: lower case, plain words, short. Two spellings of one decision are one key. */
export function choiceKey(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export class Choices {
  private readonly file: string;
  private all: Record<string, SavedChoice> = {};
  constructor(file: string) {
    this.file = file;
    try { if (existsSync(file)) this.all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, SavedChoice>; }
    catch { this.all = {}; }
  }
  get(name: string): SavedChoice | null { const k = choiceKey(name); return k ? this.all[k] ?? null : null; }
  set(name: string, question: string, pick: string): void {
    const key = choiceKey(name);
    if (!key) return;
    this.all[key] = { key, question: question.slice(0, 200), pick: pick.slice(0, 120), at: new Date().toISOString() };
    this.save();
  }
  forget(name: string): boolean {
    const k = choiceKey(name);
    if (!k || !this.all[k]) return false;
    delete this.all[k];
    this.save();
    return true;
  }
  list(): SavedChoice[] { return Object.values(this.all).sort((a, b) => b.at.localeCompare(a.at)); }
  private save(): void { writeFileAtomic(this.file, JSON.stringify(this.all, null, 2)); }
}
