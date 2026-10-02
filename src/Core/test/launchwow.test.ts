import './_env.ts';
// Launching the game, not the launcher.
//
// WHY THIS EXISTS: the Rainmeter tile and Aang both ran "World of Warcraft Launcher.exe", which only gets
// Joshua as far as a Play button. Five launch forms were tried live on 2026-10-02 before one worked:
//
//   battlenet://wow_classic_beta                      opened Battle.net, launched nothing
//   Battle.net.exe --exec=launch wow_classic_beta     nothing
//   Battle.net Launcher.exe --exec=launch ...         nothing
//   World of Warcraft Launcher.exe --exec=launch ...  nothing
//   WowB.exe directly                                 LAUNCHED, but with no saved credentials
//   Battle.net.exe --exec=launch WoWF                 LAUNCHED, signed in
//
// The trap is that the install folder, the .flavor.info file and Blizzard's own patch endpoint all call
// this product `wow_classic_beta`, and Battle.net's launch command does not accept that name. It wants the
// short product code. Nothing on the machine states that code anywhere, which is why it is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/open.ts';

const ok = (r: ReturnType<typeof resolve>): Extract<typeof r, { target: string }> => {
  assert.ok(!('error' in r), `expected a resolved app, got: ${'error' in r ? r.error : ''}`);
  return r as Extract<typeof r, { target: string }>;
};

test('asking for WoW resolves to Battle.net with the product code', () => {
  for (const said of ['wow', 'WoW', 'wow forever', 'WoW Forever', 'world of warcraft', 'warcraft']) {
    const r = resolve(said);
    if ('error' in r) {
      // Battle.net not installed on this machine: the recipe still has to fail honestly rather than fall
      // through to opening a web search for the word "wow".
      assert.match(r.error, /Battle\.net/, `${said}: ${r.error}`);
      continue;
    }
    const got = ok(r);
    assert.equal(got.kind, 'app', `${said} should resolve to an app`);
    assert.match(got.target, /Battle\.net\.exe$/i, `${said} should go through Battle.net, not the game exe`);
    assert.deepEqual(got.args, ['--exec=launch WoWF'], `${said} must carry the short product code`);
    // The thing that broke it the first time: the install flavour is not the launch code.
    assert.ok(!JSON.stringify(got.args).includes('wow_classic_beta'),
      'wow_classic_beta is the install flavour, not the launch code, and Battle.net ignores it');
  }
});

test('it never resolves to the launcher or straight to the game exe', () => {
  const r = resolve('wow');
  if ('error' in r) return;
  const got = ok(r);
  // The launcher only gets him to a Play button, which is the whole complaint.
  assert.ok(!/World of Warcraft Launcher\.exe$/i.test(got.target), 'that is the launcher, not the game');
  // WowB.exe starts the game but with no session, so he lands on a login screen.
  assert.ok(!/WowB\.exe$/i.test(got.target), 'launching the exe directly loses his saved credentials');
});

test('ordinary words are not mistaken for the game', () => {
  // "wower", "wow.com" and a sentence must not all start WoW.
  for (const said of ['wowhead', 'wow.com', 'https://wow.com', 'notepad', 'chrome']) {
    const r = resolve(said);
    if ('error' in r) continue;
    const got = ok(r);
    assert.ok(!(got.args ?? []).includes('--exec=launch WoWF'), `${said} should not launch the game`);
  }
});
