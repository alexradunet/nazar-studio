#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Stage 1 of the character rig (one-time, network): turn the reference-locked AI
feature sheets into clean, aligned part layers saved under
assets/avatars/layers/parts/. Stage 2 (compose_character.py) reads these.

Outputs:
  parts/head-base.png        neutral bald reference (diff base for extraction)
  parts/head-<kind>.png      9-frame 768 expression sheet per head kind (skin-tintable)
  parts/hair-NN.png          9 transparent hair layers (aligned to the rig)
  parts/beard-NN.png         9 transparent beard layers (aligned to the rig)
"""
import os, urllib.request
from io import BytesIO
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AUTH = os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
BASE = "https://hyperagent.com/api/files/usergenerated/threads/cmq10i8dd0akp0cad765k8oji/images/{uuid}.png"
PARTS = os.path.join(os.path.dirname(__file__), "..", "assets", "avatars", "layers", "parts")
F = 256

# reference-locked source sheets
HEAD_SHEETS = {           # kind -> expressions sheet uuid (9 cells)
    "male":   "167823b6-3957-4511-b41f-5556943449ea",
    "female": "699f7cc1-6ef4-465f-a3b5-4709cdb8b746",
    "alien":  "4e7278ba-9b79-42d6-aeac-f6e753e3829a",
}
HAIR_SHEET = "968e7194-6f10-49da-bcf4-c0e30d1d6d48"
BEARD_SHEET = "90b51bc7-e395-4069-a481-27fa7b212f74"
BASE_HEAD = "93eb58f4-4983-48dc-86ec-5516c2e4ca18"

def fetch(uuid):
    req = urllib.request.Request(BASE.format(uuid=uuid), headers={"Authorization": f"Bearer {AUTH}", "User-Agent": "Mozilla/5.0"})
    return Image.open(BytesIO(urllib.request.urlopen(req, timeout=90).read())).convert("RGB")

def is_bg(px):
    return (px[0] * px[0] + px[1] * px[1] + px[2] * px[2]) ** 0.5 < 70

def key(rgb):
    """Flood-fill the dark background to alpha, seeding only from true bg (never skin)."""
    w, h = rgb.size; work = rgb.copy(); S = (255, 0, 255); pts = []
    for t in (0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999):
        x = min(w-1, int(w*t)); y = min(h-1, int(h*t)); pts += [(x,0),(x,h-1),(0,y),(w-1,y)]
    for sx, sy in pts:
        px = work.getpixel((sx, sy))
        if px != S and is_bg(px):
            try: ImageDraw.floodfill(work, (sx, sy), S, thresh=55)
            except Exception: pass
    m = np.all(np.array(work) == np.array(S), axis=-1)
    a = np.array(rgb.convert("RGBA")); a[m, 3] = 0
    return Image.fromarray(a)

def fit256(im):
    """Crop to the subject and scale it to fill the 256 frame, bottom-anchored."""
    a = np.array(im); ys, xs = np.where(a[..., 3] > 20)
    im = im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))
    s = (F-4) / max(im.width, im.height)
    nw, nh = max(1, int(im.width*s)), max(1, int(im.height*s))
    im = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (F, F), (0,0,0,0)); out.paste(im, ((F-nw)//2, F-nh), im)
    return out

def cells(uuid):
    sh = fetch(uuid); W, H = sh.size
    return [fit256(key(sh.crop((round(c*W/3), round(r*H/3), round((c+1)*W/3), round((r+1)*H/3)))))
            for r in range(3) for c in range(3)]

def feather(mask_img, blur=1.2):
    """Clean speckle (erode+dilate) then soften edges for seamless compositing."""
    al = mask_img.split()[3]
    al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(blur))
    out = mask_img.copy(); out.putalpha(al)
    return out

YY, XX = np.mgrid[0:F, 0:F]

def extract_feature(cell_img, base_arr, region, diff_thresh=58):
    c = np.array(cell_img).astype(int)
    co = c[..., 3] > 40
    bo = base_arr[..., 3] > 40
    cdiff = np.sqrt(((c[..., :3] - base_arr[..., :3]) ** 2).sum(-1))
    feat = co & region & ((~bo) | (cdiff > diff_thresh))
    out = np.zeros((F, F, 4), np.uint8)
    out[feat] = np.array(cell_img)[feat]
    return feather(Image.fromarray(out))

def main():
    os.makedirs(PARTS, exist_ok=True)
    # neutral bald reference (diff base)
    base = fit256(key(fetch(BASE_HEAD)))
    base.save(os.path.join(PARTS, "head-base.png"))
    base_arr = np.array(base).astype(int)

    # head expression sheets (9-frame 768, skin-tintable)
    for kind, uuid in HEAD_SHEETS.items():
        frames = cells(uuid)
        sheet = Image.new("RGBA", (F*3, F*3), (0,0,0,0))
        for i, fr in enumerate(frames):
            sheet.paste(fr, ((i % 3) * F, (i // 3) * F), fr)
        sheet.save(os.path.join(PARTS, f"head-{kind}.png"))
        print(f"  head-{kind}.png (9-frame)")

    # hair (upper region) and beard (lower region)
    hair_region = YY < 158
    beard_region = YY > 150
    for k, cell in enumerate(cells(HAIR_SHEET), 1):
        extract_feature(cell, base_arr, hair_region, diff_thresh=52).save(os.path.join(PARTS, f"hair-{k:02d}.png"))
    print("  hair-01..09.png")
    for k, cell in enumerate(cells(BEARD_SHEET), 1):
        extract_feature(cell, base_arr, beard_region, diff_thresh=46).save(os.path.join(PARTS, f"beard-{k:02d}.png"))
    print("  beard-01..09.png")
    print("done")

if __name__ == "__main__":
    main()
