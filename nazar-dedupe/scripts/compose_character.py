#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Compose flat character avatars from the rig part layers (extract_parts.py) and
emit the 9-frame 768x768 sheets the terminal runtime reads (assets/avatars/<name>.png).

Layer stack (back -> front):
  human avatars: background -> head(expression sheet, skin-tinted) -> beard -> hair
  Nazar (idle):  finished nazar-base (cosmic eye baked in) + a gentle pulsing eye glow
  Nazar (tools): empty socket + per-tool iris (see the tool-eye swap; eye() helper)

Run:  python3 scripts/compose_character.py            # build all avatars in MANIFEST
      python3 scripts/compose_character.py --demo      # preview grid -> /tmp
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..")
AVATARS = os.path.join(ROOT, "assets", "avatars")
PARTS = os.path.join(AVATARS, "layers", "parts")
F = 256

def _frames(path):
    sh = Image.open(path).convert("RGBA"); fs = sh.width // 3
    return [sh.crop(((i % 3) * fs, (i // 3) * fs, (i % 3 + 1) * fs, (i // 3 + 1) * fs)) for i in range(9)]
def _part(name):
    return Image.open(os.path.join(PARTS, f"{name}.png")).convert("RGBA")

def tint(img, mult):
    if mult == (1, 1, 1): return img
    a = np.array(img).astype(float)
    for i in range(3): a[..., i] = np.clip(a[..., i] * mult[i], 0, 255)
    return Image.fromarray(a.astype(np.uint8))

# --- detect the Nazar eye socket (pale glassy lens) once ---
def _socket(base_img):
    a = np.array(base_img); rgb = a[..., :3].astype(int); al = a[..., 3]
    lum = 0.2126*rgb[..., 0] + 0.7152*rgb[..., 1] + 0.0722*rgb[..., 2]
    pale = (lum > 148) & (np.abs(rgb[..., 0]-rgb[..., 2]) < 30) & (rgb[..., 2] >= rgb[..., 0]-14) & (al > 40)
    yy, xx = np.mgrid[0:F, 0:F]; central = (np.abs(xx-F/2) < F*0.30) & (yy < F*0.62) & (yy > F*0.15)
    ys, xs = np.where(pale & central)
    return int(xs.mean()), int(ys.mean()), int(0.5*max(xs.max()-xs.min(), ys.max()-ys.min()))

def _dom_color(disc):
    a = np.array(disc); sel = a[..., 3] > 120; px = a[sel][:, :3].astype(float)
    bright = px[(px.sum(1) > 180)]; px = bright if len(bright) > 20 else px
    return tuple(int(v) for v in px.mean(0)[:3]) if len(px) else (120, 160, 255)

def eye(base_img, scx, scy, srad, iris, scale=2.3, intensity=1.0):
    """Composite an iris into the Nazar eye socket with a contained colored glow.
    `intensity` (0..1) modulates the glow + iris brightness for a living pulse."""
    out = base_img.copy()
    col = _dom_color(iris); glow = Image.new("RGBA", (F, F), (0, 0, 0, 0)); dg = ImageDraw.Draw(glow)
    gr = int(srad*1.22); dg.ellipse([scx-gr, scy-gr, scx+gr, scy+gr], fill=(col[0], col[1], col[2], int(40 + 50*intensity)))
    glow = glow.filter(ImageFilter.GaussianBlur(max(2, int(srad*0.16)))); out.alpha_composite(glow)
    d = tint(iris, (0.74 + 0.26*intensity,) * 3).resize((int(srad*scale), int(srad*scale)), Image.LANCZOS)
    out.alpha_composite(d, (scx-d.size[0]//2, scy-d.size[1]//2))
    hl = Image.new("RGBA", (F, F), (0, 0, 0, 0)); dh = ImageDraw.Draw(hl)
    dh.ellipse([scx-srad*0.7, scy-srad*0.85, scx+srad*0.05, scy-srad*0.05], fill=(255, 255, 255, 55)); hl = hl.filter(ImageFilter.GaussianBlur(2))
    out.alpha_composite(hl); return out

# caches
_heads, _cache = {}, {}
def head(kind):
    if kind not in _heads: _heads[kind] = _frames(os.path.join(PARTS, f"head-{kind}.png"))
    return _heads[kind]
def part(name):
    if name not in _cache: _cache[name] = _part(name)
    return _cache[name]

def compose_human(headkind, hair=None, beard=None, skin=(1, 1, 1)):
    heads = head(headkind); hr = part(hair) if hair else None; bd = part(beard) if beard else None
    sheet = Image.new("RGBA", (F*3, F*3), (0, 0, 0, 0))
    for i in range(9):
        cv = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        cv.alpha_composite(tint(heads[i], skin))
        if bd: cv.alpha_composite(bd)
        if hr: cv.alpha_composite(hr)
        sheet.paste(cv, ((i % 3)*F, (i // 3)*F), cv)
    return sheet

def _eye_center(base_img):
    """Locate Nazar's cosmic eye (the blue glowing region) on a finished base."""
    a = np.array(base_img); rgb = a[..., :3].astype(int); al = a[..., 3]
    blue = (rgb[..., 2] > 90) & (rgb[..., 2] > rgb[..., 0] + 15) & (al > 40)
    ys, xs = np.where(blue)
    return int(xs.mean()), int(ys.mean()), int(0.5 * max(xs.max()-xs.min(), ys.max()-ys.min()))

def compose_nazar():
    """Idle Nazar: the finished base with a gentle pulsing glow on the cosmic eye."""
    base = _part("nazar-base"); ecx, ecy, er = _eye_center(base)
    sheet = Image.new("RGBA", (F*3, F*3), (0, 0, 0, 0))
    for i in range(9):
        intensity = 0.5 + 0.5 * (0.5 + 0.5 * math.cos(2 * math.pi * i / 9))  # 0.5..1 breathing
        fr = base.copy()
        glow = Image.new("RGBA", (F, F), (0, 0, 0, 0)); dg = ImageDraw.Draw(glow)
        gr = int(er * 1.15); dg.ellipse([ecx-gr, ecy-gr, ecx+gr, ecy+gr], fill=(120, 170, 255, int(28 + 42*intensity)))
        glow = glow.filter(ImageFilter.GaussianBlur(max(2, int(er*0.22))))
        fr.alpha_composite(glow)
        sheet.paste(fr, ((i % 3)*F, (i // 3)*F), fr)
    return sheet

# Each tool maps to the iris Nazar shows while running it. The tool sprite IS
# Nazar's eye displaying that tool (a pulsing coloured iris) — no more orb icons.
TOOL_IRIS = {
    # core file / code ops
    "scroll": "read", "needle": "edit", "quill": "write", "anvil": "bash",
    "lens": "grep", "folder": "files", "keeper": "memory", "warden": "health",
    "seer": "search", "new-head": "skill", "hammer": "gear",
    # domain / life
    "journal": "journal", "dumbbell": "gym", "plate-fork": "health", "heart-pulse": "health",
    "moon-stars": "time", "calendar": "calendar", "envelope": "mail", "map-pin": "browser",
    "coin-stack": "idle", "music-note": "music", "camera": "idle", "pill-potion": "health",
    "brain": "memory", "compass": "browser", "seedling": "idle", "hourglass": "time",
    "key": "idle", "bell": "idle",
    # dev / engineering
    "terminal": "terminal", "code": "write", "git-branch": "deploy", "git-merge": "deploy",
    "database": "files", "cloud": "deploy", "browser": "browser", "container": "deploy",
    "chat": "mail", "gamepad": "idle", "rocket": "rocket", "gear": "gear",
    # objects / actions
    "lightbulb": "skill", "trophy": "idle", "target": "grep", "flask": "skill",
    "atom": "skill", "bug": "edit", "lock": "idle", "star": "skill", "flag": "idle",
    "gift": "idle", "cart": "idle", "paint-brush": "write", "wrench": "gear", "bookmark": "read",
    # retired globe placeholders -> idle cosmos
    "globe-gold": "idle", "globe-teal": "idle", "globe-violet": "idle",
    "globe-ember": "idle", "globe-pearl": "idle", "globe-indigo": "idle",
}

def compose_tool_eye(iris_name):
    """A tool sprite = Nazar's eye showing the tool: the colored iris filling the
    frame with a pulsing glow + glassy highlight (9 frames pulse for the run state)."""
    iris = _part(f"iris-{iris_name}"); target = int(F * 0.84)
    disc = iris.resize((target, target), Image.LANCZOS); col = _dom_color(iris); c = F // 2
    sheet = Image.new("RGBA", (F*3, F*3), (0, 0, 0, 0))
    for i in range(9):
        intensity = 0.55 + 0.45 * (0.5 + 0.5 * math.cos(2 * math.pi * i / 9))
        fr = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        glow = Image.new("RGBA", (F, F), (0, 0, 0, 0)); dg = ImageDraw.Draw(glow)
        gr = int(target * 0.6); dg.ellipse([c-gr, c-gr, c+gr, c+gr], fill=(col[0], col[1], col[2], int(24 + 44*intensity)))
        glow = glow.filter(ImageFilter.GaussianBlur(int(target * 0.1))); fr.alpha_composite(glow)
        fr.alpha_composite(tint(disc, (0.8 + 0.2*intensity,) * 3), (c-target//2, c-target//2))
        hl = Image.new("RGBA", (F, F), (0, 0, 0, 0)); dh = ImageDraw.Draw(hl)
        dh.ellipse([c-target*0.34, c-target*0.40, c+target*0.02, c-target*0.02], fill=(255, 255, 255, 55)); hl = hl.filter(ImageFilter.GaussianBlur(2))
        fr.alpha_composite(hl)
        sheet.paste(fr, ((i % 3)*F, (i // 3)*F), fr)
    return sheet

# out name -> recipe  (human variants share the rig; nazar is the eye base)
HUMAN = {
    "mage":        ("male",   "hair-01", "beard-02", (1, 1, 1)),
    "mage-brown":  ("male",   "hair-03", "beard-04", (1, 1, 1)),
    "mage-black":  ("male",   "hair-04", "beard-04", (0.97, 0.94, 0.9)),
    "mage-elder":  ("male",   "hair-09", "beard-07", (1.02, 1.0, 0.98)),
    "mage-female": ("female", "hair-09", None, (1, 1, 1)),
    "mage-blonde": ("female", "hair-06", None, (1, 1, 1)),
    "mage-alien":  ("alien",  None, None, (1, 1, 1)),
}

def build_all():
    for name, (hk, hair, beard, skin) in HUMAN.items():
        compose_human(hk, hair, beard, skin).save(os.path.join(AVATARS, f"{name}.png"), "PNG", optimize=True)
        print(f"  composed {name}.png")
    compose_nazar().save(os.path.join(AVATARS, "nazar.png"), "PNG", optimize=True)
    print("  composed nazar.png (idle cosmic eye)")
    tools_dir = os.path.join(AVATARS, "tools")
    eyes = sorted(set(TOOL_IRIS.values()))
    for iris in eyes:
        compose_tool_eye(iris).save(os.path.join(tools_dir, f"eye-{iris}.png"), "PNG", optimize=True)
    print(f"  composed {len(eyes)} shared eye sprites (eye-*.png)")

def demo():
    items = [("mage", compose_human("male", "hair-01", "beard-02")),
             ("mage-female", compose_human("female", "hair-09", None)),
             ("nazar", compose_nazar())]
    cell = 220; grid = Image.new("RGB", (3*cell, cell+22), (30, 32, 44)); d = ImageDraw.Draw(grid)
    for i, (n, sh) in enumerate(items):
        fr = sh.crop((0, 0, F, F)); mg = Image.new("RGBA", (F, F), (255, 0, 255, 255)); mg.alpha_composite(fr)
        grid.paste(mg.convert("RGB").resize((cell, cell), Image.LANCZOS), (i*cell, 22)); d.text((i*cell+6, 6), n, fill=(235, 235, 225))
    grid.save("/tmp/character_integrate.png"); print("demo -> /tmp/character_integrate.png")

if __name__ == "__main__":
    (demo if "--demo" in sys.argv else build_all)()
