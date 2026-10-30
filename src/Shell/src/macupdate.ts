// Samara's update engine on the Mac (his picks, 2026-10-29): the script his UPDATE key runs for a release from GitHub.
// The same steps as the PC-made script (src/Core/src/macsetup.ts, build_app and the swap), only Samara's own part, and
// from a bundle this Samara already checked against his release seal. Made here, by the running Samara, never fetched.
//
//   prepare  the new Samara made beside the old one, in the background (a clone of this one, the new code put in;
//            or, for a new engine, castLabs' engine already signed for video, with this Samara's own insides put in)
//   swap     Restart now (or overnight): Samara closes, the insides change places, the old ones kept in rollback/,
//            Samara opens again; if the new one does not start, the old one goes back by itself.

/** bundle: Samara's new code (a sealed release), or '' when only the engine changes. engine: castLabs' Electron.app,
 *  already checked against its seal and signed for video (evs.ts), when the engine changes. One script either way. */
export interface MacUpdate { bundle: string; version: string; commit: string; engine?: { app: string; version: string } }
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function macUpdateScript(o: MacUpdate): string {
  const e = o.engine;
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(o.version) || !/^[0-9a-f]{12,40}$/.test(o.commit)) throw new Error('not a release');
  if (o.bundle ? !o.bundle.endsWith('.tgz') : !e) throw new Error('not a release');
  if (e && (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(e.version) || !e.app.endsWith('/Electron.app'))) throw new Error('not an engine');
  const installed = JSON.stringify({ version: o.version, commit: o.commit.slice(0, 12), status: 'trial', from: 'github', ...(e ? { engine: e.version } : {}) });
  const stage = e ? `${o.version}+${e.version}` : o.version;
  return `#!/bin/bash
# Samara ${o.version} from GitHub, sealed with his release key. Written by Samara itself (src/Shell/src/macupdate.ts).
set -e
PHASE="$1"; VERSION=${q(stage)}; BUNDLE=${q(o.bundle)}; ENGINE=${q(e?.app ?? '')}; EV=${q(e?.version ?? '')}
DIR="$HOME/Library/Application Support/AangListener"; BR="$DIR/browser"; APP="$HOME/Applications/Samara.app"
RB="$BR/rollback"; STAGE="$BR/staged"; NODE_DIR="$DIR/node"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
case "$PHASE" in prepare|swap) ;; *) echo "prepare or swap"; exit 2 ;; esac
# Opening Samara again (2026-10-30, seen on his Mac on Oct 29: \`open -a\` answered -600 "procNotFound" while the old
# Samara was still closing, and with \`set -e\` the script stopped there: Samara stayed closed for hours and the check
# below never ran). Tried a few times, then the app's own program is started directly; never fatal.
launch() {
  for i in 1 2 3 4 5; do open -a "$APP" >/dev/null 2>&1 && return 0; sleep $i; done
  BIN="$APP/Contents/MacOS/$(ls "$APP/Contents/MacOS" 2>/dev/null | head -1)"
  [ -x "$BIN" ] && { nohup "$BIN" >/dev/null 2>&1 & disown; return 0; }
  echo "Samara could not be opened again."; return 0
}
running() { pgrep -f "Applications/(Samara|Aang).app/Contents/MacOS/" >/dev/null 2>&1; }
[ "$PHASE" = "swap" ] && trap 'launch' EXIT
sign_app() { codesign --force --deep -s "Samara on this Mac" "$1" >/dev/null 2>&1 || codesign --force --deep -s - "$1" >/dev/null 2>&1 || true; }
npm_bin() { if [ -x "$NODE_DIR/bin/npm" ]; then echo "$NODE_DIR/bin/npm"; else command -v npm; fi; }

if [ "$PHASE" = "prepare" ]; then
  [ -z "$BUNDLE" ] || [ -f "$BUNDLE" ] || { echo "The release bundle is missing."; exit 1; }
  [ -z "$ENGINE" ] || [ -f "$ENGINE/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Electron Framework.sig" ] || { echo "The new engine is not signed for video."; exit 1; }
  rm -rf "$STAGE"; mkdir -p "$STAGE"; NEWAPP="$STAGE/Samara.app"
  if [ -n "$ENGINE" ]; then
    # A new engine: castLabs' own app (signed for video), with this Samara's insides (its code and libraries) put in,
    # and the same name and identity as before, so his logins, history and default-browser choice carry over.
    ditto "$ENGINE" "$NEWAPP"; RES="$NEWAPP/Contents/Resources"; mkdir -p "$RES/app"
    ditto "$APP/Contents/Resources/app" "$RES/app"; printf '%s' "castlabs-$EV" > "$RES/aang-engine"
    PL="$NEWAPP/Contents/Info.plist"; PB=/usr/libexec/PlistBuddy
    $PB -c "Set :CFBundleName Aang" -c "Set :CFBundleIdentifier com.aang.browser" "$PL"
    $PB -c "Set :CFBundleDisplayName Samara" "$PL" >/dev/null 2>&1 || $PB -c "Add :CFBundleDisplayName string Samara" "$PL"
    $PB -c "Delete :CFBundleURLTypes" "$PL" >/dev/null 2>&1 || true
    $PB -c "Add :CFBundleURLTypes array" -c "Add :CFBundleURLTypes:0 dict" -c "Add :CFBundleURLTypes:0:CFBundleURLName string Web site URL" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string http" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:1 string https" "$PL"
  else
    # A copy-on-write clone of the Samara here (instant on the Mac's disk): the engine, the icon and the signature stay.
    cp -cR "$APP" "$NEWAPP" 2>/dev/null || ditto "$APP" "$NEWAPP"
    RES="$NEWAPP/Contents/Resources"
  fi
  OLDLOCK="$(shasum -a 256 "$RES/app/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  if [ -n "$BUNDLE" ]; then
    rm -rf "$RES/app/src" "$RES/app/pages" "$RES/app/drm" "$RES/app/claude-link"
    tar -xzf "$BUNDLE" -C "$RES/app"
  fi
  NEWLOCK="$(shasum -a 256 "$RES/app/package-lock.json" | cut -d' ' -f1)"
  if [ "$OLDLOCK" != "$NEWLOCK" ] || [ ! -d "$RES/app/node_modules" ]; then
    NPM="$(npm_bin)"; [ -n "$NPM" ] || { echo "No npm on this Mac to install the browser's libraries."; exit 1; }
    ( cd "$RES/app" && PATH="$(dirname "$NPM"):$PATH" "$NPM" ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$DIR/npm-cache" >"$DIR/npm-browser.log" 2>&1 ) || { echo "Installing the browser's libraries failed."; grep -i error "$DIR/npm-browser.log" | head -6; exit 1; }
  fi
  # Samara's lantern, each size its own pixel art (as the Mac setup makes it), when the release carries it.
  SI="$RES/app/pages/art/samara"; IS="$BR/samara.iconset"
  if [ -f "$SI/samara-unlit-1024.png" ]; then
    rm -rf "$IS"; mkdir -p "$IS"
    for s in 16 32 128 256 512; do d=$((s*2)); cp "$SI/samara-unlit-$s.png" "$IS/icon_$s"x"$s.png"; cp "$SI/samara-unlit-$d.png" "$IS/icon_$s"x"$s@2x.png"; done
    iconutil -c icns "$IS" -o "$RES/electron.icns" >/dev/null 2>&1 || true
  fi
  # castLabs' video signature first, then the Mac's own (castLabs' order): the video one is already in the engine.
  sign_app "$NEWAPP"
  codesign --verify --deep "$NEWAPP" >/dev/null 2>&1 || true
  # Not an app macOS should know: the Dock could take it for his Samara and show a second one.
  touch "$BR/.metadata_never_index"; "$LSR" -u "$NEWAPP" >/dev/null 2>&1 || true
  printf '%s' "$VERSION" > "$STAGE/version"
  echo "Ready: $VERSION"; exit 0
fi

# swap
[ -d "$STAGE/Samara.app/Contents" ] && [ "$(cat "$STAGE/version" 2>/dev/null)" = "$VERSION" ] || { echo "Nothing ready to put in."; exit 1; }
osascript -e 'quit app id "com.aang.browser"' >/dev/null 2>&1 || true
# A busy Mac can take more than 20 s to close it. Its insides are never moved while it still runs: asked, then told.
for i in $(seq 1 120); do running || break; sleep 0.5; done
if running; then pkill -TERM -f "Applications/(Samara|Aang).app/Contents/MacOS/" 2>/dev/null || true; for i in $(seq 1 20); do running || break; sleep 0.5; done; fi
if running; then pkill -KILL -f "Applications/(Samara|Aang).app/Contents/MacOS/" 2>/dev/null || true; sleep 1; fi
# Only what is INSIDE Samara.app changes places, never the folder: the Dock's pin follows the folder.
rm -rf "$RB/Samara.app"; mkdir -p "$RB/Samara.app"
mv "$APP/Contents" "$RB/Samara.app/Contents"
mv "$STAGE/Samara.app/Contents" "$APP/Contents"; rm -rf "$STAGE"
cp "$BR/installed.json" "$BR/installed.prev.json" 2>/dev/null || rm -f "$BR/installed.prev.json"
printf '%s' ${q(installed)} > "$BR/installed.json"
"$LSR" -u "$RB/Samara.app" >/dev/null 2>&1 || true; "$LSR" -f "$APP" >/dev/null 2>&1 || true
[ -n "$BUNDLE" ] && rm -f "$BUNDLE"
trap - EXIT
launch
echo "Update done: $VERSION. Samara is opening again."
# The new Samara marks itself good once it has run a minute. The old one goes back only when the new one really failed:
# it started and then died, or it never started at all in four minutes (2026-10-30, his Mac: under heavy load it took
# about 50 s to appear, the old check looked at 40 s, saw nothing, and put a working update back).
seen=0
for t in 20 20 20 20 20 20 30 30 30 30; do
  sleep $t
  grep -q '"status":"good"' "$BR/installed.json" 2>/dev/null && exit 0
  if running; then seen=1; continue; fi
  [ "$seen" = 1 ] && break
done
grep -q '"status":"good"' "$BR/installed.json" 2>/dev/null && exit 0
running && exit 0
if [ -d "$RB/Samara.app/Contents" ]; then
  echo "The new Samara did not start; putting the old one back."
  rm -rf "$APP/Contents"; mv "$RB/Samara.app/Contents" "$APP/Contents"; rm -rf "$RB/Samara.app"
  if [ -f "$BR/installed.prev.json" ]; then mv "$BR/installed.prev.json" "$BR/installed.json"; else rm -f "$BR/installed.json"; fi
  [ -n "$BUNDLE" ] && echo ${q(o.version)} >> "$BR/failed-updates.txt"
  [ -n "$EV" ] && echo "$EV" >> "$BR/failed-engines.txt"
  launch
fi
exit 0
`;
}
