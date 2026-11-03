// Prime from home (his yes, 2026-11-03): the Shadow PC reaches the internet from a Shadow data centre, and Prime Video
// answers "This title may not be available to watch from your location" there. The MacBook is at home. So the Mac's
// Samara keeps a small gate on its Tailscale address, and the PC's Samara sends Prime's addresses (and only those)
// through it: Amazon then sees his home connection. Everything else stays on the PC's own line.
//
// The gate opens only to the PC's exact Tailscale address, only for the addresses below, only to port 443 (a CONNECT
// tunnel: the gate passes the encrypted bytes on and can read none of them). Mac off or asleep: the PC goes straight
// out again, as before, and Prime says what it said before.
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { readJson } from './store.ts';

export const HOME_ROUTE_PORT = 47871;

/** Prime Video, its player, its pictures and Amazon's sign-in: the whole site has to come from the same place. */
export const HOME_HOSTS = [
  'primevideo.com', 'amazonvideo.com', 'aiv-cdn.net', 'aiv-delivery.net', 'pv-cdn.net',
  'amazon.com', 'amazon.ca', 'media-amazon.com', 'ssl-images-amazon.com', 'images-amazon.com',
];

export function homeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return HOME_HOSTS.some((d) => h === d || h.endsWith('.' + d));
}

const tailnet = (a: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(a);

/** The proxy script for the PC's browser session: Prime's addresses via the Mac, then straight out if the Mac is away. */
export function homePac(macAddr: string, port = HOME_ROUTE_PORT): string {
  return `function FindProxyForURL(url, host) {
  var d = ${JSON.stringify(HOME_HOSTS)};
  host = host.toLowerCase();
  for (var i = 0; i < d.length; i++) if (host === d[i] || dnsDomainIs(host, '.' + d[i])) return 'PROXY ${macAddr}:${port}; DIRECT';
  return 'DIRECT';
}`;
}

/** PC: send Prime through the Mac (the address the brain last heard the Mac from, mac.json). False when there is none. */
export async function routeHome(ses: Electron.Session, stateDir: string, log: (s: string) => void): Promise<boolean> {
  const mac = String(readJson<any>(path.join(stateDir, 'mac.json'), {})?.addr ?? '');
  if (!tailnet(mac)) { log('prime from home: no MacBook heard from yet; Prime goes straight out'); return false; }
  await ses.setProxy({ mode: 'pac_script', pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(homePac(mac)).toString('base64') });
  log(`prime from home: Prime goes through the MacBook (${mac})`);
  return true;
}

/** Mac: this Mac's own Tailscale address, or null. */
export function myTailnetAddr(): string | null {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && tailnet(a.address)) return a.address;
  return null;
}

/** Mac: the gate. Only `pc`, only CONNECT to a Prime address on 443. */
export function homeGate(o: { pc: string; bind: string; port?: number; log: (s: string) => void }): http.Server {
  const srv = http.createServer((_req, res) => { res.writeHead(405).end(); });
  srv.on('connect', (req: http.IncomingMessage, sock: net.Socket, head: Buffer) => {
    const peer = String(sock.remoteAddress ?? '').replace(/^::ffff:/, '');
    const m = /^([a-z0-9.-]+):(\d+)$/i.exec(String(req.url ?? ''));
    if (peer !== o.pc || !m || m[2] !== '443' || !homeHost(m[1])) {
      o.log(`prime from home: refused ${m?.[1] ?? '?'} for ${peer}`);
      sock.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const up = net.connect(443, m[1], () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.setTimeout(120_000, () => up.destroy());
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
    sock.on('close', () => up.destroy());
  });
  srv.on('error', (e) => o.log('prime from home: the gate would not open: ' + (e as Error).message));
  srv.listen(o.port ?? HOME_ROUTE_PORT, o.bind, () => o.log(`prime from home: the gate is open on ${o.bind} for the PC (${o.pc})`));
  return srv;
}
