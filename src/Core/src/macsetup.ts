// The one-paste setup for his MacBook (2026-09-22): Claude Code hooks that report to Aang over Tailscale, and a
// listener that can do two things - bring the Claude app forward, or open it on one fixed job (the job hunt) - when
// Aang asks with its key. Served once, behind a one-time code (see Core.setupFor), so no script with keys in it ever
// has to be copied between machines. Nothing here needs anything installed on the Mac: bash, curl, osascript
// (JavaScript for Automation and AppleScript) and perl all ship with macOS.
//
// /run (2026-09-22, Joshua: "i prompt aang to run job hunt and my macbook fires the claude in its app") is still
// narrow, not general remote execution: it types one thing - the text Aang sends - into a new Claude chat and
// presses return. It cannot run a shell command or read a reply back; nothing it does can be anything other than
// starting a chat message, the same as Joshua typing it himself. Reporting back still goes through the hooks
// already wired (SessionStart/Stop/etc.), not through this endpoint.

import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAC_LISTENER_PORT = 47840;
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];

/** The listener, in Perl. It answers only POST /front?k=<key> (bring Claude forward) and POST /run?k=<key> (type
 *  the body into a new Claude chat) from a Tailscale address - /front at most once every 2s, /run once every 10s -
 *  and nothing else. */
const LISTENER = String.raw`#!/usr/bin/perl
# Aang's helper on this Mac. It does exactly two things when Aang on the Shadow PC asks over Tailscale with the key:
# bring the Claude app forward, or type one message into a new Claude chat. It cannot run anything else.
# To remove it: ~/Library/Application Support/AangListener/uninstall.sh
use strict; use warnings; use IO::Socket::INET; use File::Basename;
my ($port) = @ARGV;
my $dir = dirname($0);
# M1 (2026-10-13): the key and the one address allowed to call (the Shadow PC's) are read from files only this
# user can read. They used to be on the command line, where any program on this Mac could see the key with ps.
sub slurp { my ($f) = @_; open(my $fh, '<', "$dir/$f") or return ''; local $/; my $v = <$fh> // ''; close $fh; $v =~ s/\s+//g; return $v }
my $key = slurp('key');
my $shadow = slurp('shadow');
unless (length($key) >= 20 && $shadow =~ /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) { sleep 30; exit 1 }
# Compared in constant time: every character is looked at whatever happens, so the time an answer takes never
# says how much of a guessed key was right.
sub same { my ($x, $y) = @_; return 0 unless defined $x && defined $y && length($x) == length($y); my $d = 0; $d |= ord(substr($x, $_, 1)) ^ ord(substr($y, $_, 1)) for 0 .. length($x) - 1; return $d == 0 }
my ($ip) = (qx{/sbin/ifconfig} =~ /inet (100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)/);
unless ($ip) { sleep 30; exit 1 }                      # Tailscale is not up yet; launchd starts this again
my $srv = IO::Socket::INET->new(LocalAddr => $ip, LocalPort => $port, Listen => 5, ReuseAddr => 1) or do { sleep 30; exit 1 };
my ($lastFront, $lastRun, $lastOpen) = (0, 0, 0);
# Step 6.9. This door takes an ADDRESS off the network and opens it on his Mac, so the key alone is not
# enough: only these sites, and only https. Least privilege, his standing rule. Anything else is refused
# even with the right key, so a key that ever leaked still could not point his Mac at an arbitrary page.
my @allowed = qw(
  www.primevideo.com primevideo.com www.amazon.ca www.amazon.com
  www.crunchyroll.com crunchyroll.com
  www.netflix.com netflix.com
  www.youtube.com youtu.be m.youtube.com
  www.twitch.tv twitch.tv
  www.disneyplus.com disneyplus.com
);
while (my $c = $srv->accept) {
  my $peer = $c->peerhost // '';
  my ($path, $qkey, $clen) = ('', '', 0);
  eval {
    local $SIG{ALRM} = sub { die "slow\n" }; alarm 3;
    my $l = <$c> // '';
    if ($l =~ m{^POST (/front|/run|/open)\?k=([^\s&]+) HTTP/}) { ($path, $qkey) = ($1, $2); }
    while (my $h = <$c>) { last if $h =~ /^\r?\n\z/; $clen = $1 if $h =~ /^Content-Length:\s*(\d+)/i; }
    alarm 0;
  };
  # Only the Shadow PC itself, by its exact Tailscale address; any other machine on the tailnet is refused.
  my $ok = $peer eq $shadow && $path ne '' && same($qkey, $key);
  my $body = '';
  if ($ok && ($path eq '/run' || $path eq '/open') && $clen > 0) { my $n = $clen > 4000 ? 4000 : $clen; read $c, $body, $n; }
  if ($ok && $path eq '/front' && time - $lastFront >= 2) { $lastFront = time; system('/usr/bin/open', '-a', 'Claude'); }
  if ($ok && $path eq '/run' && $body ne '' && time - $lastRun >= 10) {
    $lastRun = time;
    my $tmp = "$dir/run-" . time() . '.txt';
    if (open(my $fh, '>:encoding(UTF-8)', $tmp)) { print $fh $body; close $fh; system('/usr/bin/osascript', "$dir/run.applescript", $tmp); unlink $tmp; }
  }
  if ($ok && $path eq '/open' && $body ne '' && time - $lastOpen >= 3) {
    my $u = $body; $u =~ s/^\s+|\s+$//g;
    # Spelled out rather than clever: https only, a host from the list above, and only characters that
    # belong in an address. A value starting with a dash would otherwise be read as an option by open.
    if (length($u) <= 2000 && $u =~ m{^https://([A-Za-z0-9.-]+)(/[^\s<>"']*)?$}) {
      my $host = lc $1;
      if (grep { $_ eq $host } @allowed) {
        $lastOpen = time;
        # A list, not a string, so nothing in the address is ever read by a shell.
        system('/usr/bin/open', $u);
      } else { $ok = 0 }
    } else { $ok = 0 }
  }
  print $c ($ok ? "HTTP/1.1 204 No Content\r\n" : "HTTP/1.1 403 Forbidden\r\n"), "Content-Length: 0\r\nConnection: close\r\n\r\n";
  close $c;
}
exit 1
`;

/** Types one message into a new Claude chat and presses return - nothing else. Reads the text from a file rather
 *  than a command-line argument so nothing about the message (quotes, newlines) needs escaping into AppleScript
 *  source. Needs Accessibility permission for osascript (System Settings > Privacy & Security > Accessibility) -
 *  macOS will prompt for it the first time this runs. */
const RUN_APPLESCRIPT = String.raw`on run argv
  set thePath to item 1 of argv
  set theText to (read POSIX file thePath as «class utf8»)
  tell application "Claude" to activate
  -- M1 (2026-10-13): keystrokes go to whatever app is in FRONT, so it checks that Claude really is, before every
  -- one, instead of a blind 1.5 second pause. If something else is in front at any point, nothing more is typed.
  if not my claudeInFront(6) then return "Claude did not come to the front; nothing typed"
  tell application "System Events" to keystroke "n" using {command down}
  delay 0.8
  if not my claudeInFront(2) then return "Claude left the front; nothing typed"
  tell application "System Events" to keystroke theText
  delay 0.3
  if not my claudeInFront(1) then return "Claude left the front; not sent"
  tell application "System Events" to keystroke return
  return "typed"
end run

on claudeInFront(secs)
  repeat (secs * 10) times
    tell application "System Events"
      if exists process "Claude" then
        if frontmost of process "Claude" then return true
      end if
    end tell
    delay 0.1
  end repeat
  return false
end claudeInFront
`;

/**
 * M2 (2026-10-13): the Mac's heartbeat. Every 10 seconds it asks the Shadow PC whether the big brain is up and
 * writes the answer to shadow.state, one line: "on|off|unknown desk|away <unix time>". The rest of Aang on this Mac
 * (Discord, answering while Shadow sleeps, the notices) reads that file. Three misses in a row (about 30 s) mean
 * off; one answer means on. The key lives in alive.curl, a file only he can read, never on a command line.
 */
const HEARTBEAT = String.raw`#!/bin/bash
# Aang's heartbeat on this Mac: is the Shadow PC's brain up? The answer is in shadow.state.
DIR="$(cd "$(dirname "$0")" && pwd)"
state=unknown; desk=away; miss=0; last=""
while true; do
  body=$(/usr/bin/curl -s -m 4 -K "$DIR/alive.curl" 2>/dev/null)
  if [[ "$body" == *'"up":true'* ]]; then
    miss=0; state=on
    if [[ "$body" == *'"atDesk":true'* ]]; then desk=desk; else desk=away; fi
  else
    miss=$((miss + 1))
    if [ "$miss" -ge 3 ]; then state=off; desk=away; fi
  fi
  line="$state $desk"
  if [ "$line" != "$last" ]; then
    printf '%s %s
' "$line" "$(date +%s)" > "$DIR/shadow.state.tmp" && mv -f "$DIR/shadow.state.tmp" "$DIR/shadow.state"
    echo "$(date '+%Y-%m-%d %H:%M:%S') shadow $line" >> "$DIR/heartbeat.log"
    last="$line"
  fi
  sleep 10
done
`;

/** Merges Aang's five hooks into ~/.claude/settings.json (backing it up first), keeping everything else. */
const HOOKS_JXA = String.raw`function run(argv) {
  ObjC.import('Foundation');
  var host = argv[0], port = argv[1], key = argv[2];
  var path = $.NSHomeDirectory().js + '/.claude/settings.json';
  var fm = $.NSFileManager.defaultManager, settings = {};
  if (fm.fileExistsAtPath(path)) {
    var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js;
    settings = JSON.parse(s);
    $(s).writeToFileAtomicallyEncodingError(path + '.before-aang-' + Date.now(), true, $.NSUTF8StringEncoding, null);
  }
  var hooks = settings.hooks || {};
  var isAang = function (h) { return typeof h.command === 'string' && h.command.indexOf('/hook?e=') >= 0; };
  EVENTS.forEach(function (e) {
    var kept = (hooks[e] || []).map(function (m) { var n = {}; for (var k in m) n[k] = m[k]; n.hooks = (m.hooks || []).filter(function (h) { return !isAang(h); }); return n; })
      .filter(function (m) { return m.hooks.length > 0; });
    kept.push({ hooks: [{ type: 'command', timeout: 5,
      command: 'curl -s -m 2 -X POST -H "Content-Type: application/json" --data-binary @- "http://' + host + ':' + port + '/hook?e=' + e + '&k=' + key + '" || exit 0' }] });
    hooks[e] = kept;
  });
  settings.hooks = hooks;
  $(JSON.stringify(settings, null, 2) + '\n').writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  return 'Claude Code hooks written to ' + path;
}`.replace('EVENTS', JSON.stringify(HOOK_EVENTS));

/** M3: the MacBook front desk, when this setup should install it. Files are the exact source that runs there. */
export interface DeskPayload {
  token: string; key: string; port: number; files: Record<string, string | Buffer>;
  /** M6: Aang's browser for the Mac: its code and pages packed (tar.gz), and the key its sync uses */
  browser?: { bundle: Buffer; bsyncKey: string; castlabsSig: Buffer };
}
/** M6: the browser engine on the Mac, pinned. The fingerprint is from Electron's own SHASUMS256.txt for this release. */
/** M6: Bitwarden's official command-line tool for Intel Macs, pinned (the digest GitHub lists for the release asset). */
export const BITWARDEN_MAC = { version: '2026.9.0', sha256: 'd2a1865c2c1f49c34e6f1b38a42c5b95dcf22e34f81121c4962ebda32f708a3e' };
/** Paid video on the Mac: castLabs' Electron for Content Security, Intel build, pinned (GitHub's digest for the asset). */
export const CASTLABS_MAC = { version: '44.5.1', sha256: 'f3ebb426b24fd47dfb86fcd6ea3170f8d5058c4b1c5cb2ee35993fea32ecf454' };
export const ELECTRON_MAC = { version: '44.7.0', sha256: '4fe494a7159b10a81e2098dab388719582065e99e604c4510bb117e282213566' };
export const FRONT_DESK_PORT = 47841;

/**
 * M6: the Mac browser's code and pages, packed as tar.gz: the Shell's src and pages as they are on this PC, and the
 * Mac app's package.json and lockfile (Shell/mac-pkg). Windows' own tar (bsdtar), so a drive letter is never read
 * as a remote host the way GNU tar would.
 */
export function macBrowserBundle(shellDir: string): Buffer {
  const out = path.join(os.tmpdir(), `aang-mac-browser-${process.pid}-${Date.now()}.tgz`);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  try {
    execFileSync(tar, ['-czf', out, '-C', shellDir, 'src', 'pages', 'drm', '-C', path.join(shellDir, 'mac-pkg'), 'package.json', 'package-lock.json'], { stdio: 'ignore', timeout: 60_000 });
    return readFileSync(out);
  } finally { try { unlinkSync(out); } catch { /* gone */ } }
}

/** The whole bash script the Mac runs. `shadow` is this PC's Tailscale address. */
export function macSetupScript(shadow: string, hookPort: number, hookKey: string, frontKey: string, desk: DeskPayload | null = null): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const b64 = (s: string | Buffer) => (typeof s === 'string' ? Buffer.from(s, 'utf8') : s).toString('base64');
  // Each file goes over as base64 on one line, so nothing in it can ever be read by the shell.
  const deskFiles = desk ? Object.entries(desk.files).map(([name, text]) => {
    if (!/^[a-z][a-z0-9.-]*$/.test(name)) throw new Error(`bad front desk file name: ${name}`);
    return `printf '%s' '${b64(text)}' | /usr/bin/base64 -D > "$FD/${name}"`;
  }).join('\n') : '';
  return `#!/bin/bash
# Aang: MacBook setup. Written by Aang on the Shadow PC; served once. Safe to run again.
set -e
# macOS can still be removing the old copy right after bootout; starting again too soon fails with "Input/output
# error" (seen 2026-10-13). So: try again for a while before giving up.
start_agent() { for i in 1 2 3 4 5 6 7 8; do launchctl bootstrap "gui/$(id -u)" "$1" 2>/dev/null && return 0; sleep 2; done; launchctl bootstrap "gui/$(id -u)" "$1"; }
SHADOW=${q(shadow)}; HOOK_PORT=${hookPort}; HOOK_KEY=${q(hookKey)}; FRONT_KEY=${q(frontKey)}; PORT=${MAC_LISTENER_PORT}
${desk ? `DISCORD_TOKEN=${q(desk.token)}; DESK_KEY=${q(desk.key)}; DESK_PORT=${desk.port}` : ''}
DIR="$HOME/Library/Application Support/AangListener"; PLIST="$HOME/Library/LaunchAgents/com.aang.listener.plist"
mkdir -p "$HOME/.claude" "$DIR" "$HOME/Library/LaunchAgents"

echo "1/6  Claude Code hooks, so Aang hears when a session is done or needs you"
osascript -l JavaScript - "$SHADOW" "$HOOK_PORT" "$HOOK_KEY" <<'JXA'
${HOOKS_JXA}
JXA

echo "2/6  The one-job listener, so clicking Aang's icon brings Claude forward, and the job hunt can start here"
cat > "$DIR/listen.pl" <<'PERL'
${LISTENER}PERL
cat > "$DIR/run.applescript" <<'APPLESCRIPT'
${RUN_APPLESCRIPT}APPLESCRIPT
# M1: the key and Shadow's address go into files only you can read (printf is built into bash, so the key never
# appears on any command line).
( umask 077; printf '%s' "$FRONT_KEY" > "$DIR/key"; printf '%s' "$SHADOW" > "$DIR/shadow" )
# M2: the heartbeat's address, with the hook key, in a curl config file only you can read.
( umask 077; printf 'url = "http://%s:%s/alive?k=%s"\n' "$SHADOW" "$HOOK_PORT" "$HOOK_KEY" > "$DIR/alive.curl" )
cat > "$DIR/heartbeat.sh" <<'HEARTBEAT'
${HEARTBEAT}HEARTBEAT
cat > "$DIR/uninstall.sh" <<'UNINSTALL'
#!/bin/bash
launchctl bootout "gui/$(id -u)/com.aang.listener" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.aang.heartbeat" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.aang.frontdesk" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.aang.listener.plist" "$HOME/Library/LaunchAgents/com.aang.heartbeat.plist" "$HOME/Library/LaunchAgents/com.aang.frontdesk.plist"; rm -rf "$HOME/Library/Application Support/AangListener"
echo "Aang's listener is gone. (Its Claude Code hooks are in ~/.claude/settings.json; the file from before is kept next to it.)"
UNINSTALL
chmod 700 "$DIR" "$DIR/uninstall.sh" "$DIR/heartbeat.sh"; chmod 600 "$DIR/key" "$DIR/shadow" "$DIR/alive.curl"
cat > "$PLIST" <<PLISTXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aang.listener</string>
  <key>ProgramArguments</key><array><string>/usr/bin/perl</string><string>$DIR/listen.pl</string><string>$PORT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
</dict></plist>
PLISTXML
chmod 600 "$PLIST"
launchctl bootout "gui/$(id -u)/com.aang.listener" 2>/dev/null || true
start_agent "$PLIST"
HBPLIST="$HOME/Library/LaunchAgents/com.aang.heartbeat.plist"
cat > "$HBPLIST" <<HBXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aang.heartbeat</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/heartbeat.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
</dict></plist>
HBXML
chmod 600 "$HBPLIST"
launchctl bootout "gui/$(id -u)/com.aang.heartbeat" 2>/dev/null || true
start_agent "$HBPLIST"

echo "3/6  Node.js for Aang's Mac side (his yes, 2026-10-13): kept in Aang's own folder, no admin password"
# The newest long-term-support Node for Intel Macs, from nodejs.org, checked against Node's own SHA-256 list
# before it is unpacked. A mismatch is thrown away. Skipped when it is already there.
NODE_DIR="$DIR/node"
if [ -x "$NODE_DIR/bin/node" ]; then
  echo "     Node is already here: $("$NODE_DIR/bin/node" -v)"
else
  VER=$(/usr/bin/curl -fsS -m 30 https://nodejs.org/dist/index.json | /usr/bin/perl -MJSON::PP -e 'my $a = decode_json(join("", <STDIN>)); for my $r (@$a) { if ($r->{lts} && grep { $_ eq "osx-x64-tar" } @{$r->{files}}) { print $r->{version}; last } }') || VER=""
  if [ -z "$VER" ]; then
    echo "     Could not reach nodejs.org; Node was not installed (run this setup again later)."
  else
    F="node-$VER-darwin-x64.tar.gz"; T=$(mktemp -d)
    if /usr/bin/curl -fsS -m 900 -o "$T/$F" "https://nodejs.org/dist/$VER/$F" && /usr/bin/curl -fsS -m 30 -o "$T/SUMS" "https://nodejs.org/dist/$VER/SHASUMS256.txt"; then
      WANT=$(grep " $F\$" "$T/SUMS" | cut -d' ' -f1) || WANT=""
      GOT=$(shasum -a 256 "$T/$F" | cut -d' ' -f1)
      if [ -n "$WANT" ] && [ "$WANT" = "$GOT" ]; then
        mkdir -p "$NODE_DIR" && tar -xzf "$T/$F" -C "$NODE_DIR" --strip-components 1 && echo "     Node $VER installed and checked against nodejs.org's fingerprint."
      else
        echo "     Node's download did not match its fingerprint, so it was thrown away. Nothing installed."
      fi
    else
      echo "     Node's download failed; nothing installed (run this setup again later)."
    fi
    rm -rf "$T"
  fi
fi

${desk ? `echo "4/6  Aang's front desk (M3): the one connection to Discord, always on, on this Mac"
FD="$DIR/frontdesk"; mkdir -p "$FD"
# The Discord bot's token and the front desk's key go into files only you can read (printf is built into bash).
( umask 077; printf '%s' "$DISCORD_TOKEN" > "$DIR/discord.token"; printf '%s' "$DESK_KEY" > "$DIR/frontdesk.key"; printf '{"shadow":"%s","port":%s}\\n' "$SHADOW" "$DESK_PORT" > "$DIR/frontdesk.json" )
${deskFiles}
if [ -x "$NODE_DIR/bin/node" ]; then
  # Exactly the versions in the lockfile, each checked against its fingerprint; no install scripts are run.
  # M4: this includes Claude's engine for the Mac (about 230 MB the first time, his OK 2026-10-13).
  echo "     Installing (the first time this downloads about 230 MB, so it can take a few minutes)..."
  # Its own download cache (2026-10-13): his ~/.npm had files he could not write (an old sudo install), and npm ci
  # failed on them. Aang's folder is always his own.
  if ( cd "$FD" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$DIR/npm-cache" >"$DIR/npm.log" 2>&1 ); then
    FDPLIST="$HOME/Library/LaunchAgents/com.aang.frontdesk.plist"
    cat > "$FDPLIST" <<FDXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aang.frontdesk</string>
  <key>ProgramArguments</key><array><string>$NODE_DIR/bin/node</string><string>$FD/frontdesk.ts</string><string>$DIR</string></array>
  <key>WorkingDirectory</key><string>$FD</string>
  <key>StandardOutPath</key><string>$DIR/frontdesk.log</string>
  <key>StandardErrorPath</key><string>$DIR/frontdesk.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
FDXML
    chmod 600 "$FDPLIST" "$DIR/discord.token" "$DIR/frontdesk.key"
    launchctl bootout "gui/$(id -u)/com.aang.frontdesk" 2>/dev/null || true
    start_agent "$FDPLIST"
    sleep 8
    if grep -q "listening for Shadow" "$DIR/frontdesk.log" 2>/dev/null; then echo "     The front desk is connected to Discord and waiting for Shadow."; else echo "     The front desk started; it may still be connecting (see $DIR/frontdesk.log)."; fi
    # M4: the Mac answers as Aang with the Claude sign-in already on this Mac. Only whether it exists is checked;
    # the sign-in itself is never read here.
    if security find-generic-password -s "Claude Code-credentials" >/dev/null 2>&1; then
      echo "     The Mac can answer as Aang while Shadow is off (Claude is signed in here)."
    else
      echo "     To let the Mac answer while Shadow is off, sign in to Claude once. Paste this, then follow the sign-in:"
      echo "       \\"$FD/node_modules/@anthropic-ai/claude-agent-sdk-darwin-x64/claude\\""
    fi
  else
    echo "     Installing the front desk's libraries failed; nothing was changed. What npm said:"
    grep -i "error" "$DIR/npm.log" | head -6 | sed 's/^/       /'
  fi
else
  echo "     Node is not here, so the front desk was not started."
fi
` : ''}${desk?.browser ? `echo "5/6  Aang's browser (M6): the same browser as on the PC, kept in step with it"
( umask 077; printf '%s' ${q(desk.browser.bsyncKey)} > "$DIR/bsync.key" )
BR="$DIR/browser"; mkdir -p "$BR"
EV=${ELECTRON_MAC.version}; ZIP="electron-v$EV-darwin-x64.zip"; SUM=${ELECTRON_MAC.sha256}
if [ ! -d "$BR/engine-$EV/Electron.app" ]; then
  echo "     Downloading the browser engine (about 110 MB, once)..."
  rm -rf "$BR"/engine-*; curl -fsSL -o "$BR/$ZIP" "https://github.com/electron/electron/releases/download/v$EV/$ZIP" || true
  # Exactly the engine Aang was built for: its fingerprint is fixed in Aang's own code, not fetched alongside it.
  if [ "$(shasum -a 256 "$BR/$ZIP" 2>/dev/null | cut -d' ' -f1)" = "$SUM" ]; then mkdir -p "$BR/engine-$EV" && ditto -x -k "$BR/$ZIP" "$BR/engine-$EV"; else echo "     The engine download did not match its fingerprint; nothing was installed."; fi
  rm -f "$BR/$ZIP"
fi
if [ -d "$BR/engine-$EV/Electron.app" ] && [ -x "$NODE_DIR/bin/node" ]; then
  APP="$HOME/Applications/Aang.app"; mkdir -p "$HOME/Applications"
  osascript -e 'quit app "Aang"' >/dev/null 2>&1 || true; sleep 1
  rm -rf "$APP.new"; ditto "$BR/engine-$EV/Electron.app" "$APP.new"
  RES="$APP.new/Contents/Resources"; mkdir -p "$RES/app"
  printf '%s' '${b64(desk.browser.bundle)}' | /usr/bin/base64 -D | tar -xzf - -C "$RES/app"
  if ( cd "$RES/app" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$DIR/npm-cache" >"$DIR/npm-browser.log" 2>&1 ); then
    PB=/usr/libexec/PlistBuddy; PL="$APP.new/Contents/Info.plist"
    $PB -c "Set :CFBundleName Aang" -c "Set :CFBundleDisplayName Aang" -c "Set :CFBundleIdentifier com.aang.browser" "$PL"
    $PB -c "Delete :CFBundleURLTypes" "$PL" >/dev/null 2>&1 || true
    $PB -c "Add :CFBundleURLTypes array" -c "Add :CFBundleURLTypes:0 dict" -c "Add :CFBundleURLTypes:0:CFBundleURLName string Web site URL" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string http" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:1 string https" "$PL"
    # Aang's face is the icon, never the Electron atom (his rule).
    IS="$BR/aang.iconset"; rm -rf "$IS"; mkdir -p "$IS"; FACE="$RES/app/pages/art/aang-face.png"
    for s in 16 32 128 256 512; do d=$((s*2)); sips -z $s $s "$FACE" --out "$IS/icon_$s"x"$s.png" >/dev/null 2>&1; sips -z $d $d "$FACE" --out "$IS/icon_$s"x"$s@2x.png" >/dev/null 2>&1; done
    iconutil -c icns "$IS" -o "$RES/electron.icns" >/dev/null 2>&1 || true
    codesign --force --deep -s - "$APP.new" >/dev/null 2>&1 || true
    rm -rf "$APP"; mv "$APP.new" "$APP"
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
    # In the Dock, once (his yes).
    if ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "Applications/Aang.app"; then
      defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$APP/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
      killall Dock >/dev/null 2>&1 || true
    fi
    echo "     Aang's browser is in your Dock. The first time it opens, macOS asks whether Aang may be your default browser."
    # Paid video (2026-10-13): castLabs' engine for Intel Macs, pinned, with the streaming signature made on the PC
    # with his free castLabs account (the signature is a small file tied to exactly this engine). Signed for macOS
    # afterwards, in that order, as castLabs says.
    DV=${CASTLABS_MAC.version}; DZIP="castlabs-$DV-darwin-x64.zip"; DSUM=${CASTLABS_MAC.sha256}
    if [ ! -f "$BR/drm-$DV/signed" ]; then
      echo "     Downloading the paid-video engine (about 135 MB, once)..."
      curl -fsSL -o "$BR/$DZIP" "https://github.com/castlabs/electron-releases/releases/download/v$DV%2Bwvcus/electron-v$DV%2Bwvcus-darwin-x64.zip" || true
      if [ "$(shasum -a 256 "$BR/$DZIP" 2>/dev/null | cut -d' ' -f1)" = "$DSUM" ]; then
        rm -rf "$BR/drm-$DV"; mkdir -p "$BR/drm-$DV"; ditto -x -k "$BR/$DZIP" "$BR/drm-$DV"
        printf '%s' '${b64(desk.browser.castlabsSig)}' | /usr/bin/base64 -D > "$BR/drm-$DV/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Electron Framework.sig"
        codesign --force --deep -s - "$BR/drm-$DV/Electron.app" >/dev/null 2>&1 || true
        touch "$BR/drm-$DV/signed"
        echo "     Paid video is ready: Netflix, Crave, Disney+, Prime and Crunchyroll open in their own window."
      else echo "     The paid-video engine did not match its fingerprint; it was not installed."; fi
      rm -f "$BR/$DZIP"
    fi
    # His yes: Bitwarden's key-fill here too. Bitwarden's own official tool, pinned by its fingerprint; he signs in to it himself.
    BWV=${BITWARDEN_MAC.version}; BWSUM=${BITWARDEN_MAC.sha256}
    if [ "$(cat "$DIR/bw/version" 2>/dev/null)" != "$BWV" ]; then
      curl -fsSL -o "$DIR/bw.zip" "https://github.com/bitwarden/clients/releases/download/cli-v$BWV/bw-macos-$BWV.zip" || true
      if [ "$(shasum -a 256 "$DIR/bw.zip" 2>/dev/null | cut -d' ' -f1)" = "$BWSUM" ]; then
        rm -rf "$DIR/bw"; mkdir -p "$DIR/bw"; ditto -x -k "$DIR/bw.zip" "$DIR/bw"; chmod 700 "$DIR/bw/bw"; printf '%s' "$BWV" > "$DIR/bw/version"
        echo "     Bitwarden's tool is installed. Sign in to it once, yourself:  \\"$DIR/bw/bw\\" login"
      else echo "     Bitwarden's tool did not match its fingerprint; it was not installed."; fi
      rm -f "$DIR/bw.zip"
    fi
  else
    rm -rf "$APP.new"
    echo "     Installing the browser's libraries failed; nothing was changed. What npm said:"
    grep -i "error" "$DIR/npm-browser.log" | head -6 | sed 's/^/       /'
  fi
fi
` : ''}echo "6/6  Checking the line back to Aang"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST --data '{}' "http://$SHADOW:$HOOK_PORT/hook?e=Ping&k=$HOOK_KEY" || true)
if [ "$CODE" = "204" ]; then echo "     Aang heard this Mac."; else echo "     Aang did not answer (got '$CODE'). Is the Windows firewall rule in, and Tailscale on here?"; fi
sleep 12
if [ -f "$DIR/shadow.state" ]; then echo "     Heartbeat: Shadow is $(cut -d' ' -f1 "$DIR/shadow.state")."; else echo "     Heartbeat: no answer yet (it checks every 10 seconds)."; fi
echo "Done. Restart the Claude app on this Mac so its sessions pick up the hooks."
`;
}
