// Samara's update engine on the Mac (his picks, 2026-10-29): the script his UPDATE key runs for a release from GitHub.
// The same steps as the PC-made script (src/Core/src/macsetup.ts, build_app and the swap), only Samara's own part, and
// from a bundle this Samara already checked against his release seal. Made here, by the running Samara, never fetched.
//
//   prepare  the new Samara made beside the old one, in the background (a clone of this one, the new code put in)
//   swap     Restart now (or overnight): Samara closes, the insides change places, the old ones kept in rollback/,
//            Samara opens again; if the new one does not start, the old one goes back by itself.

export interface MacUpdate { bundle: string; version: string; commit: string }
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function macUpdateScript(o: MacUpdate): string {
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(o.version) || !/^[0-9a-f]{40}$/.test(o.commit) || !o.bundle.endsWith('.tgz')) throw new Error('not a release');
  const installed = JSON.stringify({ version: o.version, commit: o.commit.slice(0, 12), status: 'trial', from: 'github' });
  return `#!/bin/bash
# Samara ${o.version} from GitHub, sealed with his release key. Written by Samara itself (src/Shell/src/macupdate.ts).
set -e
PHASE="$1"; VERSION=${q(o.version)}; BUNDLE=${q(o.bundle)}
DIR="$HOME/Library/Application Support/AangListener"; BR="$DIR/browser"; APP="$HOME/Applications/Samara.app"
RB="$BR/rollback"; STAGE="$BR/staged"; NODE_DIR="$DIR/node"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
case "$PHASE" in prepare|swap) ;; *) echo "prepare or swap"; exit 2 ;; esac
[ "$PHASE" = "swap" ] && trap 'open -a "$APP" >/dev/null 2>&1 || true' EXIT
sign_app() { codesign --force --deep -s "Samara on this Mac" "$1" >/dev/null 2>&1 || codesign --force --deep -s - "$1" >/dev/null 2>&1 || true; }
npm_bin() { if [ -x "$NODE_DIR/bin/npm" ]; then echo "$NODE_DIR/bin/npm"; else command -v npm; fi; }

if [ "$PHASE" = "prepare" ]; then
  [ -f "$BUNDLE" ] || { echo "The release bundle is missing."; exit 1; }
  rm -rf "$STAGE"; mkdir -p "$STAGE"; NEWAPP="$STAGE/Samara.app"
  # A copy-on-write clone of the Samara here (instant on the Mac's disk): the engine, the icon and the signature stay.
  cp -cR "$APP" "$NEWAPP" 2>/dev/null || ditto "$APP" "$NEWAPP"
  RES="$NEWAPP/Contents/Resources"
  OLDLOCK="$(shasum -a 256 "$RES/app/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  rm -rf "$RES/app/src" "$RES/app/pages" "$RES/app/drm" "$RES/app/claude-link"
  tar -xzf "$BUNDLE" -C "$RES/app"
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
for i in $(seq 1 40); do pgrep -f "Applications/(Samara|Aang).app/Contents/MacOS/" >/dev/null 2>&1 || break; sleep 0.5; done
# Only what is INSIDE Samara.app changes places, never the folder: the Dock's pin follows the folder.
rm -rf "$RB/Samara.app"; mkdir -p "$RB/Samara.app"
mv "$APP/Contents" "$RB/Samara.app/Contents"
mv "$STAGE/Samara.app/Contents" "$APP/Contents"; rm -rf "$STAGE"
cp "$BR/installed.json" "$BR/installed.prev.json" 2>/dev/null || rm -f "$BR/installed.prev.json"
printf '%s' ${q(installed)} > "$BR/installed.json"
"$LSR" -u "$RB/Samara.app" >/dev/null 2>&1 || true; "$LSR" -f "$APP" >/dev/null 2>&1 || true
rm -f "$BUNDLE"
trap - EXIT
open -a "$APP"
echo "Update done: $VERSION. Samara is opening again."
# The new Samara marks itself good once it has run a minute. Not running and never got there: it did not start, so
# the old one goes back and this version is not offered again.
for t in 40 60 120; do
  sleep $t
  grep -q '"status":"good"' "$BR/installed.json" 2>/dev/null && break
  if ! pgrep -f "Samara.app/Contents/MacOS/" >/dev/null 2>&1; then
    if [ -d "$RB/Samara.app/Contents" ]; then
      echo "The new Samara did not start; putting the old one back."
      rm -rf "$APP/Contents"; mv "$RB/Samara.app/Contents" "$APP/Contents"; rm -rf "$RB/Samara.app"
      if [ -f "$BR/installed.prev.json" ]; then mv "$BR/installed.prev.json" "$BR/installed.json"; else rm -f "$BR/installed.json"; fi
      echo "$VERSION" >> "$BR/failed-updates.txt"
      open -a "$APP"
    fi
    break
  fi
done
exit 0
`;
}
