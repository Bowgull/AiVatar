// The Reddit feed moved to Aang's process (2026-11-19): Samara hands over his reddit.com cookies, and only those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReddit, redditOnly, setDetails, shareRedditCookies, signedIn, takeRedditCookies, type CookieStore } from '../src/redditcookies.ts';

type C = Record<string, unknown>;
/** A cookie store the way Electron's behaves, enough for these. */
function store(start: C[] = []) {
  let jar = start.map((c) => ({ ...c }));
  let changed: ((e: unknown, c: C, cause: string, removed: boolean) => void) | null = null;
  const s: CookieStore & { jar: () => C[]; fire: (c: C) => void } = {
    get: async (f) => jar.filter((c) => !f.domain || isReddit(c.domain)),
    set: async (d) => { const domain = (d.domain as string) ?? new URL(String(d.url)).hostname; jar = jar.filter((c) => !(c.name === d.name && c.domain === domain && c.path === d.path)); jar.push({ ...d, domain, hostOnly: !d.domain }); },
    remove: async (url, name) => { const u = new URL(url); jar = jar.filter((c) => !(c.name === name && String(c.domain).replace(/^\./, '') === u.hostname && c.path === u.pathname)); },
    on: (_ev, fn) => { changed = fn as never; },
    jar: () => jar,
    fire: (c) => changed?.(null, c, 'explicit', false),
  };
  return s;
}

test('only reddit.com and its own subdomains, never a look-alike', () => {
  for (const d of ['reddit.com', '.reddit.com', 'www.reddit.com', 'old.reddit.com']) assert.ok(isReddit(d), d);
  for (const d of ['notreddit.com', 'reddit.com.evil.net', 'redd.it', 'google.com', '', undefined]) assert.ok(!isReddit(d), String(d));
  const got = redditOnly([
    { name: 'reddit_session', value: 'abc', domain: '.reddit.com', path: '/', secure: true, httpOnly: true },
    { name: 'SID', value: 'google', domain: '.google.com', path: '/' },
    { name: 'x', value: 'y', domain: 'notreddit.com', path: '/' },
  ]);
  assert.deepEqual(got.map((c) => c.name), ['reddit_session']);
});

test('a host-only cookie stays host-only; a domain cookie keeps its domain', () => {
  const [h, d] = redditOnly([
    { name: 'a', value: '1', domain: 'www.reddit.com', path: '/', hostOnly: true, secure: true, sameSite: 'lax', expirationDate: 2e9 },
    { name: 'b', value: '2', domain: '.reddit.com', path: '/r', hostOnly: false },
  ]);
  assert.deepEqual(setDetails(h!), { url: 'https://www.reddit.com/', name: 'a', value: '1', path: '/', secure: true, httpOnly: false, expirationDate: 2e9, sameSite: 'lax' });
  assert.deepEqual(setDetails(d!), { url: 'https://reddit.com/r', name: 'b', value: '2', path: '/r', secure: false, httpOnly: false, domain: '.reddit.com' });
});

test("Aang's store ends up with exactly Samara's Reddit cookies, and nothing else of his is touched", async () => {
  const aang = store([
    { name: 'reddit_session', value: 'old', domain: '.reddit.com', path: '/' },
    { name: 'gone', value: 'z', domain: '.reddit.com', path: '/' },
    { name: 'other', value: 'keep', domain: '.example.com', path: '/' },
  ]);
  const n = await takeRedditCookies(aang, [
    { name: 'reddit_session', value: 'new', domain: '.reddit.com', path: '/', secure: true, httpOnly: true },
    { name: 'token_v2', value: 't', domain: '.reddit.com', path: '/' },
    { name: 'evil', value: 'x', domain: '.google.com', path: '/' },
  ]);
  assert.equal(n, 2);
  const jar = aang.jar();
  assert.deepEqual(jar.filter((c) => isReddit(c.domain)).map((c) => `${c.name}=${c.value}`).sort(), ['reddit_session=new', 'token_v2=t']);
  assert.ok(jar.some((c) => c.name === 'other'), 'not Reddit: left alone');
  assert.ok(!jar.some((c) => c.name === 'evil'), 'never put in from the message');
  assert.ok(await signedIn(aang));
  // Signed out in Samara: Aang's go too, and the feed then waits.
  await takeRedditCookies(aang, []);
  assert.ok(!(await signedIn(aang)));
  assert.equal(await takeRedditCookies(aang, 'not a list'), 0);
});

test('Samara sends at once and a moment after a Reddit cookie changes, never for other sites', async () => {
  const samara = store([{ name: 'reddit_session', value: 's', domain: '.reddit.com', path: '/' }, { name: 'SID', value: 'g', domain: '.google.com', path: '/' }]);
  const sent: string[][] = [];
  const share = shareRedditCookies(samara, (cs) => { sent.push(cs.map((c) => c.name)); return true; }, { waitMs: 20 });
  assert.equal(await share.now(), true);
  assert.deepEqual(sent, [['reddit_session']]);
  samara.fire({ name: 'SID', domain: '.google.com' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent.length, 1, 'a Google cookie changing sends nothing');
  samara.fire({ name: 'token_v2', domain: '.reddit.com' }); samara.fire({ name: 'token_v2', domain: '.reddit.com' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent.length, 2, 'two quick Reddit changes are one send');
  share.stop();
});
