#!/bin/sh
# Reconstruit l'appli et la réinstalle dans /Applications (à relancer après chaque changement de code)
set -e
cd "$(dirname "$0")/.."
npx next build --webpack
npx @electron/packager mac DJSynth --platform=darwin --arch=arm64 --out=/tmp/djsynth-pkg --overwrite
pkill -f "/Applications/DJSynth.app" 2>/dev/null || true
rm -rf /Applications/DJSynth.app
cp -R /tmp/djsynth-pkg/DJSynth-darwin-arm64/DJSynth.app /Applications/DJSynth.app
xattr -cr /Applications/DJSynth.app
echo "DJSynth installé dans /Applications"
