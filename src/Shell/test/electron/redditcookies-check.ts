// The Reddit feed's sign-in hand-over (2026-11-19) with Electron's real cookie stores: Samara's partition to Aang's,
// through the same functions main.ts and samara.ts use. No network: cookies are put in and read back.
// Run: npx electron test/electron/redditcookies-check.ts
import { app, session } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shareRedditCookies, signedIn, takeRedditCookies, type RedditCookie } from '../../src/redditcookies.ts';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'rc-ud-')));

let fails = 0;
const say = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };
const view = (cs: Electron.Cookie[]) => cs.map((c) => `${c.name}=${c.value}@${c.domain}${c.path}${c.hostOnly ? ' host' : ''}${c.secure ? ' secure' : ''}${c.httpOnly ? ' http' : ''}${c.sameSite ? ' ' + c.sameSite : ''}`).sort().join(', ');

app.whenReady().then(async () => {
  const samara = session.fromPartition('persist:rc-samara'), aang = session.fromPartition('persist:rc-aang');
  const later = Math.floor(Date.now() / 1000) + 86400;
  await samara.cookies.set({ url: 'https://reddit.com/', name: 'reddit_session', value: 'jwt1', domain: '.reddit.com', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: later });
  await samara.cookies.set({ url: 'https://www.reddit.com/', name: 'csrf_token', value: 'c1', secure: true, sameSite: 'strict' });
  await samara.cookies.set({ url: 'https://www.google.com/', name: 'SID', value: 'google', secure: true });
  await aang.cookies.set({ url: 'https://reddit.com/', name: 'stale', value: 'x', domain: '.reddit.com', secure: true });

  let sent: RedditCookie[] = [];
  const share = shareRedditCookies(samara.cookies as never, (cs) => { sent = JSON.parse(JSON.stringify(cs)); return true; }, { waitMs: 50 });
  await share.now();
  say(!sent.some((c) => c.name === 'SID'), 'only Reddit leaves Samara');
  say(!(await signedIn(aang.cookies as never)), 'Aang is not signed in before the hand-over');
  const n = await takeRedditCookies(aang.cookies as never, sent);
  const reddit = async (ses: Electron.Session) => (await ses.cookies.get({})).filter((c) => /(^|\.)reddit\.com$/.test((c.domain ?? '').replace(/^\./, '')));
  const want = view(await reddit(samara)), got = view(await reddit(aang));
  say(n === 2 && want === got, `Aang's Reddit cookies are Samara's exactly (${got})`);
  say(await signedIn(aang.cookies as never), 'Aang is signed in after it');
  say((await aang.cookies.get({ name: 'SID' })).length === 0, 'nothing of Google reached Aang');

  // Signed out in Samara: the change goes over by itself and Aang's sign-in is taken out.
  let after: RedditCookie[] | null = null;
  const share2 = shareRedditCookies(samara.cookies as never, (cs) => { after = cs; return true; }, { waitMs: 50 });
  await samara.cookies.remove('https://reddit.com/', 'reddit_session');
  await new Promise((r) => setTimeout(r, 400));
  say(after !== null, 'a sign-out in Samara is sent by itself');
  if (after) await takeRedditCookies(aang.cookies as never, after);
  say(!(await signedIn(aang.cookies as never)), 'Aang is signed out with it');
  share.stop(); share2.stop();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); app.exit(fails ? 1 : 0);
});
