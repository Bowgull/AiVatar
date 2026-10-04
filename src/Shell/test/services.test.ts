// Which services are allowed into the DRM runtime (step 6.4). This list is a security boundary:
// castLabs trails the stock build's security fixes, so nothing but paid video ever loads there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedInDrm, notReadyBecause, serviceFor } from '../src/services.ts';

test('his services are recognised, including the Crunchyroll section of Prime', () => {
  assert.equal(serviceFor('https://www.primevideo.com/detail/0ABC')?.id, 'prime');
  assert.equal(serviceFor('https://www.amazon.com/gp/video/detail/B0ABC')?.id, 'prime');
  assert.equal(serviceFor('https://www.crunchyroll.com/watch/ABC/episode-1')?.id, 'crunchyroll');
  assert.equal(serviceFor('https://www.netflix.com/watch/80100172')?.id, 'netflix');
});

test('a subdomain counts, a lookalike does not', () => {
  assert.equal(serviceFor('https://beta.crunchyroll.com/watch/x')?.id, 'crunchyroll');
  // The whole point of matching on the host rather than the address.
  assert.equal(serviceFor('https://crunchyroll.com.evil.ru/watch'), null);
  assert.equal(serviceFor('https://notcrunchyroll.com/watch'), null);
  assert.equal(serviceFor('https://evil.ru/?x=crunchyroll.com'), null);
});

test('nothing else gets into the DRM runtime, however video-like', () => {
  for (const link of [
    'https://www.youtube.com/watch?v=abc',
    'https://www.twitch.tv/asmongold',
    'https://wowhead.com/guide',
    'http://www.crunchyroll.com/watch/x',          // not https: not itself
    'file:///C:/Windows/notepad.exe',
    'javascript:alert(1)',
    'not a link',
  ]) {
    assert.equal(allowedInDrm(link), false, link);
  }
});

test('Netflix is recognised but not ready, and the reason names the error', () => {
  const n = serviceFor('https://www.netflix.com/watch/1')!;
  assert.equal(n.ready, false);
  assert.match(notReadyBecause('netflix'), /M7121-1331/);
  // Still allowed into the runtime: he will see Netflix's own refusal rather than nothing at all.
  assert.equal(allowedInDrm('https://www.netflix.com/watch/1'), true);
});

test('the ones he uses today are ready', () => {
  assert.equal(serviceFor('https://www.primevideo.com/x')!.ready, true);
  assert.equal(serviceFor('https://www.crunchyroll.com/x')!.ready, true);
});
