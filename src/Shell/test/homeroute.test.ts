// The home route (Prime from home, 2026-11-03; Disney+ too, 2026-11-17): only the listed streaming sites go through the
// MacBook, and the Mac's gate lets only the PC, only port 443, only those sites through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { HOME_HOSTS, homeGate, homeHost, homePac } from '../src/homeroute.ts';

test('Prime and Disney+ addresses go home, their subdomains too', () => {
  for (const h of ['www.primevideo.com', 'atv-ps.amazon.com', 'www.disneyplus.com', 'disney.api.edge.bamgrid.com',
    'vod-bgc-na-east-1.media.dssott.com', 'prod-static.disney-plus.net', 'cdn.registerdisney.go.com', 'DisneyPlus.com.']) {
    assert.equal(homeHost(h), true, h);
  }
});

test('nothing else goes home: look-alikes and the rest of go.com stay on the PC', () => {
  for (const h of ['example.com', 'notdisneyplus.com', 'disneyplus.com.evil.net', 'espn.go.com', 'go.com', 'bamgrid.com.example', 'amazon.co.uk']) {
    assert.equal(homeHost(h), false, h);
  }
});

test('the proxy script names every home address and goes straight out otherwise', () => {
  const pac = homePac('100.64.0.10');
  for (const h of HOME_HOSTS) assert.ok(pac.includes(JSON.stringify(h)), h);
  assert.match(pac, /PROXY 100.64.0.10:47871; DIRECT/);
  assert.match(pac, /return 'DIRECT';\s*}$/);
});

function ask(port: number, target: string): Promise<string> {
  return new Promise((ok, bad) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let got = '';
    s.on('data', (d) => { got += d; if (got.includes('\r\n\r\n')) { s.destroy(); ok(got.split('\r\n')[0]!); } });
    s.on('error', bad);
    s.on('close', () => ok(got.split('\r\n')[0] ?? ''));
  });
}
async function gate(pc: string): Promise<{ port: number; close: () => void }> {
  const port = await new Promise<number>((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); }); });
  const srv = homeGate({ pc, bind: '127.0.0.1', port, log: () => {} });
  await new Promise((r) => srv.once('listening', r));
  return { port, close: () => srv.close() };
}

test('the gate refuses anyone but the PC', async () => {
  const g = await gate('100.64.0.9');
  try { assert.match(await ask(g.port, 'www.disneyplus.com:443'), / 403 /); } finally { g.close(); }
});

test('the gate refuses another site, and another port on a home site', async () => {
  const g = await gate('127.0.0.1');
  try {
    assert.match(await ask(g.port, 'example.com:443'), / 403 /);
    assert.match(await ask(g.port, 'www.disneyplus.com:80'), / 403 /);
  } finally { g.close(); }
});
