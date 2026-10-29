// His version rule (2026-10-14), baked into Samara's update engine (2026-10-29). Versions go MAJOR.MINOR.PATCH and come
// from the plain-words lines a release adds to src/Shell/whats-new.json: a "major" line (a big change) starts a new major
// and the next character's name, a "feature" bumps the middle number, anything else the last. The names are his anime
// picks, one character from each of his shows in turn (src/Core/src/releasenames.ts: Gojo, Edward, Naruto, Goku...).
// src/Shell/releases.json is the record of every version. The ship step and GitHub's check both use this one file.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { releaseName } from '../../src/Core/src/releasenames.ts';

export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
/** @typedef {{ at: string; text: string; kind: string }} Line */
/** @typedef {{ semver: string; name: string; at: string }} Version */
/** @param {string} rel @returns {any} */
export const read = (rel) => JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'));

/** The lines added since a version came out (or since the start), oldest first. @param {Line[]} items @param {string | undefined} at @returns {Line[]} */
export function linesSince(items, at) { const t = at ? Date.parse(at) : -Infinity; return items.filter((i) => Date.parse(i.at) > t); }

/** The next version after `last` for these new lines, by his rule. @param {{ semver: string; name?: string } | undefined} last @param {{ kind: string }[]} lines @returns {{ semver: string; name: string }} */
export function next(last, lines) {
  const kinds = lines.map((l) => l.kind);
  if (!last) return { semver: '1.0.0', name: releaseName(1) };
  const [ma, mi, pa] = last.semver.split('.').map(Number);
  const semver = kinds.includes('major') ? `${ma + 1}.0.0` : kinds.includes('feature') ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
  return { semver, name: releaseName(Number(semver.split('.')[0])) };
}

/**
 * Is the newest version in the record the one his rule gives? It must follow the one before it, by the kinds of the
 * lines between them, with the right name. Returns a plain reason when it is not, else null.
 * @param {Version[]} versions @param {Line[]} items @returns {string | null}
 */
export function checkNewest(versions, items) {
  const v = versions.at(-1), before = versions.at(-2);
  if (!v) return 'there is no version in releases.json';
  const lines = items.filter((i) => Date.parse(i.at) > (before ? Date.parse(before.at) : -Infinity) && Date.parse(i.at) <= Date.parse(v.at));
  if (!lines.length) return `version ${v.semver} adds no lines to whats-new.json: write what it brings first`;
  const want = next(before, lines);
  if (want.semver !== v.semver || want.name !== v.name) return `version ${v.semver} "${v.name}" breaks the rule: its lines make it ${want.semver} "${want.name}"`;
  return null;
}
