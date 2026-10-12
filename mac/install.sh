#!/bin/sh
# Reconstruit l'appli et la réinstalle dans /Applications (à relancer après chaque changement de code)
set -e
cd "$(dirname "$0")/.."
npx next build --webpack
npx @electron/packager mac DJSynth --platform=darwin --arch=arm64 --out=/tmp/djsynth-pkg --overwrite
# quit cleanly (the app stops its own server), then clear any server left behind by an older version
osascript -e 'tell application "DJSynth" to quit' 2>/dev/null || true
sleep 2
pkill -f "/Applications/DJSynth.app" 2>/dev/null || true
PIDF="$HOME/Library/Application Support/DJSynth/server.pid"
[ -f "$PIDF" ] && kill -9 "$(cat "$PIDF")" 2>/dev/null || true
lsof -ti tcp:3217 2>/dev/null | xargs kill -9 2>/dev/null || true
rm -rf /Applications/DJSynth.app
cp -R /tmp/djsynth-pkg/DJSynth-darwin-arm64/DJSynth.app /Applications/DJSynth.app
xattr -cr /Applications/DJSynth.app
echo "DJSynth installé dans /Applications"
