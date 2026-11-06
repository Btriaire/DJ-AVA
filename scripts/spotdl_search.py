#!/usr/bin/env python3
"""Search Spotify's catalogue through spotDL and print the tracks as JSON (lib/spotdl.ts).

usage: spotdl_search.py "<query>" [limit]

It uses spotDL's own Spotify client, with spotDL's default settings (the free client, or the official
Web API when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set). Output, on one line:
  {"tracks": [{"id", "title", "artist", "album", "duration", "artwork", "url"}]}
or {"error": "..."} with exit code 1 (3 and "missing": true when spotDL is not installed).
"""
import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print(json.dumps({"tracks": []}))
        return 0
    query = sys.argv[1].strip()
    limit = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 30

    try:
        from spotdl.utils.config import DEFAULT_CONFIG
        from spotdl.utils.spotify import SpotifyClient
    except ImportError:
        print(json.dumps({"error": "spotDL n'est pas installé (pip install spotdl)", "missing": True}))
        return 3

    client_id = os.environ.get("SPOTIFY_CLIENT_ID") or DEFAULT_CONFIG["client_id"]
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET") or DEFAULT_CONFIG["client_secret"]
    kwargs = dict(client_id=client_id, client_secret=client_secret, no_cache=True, headless=True)
    if os.environ.get("SPOTIFY_CLIENT_ID"):
        kwargs["use_official_api"] = True  # the DJ's own Spotify app: the official Web API
    try:
        SpotifyClient.init(**kwargs)
    except TypeError:
        kwargs.pop("use_official_api", None)  # spotDL before 4.6 has only the official client
        SpotifyClient.init(**kwargs)

    try:
        raw = SpotifyClient().search(query, limit=min(limit, 50))
    except Exception as e:  # network, rate limit, Spotify change…
        print(json.dumps({"error": f"Recherche Spotify impossible : {e}"[:300]}))
        return 1

    out = []
    for it in ((raw or {}).get("tracks") or {}).get("items") or []:
        tid = it.get("id") or it.get("track_id")
        if not tid or not it.get("name"):
            continue
        album = it.get("album") or {}
        images = album.get("images") or []
        out.append(
            {
                "id": tid,
                "title": it["name"],
                "artist": ", ".join(a.get("name", "") for a in it.get("artists") or [] if a.get("name")) or "Spotify",
                "album": album.get("name") or "",
                "duration": round((it.get("duration_ms") or 0) / 1000),
                "artwork": images[0].get("url") if images else None,
                "url": (it.get("external_urls") or {}).get("spotify") or f"https://open.spotify.com/track/{tid}",
            }
        )
        if len(out) >= limit:
            break
    print(json.dumps({"tracks": out}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
