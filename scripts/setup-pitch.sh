#!/bin/sh
# Moteur de hauteur de la voix (SwiftF0): un petit environnement Python isolé (~130 Mo). Sans lui, l'app marche sans carte de voix.
V="${PITCH_VENV:-$HOME/.djsynth-pitch}"
[ -x "$V/bin/python" ] && "$V/bin/python" -c "import swift_f0" 2>/dev/null && { echo "pitch: déjà installé"; exit 0; }
python3 -m venv "$V" && "$V/bin/pip" install -q "swift-f0[audio]" numpy && echo "pitch: installé dans $V" || echo "pitch: installation impossible (la carte de voix sera ignorée)"
# notes MIDI des stems (basic-pitch, Python 3.11 via uv): ~350 Mo
M="${NOTES_VENV:-$HOME/.djsynth-midi}"
if [ -x "$M/bin/python" ] && "$M/bin/python" -c "import basic_pitch" 2>/dev/null; then echo "notes: déjà installé"; elif command -v uv >/dev/null; then
  uv venv -q --python 3.11 "$M" && uv pip install -q --python "$M/bin/python" basic-pitch "setuptools<81" && echo "notes: installé dans $M" || echo "notes: installation impossible (les effets ne seront pas calés sur les notes)"
else echo "notes: uv absent, étape ignorée"; fi
