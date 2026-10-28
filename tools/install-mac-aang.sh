#!/bin/zsh
# Aang on the Mac (2026-10-28, the Mac is his home): put his small app beside the brain and start it with the Mac.
# Run from the repo on the MacBook:  zsh tools/install-mac-aang.sh
# Safe to run again: it updates the copy and restarts him. Electron is cloned (copy-on-write), so it costs no disk.
set -e
REPO=${0:A:h:h}
L="$HOME/Library/Application Support/AangListener"
A="$L/aang-app"
SHELL_MODULES=${AANG_SHELL_MODULES:-$REPO/src/Shell/node_modules}

mkdir -p "$A/bin" "$A/assets"
rsync -a --delete --exclude test "$REPO/src/Shell/src" "$REPO/src/Shell/pages" "$REPO/src/Shell/mac" "$A/"
cp "$REPO/src/Shell/package.json" "$A/"
rsync -a "$REPO/assets/aang/frames" "$REPO/assets/aang/sfx" "$A/assets/"
swiftc -O -o "$A/bin/aang-clicks" "$A/mac/clicks.swift"
[ -d "$A/node_modules" ] || cp -cR "$SHELL_MODULES" "$A/node_modules"

P="$HOME/Library/LaunchAgents/com.aang.pet.plist"
( umask 077; cat > "$P" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aang.pet</string>
  <key>ProgramArguments</key><array><string>$A/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron</string><string>$A/src/macaang.ts</string></array>
  <key>WorkingDirectory</key><string>$A</string>
  <key>EnvironmentVariables</key><dict><key>AANG_ASSETS_DIR</key><string>$A/assets</string></dict>
  <key>StandardOutPath</key><string>$L/aang-app.log</string>
  <key>StandardErrorPath</key><string>$L/aang-app.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>20</integer>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
EOF
)
# Quit Aang from his menu exits cleanly, so launchd leaves him off until the next login; a crash brings him back.
launchctl bootout "gui/$(id -u)/com.aang.pet" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$P"
echo "Aang is installed and running. Log: $L/aang-app.log"
