// Look for credentials in a folder of notes, before any of it goes to GitHub.
//
// WHY: the vault is 1,183 markdown files and ~92% of them are AI session handoffs. Session transcripts are
// exactly where a key gets pasted "just to test something" and then forgotten. Two .env files were already
// found sitting in this user's Drive. A private repo is not protection: it leaks through forks, through
// collaborators, and through any token that can read it.
//
// Read-only. Prints what it finds and where. Nothing is moved, changed or sent.
//
//   node secretscan.mjs "<folder>" [--full]
//
// Without --full, matched secrets are shown masked. Lines are reported by file and line number so each one
// can be checked by hand.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const showFull = process.argv.includes('--full');
if (!root) { console.error('usage: node secretscan.mjs "<folder>" [--full]'); process.exit(2); }

/**
 * Patterns for things that are secret by shape, not by name.
 *
 * Deliberately biased toward recall over precision: a false positive costs one glance, a missed key costs a
 * credential. Each one is anchored on a vendor prefix or an unmistakable structure, so a sentence about
 * "my api key" does not match but `sk-ant-...` does.
 */
const RULES = [
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/g },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Stripe key', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { name: 'Discord bot token', re: /\b[MNO][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'connection string with password', re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]{3,}@/gi },
  // Assignment shapes: KEY = "something long". Needs a secret-ish name AND a long value, so "name = joshua"
  // and a prose sentence both stay out.
  { name: 'assigned secret', re: /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{16,})["']?/gi },
];

/** Obvious non-secrets that the assignment rule would otherwise flag forever. */
const BORING = /\b(?:xxx+|yyy+|zzz+|your[_-]?(?:api[_-]?)?key|example|placeholder|redacted|changeme|<[^>]+>|\.\.\.|TODO|null|undefined|true|false)\b/i;

const mask = s => s.length <= 10 ? s[0] + '*'.repeat(Math.max(0, s.length - 1))
  : s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4);

const files = [];
const walk = dir => {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === '.git' || name === 'node_modules' || name === '.obsidian') continue;
    const full = path.join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full);
    // Everything textual, not just .md: .env, .json, .txt and config files are the usual offenders.
    else if (st.size > 0 && st.size < 8 << 20 && !/\.(png|jpg|jpeg|gif|webp|pdf|zip|mp4|mp3|wav|ico|woff2?|ttf|exe|dll)$/i.test(name)) files.push(full);
  }
};
walk(root);

const hits = [];
let scanned = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  scanned++;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 4000) continue;              // minified or base64 blob, not a pasted key
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const found = m[1] ?? m[0];
        if (BORING.test(found)) continue;
        hits.push({ file, line: i + 1, rule: rule.name, found, context: line.trim().slice(0, 160) });
        if (hits.length > 400) break;
      }
    }
  }
}

console.log(`scanned ${scanned} text files under ${root}`);
console.log(`files skipped as binary/large: ${files.length - scanned}`);
console.log(`possible secrets: ${hits.length}\n`);

const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}
for (const [file, list] of byFile) {
  console.log(path.relative(root, file));
  for (const h of list) {
    console.log(`   line ${h.line}  [${h.rule}]  ${showFull ? h.found : mask(h.found)}`);
  }
}
if (hits.length === 0) console.log('nothing matched. that is a good sign, not a guarantee.');
