#!/bin/sh
# Moteur de hauteur de la voix (SwiftF0): un petit environnement Python isolé (~130 Mo). Sans lui, l'app marche sans carte de voix.
V="${PITCH_VENV:-$HOME/.djsynth-pitch}"
[ -x "$V/bin/python" ] && "$V/bin/python" -c "import swift_f0" 2>/dev/null && { echo "pitch: déjà installé"; exit 0; }
python3 -m venv "$V" && "$V/bin/pip" install -q "swift-f0[audio]" numpy && echo "pitch: installé dans $V" || echo "pitch: installation impossible (la carte de voix sera ignorée)"
