#!/usr/bin/env python3
"""Search for tracks on YouTube Music."""

import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from spotdl.utils.search import get_ytm_client

_thread_local = threading.local()

def client():
    if not hasattr(_thread_local, "ytm_client"):
        _thread_local.ytm_client = get_ytm_client()
    return _thread_local.ytm_client

def to_track(item: dict) -> dict | None:
    if not item.get("videoId"):
        return None
    thumbnails = item.get("thumbnails") or []
    art = None
    if thumbnails:
        art = thumbnails[-1].get("url")
        if art:
            art = re.sub(r"=w\d+-h\d+", "=w544-h544", art)
    return {
        "id": item["videoId"],
        "title": item.get("title") or "?",
        "artist": ", ".join(a["name"] for a in (item.get("artists") or []) if a.get("name")) or "YouTube Music",
        "album": (item.get("album") or {}).get("name"),
        "duration": int(item.get("duration_seconds") or 0),
        "artwork": art,
        "explicit": bool(item.get("isExplicit")),
        "source": "youtube"
    }

def search(q: str, limit: int) -> list:
    q = q.strip()[:200]
    if not q:
        return []
    limit = max(1, min(limit, 300))
    items = client().search(q, filter="songs", limit=limit)
    tracks = []
    seen_ids = set()
    for item in items:
        track = to_track(item)
        if track and track["id"] not in seen_ids:
            seen_ids.add(track["id"])
            tracks.append(track)
            if len(tracks) >= limit:
                break
    return tracks

out_lock = threading.Lock()

def emit(obj):
    with out_lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()

def handle(line: str):
    try:
        req = json.loads(line)
        rid = req.get("id")
        emit({"id": rid, "tracks": search(str(req.get("q", "")), int(req.get("limit", 60)))})
    except Exception as e:
        emit({"id": rid if 'rid' in locals() else None, "error": f"{type(e).__name__}: {e}"[:300]})

def main():
    emit({"ready": True})
    pool = ThreadPoolExecutor(max_workers=4)
    for line in sys.stdin:
        if line.strip():
            pool.submit(handle, line)
    pool.shutdown(wait=True)

if __name__ == "__main__":
    main()
