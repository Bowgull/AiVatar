// Aang: connect to Spotify, on the Mac (2026-10-28). The same sign-in as tools/spotify-setup.ps1 on the PC: PKCE, no
// client secret, his own Spotify developer app, the same callback (http://127.0.0.1:47835/callback). He approves in his
// browser himself; nothing here sees his password. Saved to ~/Library/Application Support/Aang/spotify.json, readable by
// his Mac account only. With one brain on the Mac (his pick), this one sign-in steers his music and speakers from both
// machines' mini players.
//
// Run:  "$HOME/Library/Application Support/AangListener/node/bin/node" tools/spotify-setup-mac.mjs [client id]
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.homedir(), 'Library', 'Application Support', 'Aang');
const store = path.join(dir, 'spotify.json');
mkdirSync(dir, { recursive: true });
let saved = ''; try { saved = JSON.parse(readFileSync(store, 'utf8')).clientId ?? ''; } catch { /* first time */ }
const clientId = String(process.argv[2] ?? saved).trim();
if (!/^[0-9a-f]{32}$/.test(clientId)) { console.log('  Give the Client ID from your Spotify developer app (32 letters and digits).'); process.exit(1); }

const b64url = (b) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const verifier = b64url(randomBytes(48)), challenge = b64url(createHash('sha256').update(verifier).digest()), state = b64url(randomBytes(16));
const redirect = 'http://127.0.0.1:47835/callback';
const scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing user-library-read user-library-modify playlist-read-private playlist-read-collaborative';
const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: challenge, state, scope });

const srv = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', redirect);
  if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
  if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) { res.writeHead(400).end('Spotify did not say yes. You can close this tab.'); console.log('  Not connected: ' + (u.searchParams.get('error') ?? 'no code')); srv.close(); return; }
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: redirect, client_id: clientId, code_verifier: verifier }) });
    const t = await r.json();
    if (!r.ok || !t.refresh_token) throw new Error(t.error_description ?? t.error ?? String(r.status));
    writeFileSync(store, JSON.stringify({ clientId, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) - 60) * 1000 }));
    chmodSync(store, 0o600);
    res.writeHead(200, { 'content-type': 'text/plain' }).end('Aang is connected to Spotify. You can close this tab.');
    console.log('  Saved, readable by your Mac account only. Aang picks it up the next time his brain starts.');
  } catch (e) { res.writeHead(500).end('That did not work: ' + e.message); console.log('  Not connected: ' + e.message); }
  srv.close();
});
srv.listen(47835, '127.0.0.1', () => {
  console.log('\n  Aang: connect to Spotify\n  ------------------------\n  Your browser opens Spotify. Sign in there and press Agree.');
  execFile('/usr/bin/open', [url]);
});
