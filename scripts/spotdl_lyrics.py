#!/usr/bin/env python3
"""Search for lyrics for a given term and output the result as a JSON line."""

import json
import re
import sys
import syncedlyrics

def main():
    term = " ".join(sys.argv[1:]).strip()[:200]
    if not term:
        sys.stdout.write(json.dumps({"lrc": None, "synced": False}, ensure_ascii=False) + "\n")
        sys.exit(0)

    result = {"lrc": None, "synced": False}

    try:
        lrc = syncedlyrics.search(term, synced_only=True, providers=["Lrclib", "NetEase", "Megalobiz"])
        if lrc and re.search(r"^\[\d{2}:", lrc, re.M):
            result = {"lrc": lrc, "synced": True}
    except Exception:
        pass

    if result["lrc"] is None:
        try:
            plain = syncedlyrics.search(term, plain_only=True, providers=["Lrclib", "Genius"])
            if plain:
                result = {"lrc": plain, "synced": False}
        except Exception:
            pass

    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.exit(0)

if __name__ == "__main__":
    main()
