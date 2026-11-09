#!/usr/bin/env python3
"""Captures the real UI of each module for the Modules gallery (public/module-thumbs/<key>.jpg).

Needs the dev server on http://localhost:3001 (npm run dev) and Playwright for Python.
Writes lib/moduleShots.ts with the list of keys that were captured; the gallery falls back to its
pictogram for the others. Re-run after changing a module's interface:  python3 scripts/capture-modules.py
"""
import io
import json
import re
import sys
import wave
import math
import struct
import random
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = "http://localhost:3001"
OUT = ROOT / "public" / "module-thumbs"
W, H = 480, 270

page_src = (ROOT / "app" / "page.tsx").read_text(encoding="utf-8")
KEYS = re.findall(r'\{ key: "(\w+)", label:', page_src)

# Deck effects live in the RACK DSP tabs, numbered: key -> regex on the tab text.
DSP_TABS = {
    "isolator": r"^1ISO", "autotune": r"^2AUTO-TUNE", "comp": r"^3COMP", "drive": r"^4DRIVE",
    "wavefold": r"^5WAVEFOLD", "crush": r"^6CRUSH", "ringmod": r"^7RINGMOD", "voyelle": r"^8VOYELLE",
    "autowah": r"^9AUTO-WAH", "resonator": r"^10R", "gate": r"^11GATE", "glitch": r"^12GLITCH",
    "shimmer": r"^13SHIMMER", "delay": r"^14DELAY", "reverb": r"^15REVERB", "loudness": r"^16LOUDNESS",
    "surround": r"^17SURROUND", "exciter": r"^18EXCITER", "transient": r"^19TRANSIENT", "multiband": r"^20MULTI",
}
# Other modules: a heading or aria-label found in the page (first match wins).
BY_TEXT = {
    "eq": "15 bandes", "fxpad": "RACK DSP", "dx7": "DX7", "solar42": "Solar", "sampler": "Sculpteur",
    "soundfx": "FX Sonores", "djsynth": "Synthé DJ", "drums": "Boîte à rythmes", "djkbd": "Clavier DJ",
    "supersampler": "Super Sampler", "slicer": "Slicer", "dance": "MONTÉE & DROP",
}
# Left out on purpose (no reliable area to shoot): boss (empty without a mixer signal), harmony (deck key section).
SKIP = {"boss", "harmony"}


def test_track(path: Path) -> None:
    sr, bpm, dur = 44100, 120, 24
    n, beat = sr * dur, sr * 60 // bpm
    random.seed(3)
    buf = [0.0] * n
    for b in range(dur * bpm // 60):
        t0 = b * beat
        for i in range(int(sr * 0.25)):
            t = i / sr
            buf[t0 + i] += 0.8 * math.sin(2 * math.pi * (120 * math.exp(-t * 18) + 45) * t) * math.exp(-t * 9)
        note = [55, 55, 65.4, 49][b % 4]
        for i in range(beat):
            if t0 + i < n:
                buf[t0 + i] += 0.35 * math.sin(2 * math.pi * note * i / sr) + 0.07 * math.sin(2 * math.pi * 220 * i / sr)
    m = max(abs(x) for x in buf)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(x / m * 0.8 * 32767)) for x in buf))


def save(png: bytes, key: str) -> None:
    img = Image.open(io.BytesIO(png)).convert("RGB")
    scale = max(W / img.width, H / img.height)
    img = img.resize((max(W, round(img.width * scale)), max(H, round(img.height * scale))), Image.LANCZOS)
    img.crop((0, 0, W, H)).save(OUT / f"{key}.jpg", "JPEG", quality=84, optimize=True)  # keeps the top: the module's header


def save_strip(pngs: list, key: str) -> None:
    """Stacks the optional meter and the controls row of a DSP panel, trimmed to their content and enlarged: the header and the long text above are the same for every effect."""
    from PIL import ImageChops
    parts = []
    for x in pngs:
        im = Image.open(io.BytesIO(x)).convert("RGB")
        bg = Image.new("RGB", im.size, im.getpixel((2, 2)))
        box = ImageChops.difference(im, bg).point(lambda v: 255 if v > 24 else 0).getbbox()
        if box:
            pad = 6
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
        parts.append(im)
    width = max(p.width for p in parts)
    gap = 8
    sheet = Image.new("RGB", (width, sum(p.height for p in parts) + gap * (len(parts) - 1)), (20, 22, 27))
    y = 0
    for p in parts:
        sheet.paste(p, (0, y)); y += p.height + gap
    scale = min((W - 24) / sheet.width, (H - 24) / sheet.height, 2.6)
    sheet = sheet.resize((round(sheet.width * scale), round(sheet.height * scale)), Image.LANCZOS)
    card = Image.new("RGB", (W, H), (20, 22, 27))
    card.paste(sheet, ((W - sheet.width) // 2, (H - sheet.height) // 2))
    card.save(OUT / f"{key}.jpg", "JPEG", quality=86, optimize=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    done, missed = [], []
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        wav = Path(tmp) / "test.wav"
        test_track(wav)
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        pg.goto(URL)
        pg.evaluate("(k)=>{const o={};k.forEach(x=>o[x]=true);localStorage.setItem('djsynth.modules.v1',JSON.stringify(o));localStorage.setItem('djsynth.stemPrep.folded','0')}", KEYS)
        pg.reload(); pg.wait_for_timeout(1500)
        pg.get_by_text(re.compile("Démarrer l.audio", re.I)).first.click(); pg.wait_for_timeout(3000)
        for i in range(min(2, pg.locator("input[type=file]").count())):
            pg.locator("input[type=file]").nth(i).set_input_files(str(wav))
        pg.wait_for_timeout(8000)

        # 1) rack modules, which carry id="mod-<key>"
        for key in KEYS:
            loc = pg.locator(f"#mod-{key}")
            if loc.count() and key not in SKIP:
                loc.first.scroll_into_view_if_needed(); pg.wait_for_timeout(250)
                save(loc.first.screenshot(), key); done.append(key)

        # 2) deck effects: open the RACK DSP tab, click each numbered tab, shoot the panel that follows the tab grid
        pg.evaluate("()=>[...document.querySelectorAll('button')].find(b=>/RACK DSP/.test(b.textContent)).click()")
        pg.wait_for_timeout(700)
        for key, rx in DSP_TABS.items():
            ok = pg.evaluate("(rx)=>{const t=[...document.querySelectorAll('button')].find(b=>new RegExp(rx).test(b.textContent)); if(!t) return false; t.click(); t.parentElement.setAttribute('data-dsp-grid','1'); return true}", rx)
            if not ok:
                missed.append(key); continue
            pg.wait_for_timeout(450)
            panel = pg.locator("[data-dsp-grid='1'] + .hw-recess")
            if panel.count():
                panel.first.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
                kids = panel.first.locator(":scope > *")
                n = kids.count()
                ctl = next((i for i in range(1, n) if kids.nth(i).evaluate("e=>/^Dosage/.test(e.textContent.trim())")), n - 1)  # the knobs row, not a trailing button row
                idx = [i for i in range(1, ctl) if kids.nth(i).evaluate("e=>e.tagName") == "CANVAS"] + [ctl]
                save_strip([kids.nth(i).screenshot() for i in idx], key); done.append(key)
            else:
                missed.append(key)

        # 3) the rest, by text (the page can still be rendering these: three patient attempts)
        for key, text in BY_TEXT.items():
            if key in done:
                continue
            for attempt in range(3):
                h = pg.get_by_text(text, exact=False).first
                try:
                    h.wait_for(state="attached", timeout=6000)
                except Exception:
                    pg.wait_for_timeout(2500); continue
                box = h.locator("xpath=ancestor-or-self::*[contains(@class,'hw-panel') or contains(@class,'hw-recess')][1]")
                if box.count():
                    box.first.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
                    save(box.first.screenshot(), key); done.append(key)
                    break
                pg.wait_for_timeout(2500)
            else:
                missed.append(key)
        b.close()

    done = sorted(set(done))
    (ROOT / "lib" / "moduleShots.ts").write_text(
        "// Generated by scripts/capture-modules.py: modules that have a real capture in public/module-thumbs/.\n"
        f"export const MODULE_SHOTS: string[] = {json.dumps(done)};\n\n"
        "export function hasShot(key: string): boolean {\n  return MODULE_SHOTS.includes(key);\n}\n",
        encoding="utf-8",
    )
    print(f"captured {len(done)}: {done}")
    print(f"missed {len(set(missed) - set(done))}: {sorted(set(missed) - set(done))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
