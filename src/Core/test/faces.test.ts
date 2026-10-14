// The picture above a message (2026-10-14): only real pictures, small, from YouTube's own picture host or DuckDuckGo's
// icon copy, never from an email sender's own site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Faces, channelPictureIn, domainOfEmail, hostOf, pictureAt } from '../src/faces.ts';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200)]);
const res = (body: Buffer | string, type: string, status = 200) => new Response(body, { status, headers: { 'content-type': type } });

test('the channel picture is found in the page and asked for small', () => {
  const html = '<meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj">';
  assert.equal(channelPictureIn(html), 'https://yt3.googleusercontent.com/abc=s88-c-k-c0x00ffffff-no-rj');
  assert.equal(channelPictureIn('<meta property="og:image" content="https://evil.example/x.png">'), null);
  assert.equal(channelPictureIn('<html></html>'), null);
});

test('hosts and sender domains', () => {
  assert.equal(hostOf('https://store.steampowered.com/news/app/1172470'), 'store.steampowered.com');
  assert.equal(hostOf('javascript:alert(1)'), null);
  assert.equal(domainOfEmail('Rhea Thomas <rhea@boomerangfx.com>'), 'boomerangfx.com');
  assert.equal(domainOfEmail('nobody'), null);
});

test('only a real, small picture comes back', async () => {
  assert.match(String(await pictureAt('x', async () => res(png, 'image/png'))), /^data:image\/png;base64,/);
  assert.equal(await pictureAt('x', async () => res('<html>', 'text/html')), null);
  assert.equal(await pictureAt('x', async () => res(Buffer.alloc(200_000), 'image/png')), null);
  assert.equal(await pictureAt('x', async () => res(png, 'image/png', 404)), null);
  assert.equal(await pictureAt('x', async () => { throw new Error('offline'); }), null);
});

test('a sender icon comes from DuckDuckGo, never the sender, and is fetched once', async () => {
  const asked: string[] = [];
  const f = new Faces(async (u) => { asked.push(String(u)); return res(png, 'image/x-icon'); });
  assert.ok(await f.site('phish.example'));
  assert.ok(await f.site('phish.example'));
  assert.deepEqual(asked, ['https://icons.duckduckgo.com/ip3/phish.example.ico']);
});
