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
my ($key, $port) = @ARGV;
my $dir = dirname($0);
my ($ip) = (qx{/sbin/ifconfig} =~ /inet (100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)/);
unless ($ip) { sleep 30; exit 1 }                      # Tailscale is not up yet; launchd starts this again
my $srv = IO::Socket::INET->new(LocalAddr => $ip, LocalPort => $port, Listen => 5, ReuseAddr => 1) or do { sleep 30; exit 1 };
my ($lastFront, $lastRun) = (0, 0);
while (my $c = $srv->accept) {
  my $peer = $c->peerhost // '';
  my ($path, $qkey, $clen) = ('', '', 0);
  eval {
    local $SIG{ALRM} = sub { die "slow\n" }; alarm 3;
    my $l = <$c> // '';
    if ($l =~ m{^POST (/front|/run)\?k=([^\s&]+) HTTP/}) { ($path, $qkey) = ($1, $2); }
    while (my $h = <$c>) { last if $h =~ /^\r?\n\z/; $clen = $1 if $h =~ /^Content-Length:\s*(\d+)/i; }
    alarm 0;
  };
  my $ok = $peer =~ /^100\./ && $path ne '' && $qkey eq $key;
  my $body = '';
  if ($ok && $path eq '/run' && $clen > 0) { my $n = $clen > 4000 ? 4000 : $clen; read $c, $body, $n; }
  if ($ok && $path eq '/front' && time - $lastFront >= 2) { $lastFront = time; system('/usr/bin/open', '-a', 'Claude'); }
  if ($ok && $path eq '/run' && $body ne '' && time - $lastRun >= 10) {
    $lastRun = time;
    my $tmp = "$dir/run-" . time() . '.txt';
    if (open(my $fh, '>:encoding(UTF-8)', $tmp)) { print $fh $body; close $fh; system('/usr/bin/osascript', "$dir/run.applescript", $tmp); unlink $tmp; }
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
  delay 1.5
  tell application "System Events"
    tell process "Claude"
      keystroke "n" using {command down}
      delay 0.8
      keystroke theText
      delay 0.3
      keystroke return
    end tell
  end tell
end run
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

echo "2/3  The one-job listener, so clicking Aang's icon brings Claude forward, and the job hunt can start here"
cat > "$DIR/listen.pl" <<'PERL'
${LISTENER}PERL
cat > "$DIR/run.applescript" <<'APPLESCRIPT'
${RUN_APPLESCRIPT}APPLESCRIPT
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
