// The one-paste setup for his MacBook (2026-09-22): Claude Code hooks that report to Aang over Tailscale, and a
// listener that can do exactly one thing - bring the Claude app forward - when Aang asks with its key. Served once,
// behind a one-time code (see Core.setupFor), so no script with keys in it ever has to be copied between machines.
// Nothing here needs anything installed on the Mac: bash, curl, osascript (JavaScript for Automation) and perl all
// ship with macOS.

export const MAC_LISTENER_PORT = 47840;
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];

/** The listener, in Perl. It answers only POST /front?k=<key> from a Tailscale address, runs `open -a Claude`,
 *  at most once every two seconds, and nothing else. */
const LISTENER = String.raw`#!/usr/bin/perl
# Aang's helper on this Mac. It does exactly one thing: when Aang on the Shadow PC asks over Tailscale with the key,
# it brings the Claude app forward. It cannot run anything else. To remove it: ~/Library/Application Support/AangListener/uninstall.sh
use strict; use warnings; use IO::Socket::INET;
my ($key, $port) = @ARGV;
my ($ip) = (qx{/sbin/ifconfig} =~ /inet (100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)/);
unless ($ip) { sleep 30; exit 1 }                      # Tailscale is not up yet; launchd starts this again
my $srv = IO::Socket::INET->new(LocalAddr => $ip, LocalPort => $port, Listen => 5, ReuseAddr => 1) or do { sleep 30; exit 1 };
my $last = 0;
while (my $c = $srv->accept) {
  my $peer = $c->peerhost // '';
  my $line = eval { local $SIG{ALRM} = sub { die "slow\n" }; alarm 3; my $l = <$c> // ''; while (my $h = <$c>) { last if $h =~ /^\r?\n$/ } alarm 0; $l } // '';
  my $ok = $peer =~ /^100\./ && $line =~ m{^POST /front\?k=([^\s&]+) HTTP/} && $1 eq $key;
  if ($ok && time - $last >= 2) { $last = time; system('/usr/bin/open', '-a', 'Claude'); }
  print $c ($ok ? "HTTP/1.1 204 No Content\r\n" : "HTTP/1.1 403 Forbidden\r\n"), "Content-Length: 0\r\nConnection: close\r\n\r\n";
  close $c;
}
exit 1
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

/** The whole bash script the Mac runs. `shadow` is this PC's Tailscale address. */
export function macSetupScript(shadow: string, hookPort: number, hookKey: string, frontKey: string): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return `#!/bin/bash
# Aang: MacBook setup. Written by Aang on the Shadow PC; served once. Safe to run again.
set -e
SHADOW=${q(shadow)}; HOOK_PORT=${hookPort}; HOOK_KEY=${q(hookKey)}; FRONT_KEY=${q(frontKey)}; PORT=${MAC_LISTENER_PORT}
DIR="$HOME/Library/Application Support/AangListener"; PLIST="$HOME/Library/LaunchAgents/com.aang.listener.plist"
mkdir -p "$HOME/.claude" "$DIR" "$HOME/Library/LaunchAgents"

echo "1/3  Claude Code hooks, so Aang hears when a session is done or needs you"
osascript -l JavaScript - "$SHADOW" "$HOOK_PORT" "$HOOK_KEY" <<'JXA'
${HOOKS_JXA}
JXA

echo "2/3  The one-job listener, so clicking Aang's icon brings Claude forward here"
cat > "$DIR/listen.pl" <<'PERL'
${LISTENER}PERL
cat > "$DIR/uninstall.sh" <<'UNINSTALL'
#!/bin/bash
launchctl bootout "gui/$(id -u)/com.aang.listener" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.aang.listener.plist"; rm -rf "$HOME/Library/Application Support/AangListener"
echo "Aang's listener is gone. (Its Claude Code hooks are in ~/.claude/settings.json; the file from before is kept next to it.)"
UNINSTALL
chmod 700 "$DIR" "$DIR/uninstall.sh"
cat > "$PLIST" <<PLISTXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aang.listener</string>
  <key>ProgramArguments</key><array><string>/usr/bin/perl</string><string>$DIR/listen.pl</string><string>$FRONT_KEY</string><string>$PORT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
</dict></plist>
PLISTXML
chmod 600 "$PLIST"
launchctl bootout "gui/$(id -u)/com.aang.listener" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "3/3  Checking the line back to Aang"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST --data '{}' "http://$SHADOW:$HOOK_PORT/hook?e=Ping&k=$HOOK_KEY" || true)
if [ "$CODE" = "204" ]; then echo "     Aang heard this Mac."; else echo "     Aang did not answer (got '$CODE'). Is the Windows firewall rule in, and Tailscale on here?"; fi
echo "Done. Restart the Claude app on this Mac so its sessions pick up the hooks."
`;
}
