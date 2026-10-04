// Step 6.9: the Mac listener's new /open door.
//
// This door takes an address off the network and opens it on his Mac, so the check on it is a security
// boundary, not a convenience. These tests run the REAL text shipped in macsetup.ts through the real
// Perl, rather than a copy of the rules, because a copy is exactly the thing that drifts.
//
// Skips rather than passes quietly where there is no Perl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'macsetup.ts'), 'utf8');

/** The listener's own Perl, lifted out of the setup script exactly as his Mac will run it. */
function listener(): string {
  const i = source.indexOf('#!/usr/bin/perl');
  assert.ok(i > 0, 'the listener script should be in macsetup.ts');
  return source.slice(i, source.indexOf('`;', i));
}

const havePerl = (() => {
  try { execFileSync('perl', ['-e', 'print 1'], { encoding: 'utf8' }); return true; } catch { return false; }
})();

/**
 * Ask the real rules about one address.
 *
 * The allow-list and the pattern are cut from the shipped script and run as written; only the socket
 * and the call to `open` are left out, so what is being tested is the decision itself.
 */
function wouldOpen(url: string): boolean {
  const script = listener();
  const allowed = /my @allowed = qw\(([\s\S]*?)\);/.exec(script);
  assert.ok(allowed, 'the allow-list should be in the listener');
  const match = /if \(length\(\$u\) <= 2000 && \$u =~ (m\{.*?\})\) \{/.exec(script);
  assert.ok(match, 'the address pattern should be in the listener');

  const probe = `
my @allowed = qw(${allowed[1]});
my $u = $ARGV[0]; $u =~ s/^\\s+|\\s+$//g;
if (length($u) <= 2000 && $u =~ ${match[1]}) {
  my $host = lc $1;
  print((grep { $_ eq $host } @allowed) ? "yes" : "no");
} else { print "no" }
`;
  return execFileSync('perl', ['-e', probe, '--', url], { encoding: 'utf8' }).trim() === 'yes';
}

test('the listener is still valid Perl after the change', t => {
  if (!havePerl) { t.skip('no perl on this machine'); return; }
  // A syntax error here is not a failed test on his Mac, it is a listener that never starts, which
  // looks exactly like the MacBook being asleep.
  const script = listener();
  execFileSync('perl', ['-c', '-'], { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
});

test('his video services open', t => {
  if (!havePerl) { t.skip('no perl on this machine'); return; }
  for (const url of [
    'https://www.primevideo.com/detail/0ABC',
    'https://www.crunchyroll.com/watch/ABC/episode',
    'https://www.netflix.com/watch/81111',
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.twitch.tv/asmongold',
  ]) assert.equal(wouldOpen(url), true, `should open: ${url}`);
});

test('nothing else opens, even with the right key', t => {
  if (!havePerl) { t.skip('no perl on this machine'); return; }
  // The key proves it came from Aang. It does not prove the address is one Joshua approved, and a key
  // that ever leaked must not be enough to point his Mac at an arbitrary page.
  for (const url of [
    'https://example.com/',
    'https://evil.example.com/primevideo.com',
    'https://www.youtube.com.evil.test/x',        // the real host is the one on the right
    'http://www.youtube.com/watch?v=x',           // plain http is not https
    'file:///Users/josh/Documents',
    'javascript:alert(1)',
    'https://WWW.YOUTUBE.COM.evil.test/',
  ]) assert.equal(wouldOpen(url), false, `must NOT open: ${url}`);
});

test('an address that could be read as an option is refused', t => {
  if (!havePerl) { t.skip('no perl on this machine'); return; }
  // `open -a Calculator` would be a different thing happening entirely. The address has to start with
  // https, which is why a leading dash cannot survive.
  for (const url of ['-a Calculator', '--args https://www.youtube.com/', ' -n https://www.netflix.com/'])
    assert.equal(wouldOpen(url), false, `must NOT open: ${url}`);
});

test('a host is matched whole, and case does not let one through', t => {
  if (!havePerl) { t.skip('no perl on this machine'); return; }
  assert.equal(wouldOpen('https://WWW.YouTube.COM/watch?v=x'), true, 'his own host in any case');
  assert.equal(wouldOpen('https://notyoutube.com/x'), false);
  assert.equal(wouldOpen('https://www.youtube.com@evil.test/'), false, 'userinfo cannot smuggle a host');
});

test('the door is rate-limited and capped, like the other two', () => {
  const script = listener();
  assert.match(script, /time - \$lastOpen >= \d+/, 'one open at a time, not a flood');
  assert.match(script, /length\(\$u\) <= 2000/, 'and a bounded address');
  // Still only three doors. This one is deliberately narrow: not a Mac port, per the plan.
  const doors = /\^POST \(([^)]*)\)/.exec(script);
  assert.equal(doors?.[1], '/front|/run|/open', 'exactly three things the Mac will do');
});

test('the address is handed over as a list, never to a shell', () => {
  // system() with one string goes through a shell; system() with a list does not. That difference is
  // the whole defence against anything clever inside the address.
  assert.match(listener(), /system\('\/usr\/bin\/open', \$u\)/);
});
