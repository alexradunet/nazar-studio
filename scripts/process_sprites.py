#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Re-process all Nazar sprite sheets at 2x quality with transparent backgrounds.

Pipeline per sheet:
  1. Download native 2048x2048 generation (authenticated)
  2. Split into 9 frames at precise 3x3 boundaries (~683px each)
  3. Flood-fill the dark #0d0d1a background from each frame's border ->
     true alpha transparency. Connectivity preserves interior dark pixels
     (eye pupils, globe shadows) that are NOT connected to the border.
  4. Downscale each masked frame to 170x170 (LANCZOS) so the binary mask
     becomes a smooth anti-aliased alpha edge.
  5. Reassemble into a 512x512 RGBA sheet (3x3 grid, 170px stride).

Run:
  python3 process_sprites.py --test   # process only nazar, write previews
  python3 process_sprites.py          # process all 42 sheets
"""
import os
import sys
import urllib.request
from io import BytesIO
from PIL import Image, ImageDraw
import numpy as np

AUTH = os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
BASE = "https://hyperagent.com/api/files/usergenerated/threads/cmq10i8dd0akp0cad765k8oji/images/{uuid}.png"
ROOT = "/agent/workspace/nazar-studio/assets/avatars"
TOOLS = f"{ROOT}/tools"

FRAME_PX = 170          # per-frame size in the output sheet
SHEET_PX = 512          # total sheet size (3*170 = 510, +2px transparent margin)
BG_COLOR = (13, 13, 26) # #0d0d1a
FLOOD_THRESH = 60       # tolerance for border flood-fill

# name -> (uuid, destination_path)
CHARACTERS = {
    "nazar":           ("0f66f8fe-c552-4133-a355-4cff1dd592b0", f"{ROOT}/nazar.png"),
    "mage-alien":      ("70293370-9137-40af-85e5-e54f17957b73", f"{ROOT}/mage-alien.png"),
}
TOOLS_MAP = {
    "anvil":     ("ecf5573b-0cdf-44e7-91d1-3a5ff925a0f6", f"{TOOLS}/anvil.png"),
    "scroll":    ("cbe62e41-11b7-4097-afdc-5c8a7f1481d5", f"{TOOLS}/scroll.png"),
    "quill":     ("21312446-326b-4a63-b219-4b1075df5bfb", f"{TOOLS}/quill.png"),
    "needle":    ("fd6a9abc-efcf-4eee-b225-8fe208310e75", f"{TOOLS}/needle.png"),
    "lens":      ("ffb4fd97-46fe-48c3-ad62-1e34f949a7e0", f"{TOOLS}/lens.png"),
    "folder":    ("74f3a36f-b08b-4dbc-b20f-80faea31ee4f", f"{TOOLS}/folder.png"),
    "keeper":    ("946fd717-305a-4639-8472-6e4255b5ad5a", f"{TOOLS}/keeper.png"),
    "warden":    ("eb5c2acc-dd0c-469e-ac29-b5be3a300b09", f"{TOOLS}/warden.png"),
    "new-head":  ("79903401-0375-4607-951b-951aca456d03", f"{TOOLS}/new-head.png"),
    "seer":      ("55a60ff6-eddb-4eb3-ade0-ebdc50da9f7c", f"{TOOLS}/seer.png"),
    "hammer":    ("97a307f9-7a32-4611-937b-5fd5456e4b68", f"{TOOLS}/hammer.png"),
    "journal":     ("15f8eae3-97d5-4135-8c2b-ebf93f415705", f"{TOOLS}/journal.png"),
    "dumbbell":    ("8a463d78-fd69-4cee-9abd-7b5fdc632ab0", f"{TOOLS}/dumbbell.png"),
    "plate-fork":  ("cc6119a7-bf24-4e2e-bccd-d88ba7b5adff", f"{TOOLS}/plate-fork.png"),
    "heart-pulse": ("7960a35a-03e3-4d43-a788-57f93a848623", f"{TOOLS}/heart-pulse.png"),
    "moon-stars":  ("8e94c309-5959-4e1b-a7c1-2534e19dfc65", f"{TOOLS}/moon-stars.png"),
    "calendar":    ("e97c68f4-eadd-4f33-937a-754281ca715d", f"{TOOLS}/calendar.png"),
    "envelope":    ("30725c58-fd13-4cac-88c4-275f15078400", f"{TOOLS}/envelope.png"),
    "map-pin":     ("de028d08-3d63-46be-8585-ee43b285bcdc", f"{TOOLS}/map-pin.png"),
    "coin-stack":  ("b927d575-55ec-4ed0-a83e-4eba4ecaf44c", f"{TOOLS}/coin-stack.png"),
    "music-note":  ("2602a1d0-46bf-424c-b31b-97b9ee08a6c9", f"{TOOLS}/music-note.png"),
    "camera":      ("a6a7963c-664c-4025-b214-f5cffe0be4b5", f"{TOOLS}/camera.png"),
    "pill-potion": ("d8c50439-4c67-48d9-8e4d-afa3af0a47b7", f"{TOOLS}/pill-potion.png"),
    "brain":       ("47e61088-0ab3-42c9-a7bf-c242157781b1", f"{TOOLS}/brain.png"),
    "compass":     ("966cc02c-f52c-4c4a-b2c7-bfd2e7ef3246", f"{TOOLS}/compass.png"),
    "seedling":    ("871544cb-234a-423b-9753-86b9d58bf874", f"{TOOLS}/seedling.png"),
    "hourglass":   ("c15700ad-1faa-47b4-876e-23a8565842d4", f"{TOOLS}/hourglass.png"),
    "key":         ("b124a389-f8de-49e8-a8ce-74fd26c653e1", f"{TOOLS}/key.png"),
    "bell":        ("f05f27df-9b68-41d7-bced-2dde34da54a6", f"{TOOLS}/bell.png"),
    "globe-gold":   ("42fec062-23f1-4be5-bf61-7be3c58d6595", f"{TOOLS}/globe-gold.png"),
    "globe-teal":   ("f1be076d-9657-449f-bd57-782e64bf6fc9", f"{TOOLS}/globe-teal.png"),
    "globe-violet": ("54429a54-523c-4130-8d8b-e2f79f600f1b", f"{TOOLS}/globe-violet.png"),
    "globe-ember":  ("02837af5-cf30-4591-8055-878b8b43a4c7", f"{TOOLS}/globe-ember.png"),
    "globe-pearl":  ("78d8c150-2f7f-4937-a95a-6c79b02c641b", f"{TOOLS}/globe-pearl.png"),
    "globe-indigo": ("4364f677-b1ac-4f77-bd3b-a15068e2d68c", f"{TOOLS}/globe-indigo.png"),
    # icon-pack expansion — dev / engineering
    "terminal":   ("3e63e46f-dbbd-42f3-ac81-9bb88c5171c8", f"{TOOLS}/terminal.png"),
    "code":       ("ee4f1764-68a5-4444-899d-80559e52cc92", f"{TOOLS}/code.png"),
    "git-branch": ("e0b0e143-47a5-4043-8a37-71c7ce3b00ff", f"{TOOLS}/git-branch.png"),
    "git-merge":  ("7d9ee2fd-1f23-4d55-be11-800c8ffd4704", f"{TOOLS}/git-merge.png"),
    "database":   ("2a80808f-f13d-4886-a297-9f6c7c0d9ec6", f"{TOOLS}/database.png"),
    "cloud":      ("4e5869d4-ddb7-4662-ae82-b78d6af85ef1", f"{TOOLS}/cloud.png"),
    "browser":    ("b759adaa-c608-47cc-b132-84c862c2c471", f"{TOOLS}/browser.png"),
    "container":  ("2d5209dc-8884-4929-82e1-d3893c233147", f"{TOOLS}/container.png"),
    "chat":       ("4d760b1c-aac4-41cb-bac1-9129a623ea7d", f"{TOOLS}/chat.png"),
    "gamepad":    ("3291c161-0ec6-4ee9-a719-5c37688f8808", f"{TOOLS}/gamepad.png"),
    "rocket":     ("e93f81bb-5e6c-41f9-9444-9e7f83b5d632", f"{TOOLS}/rocket.png"),
    "gear":       ("2f989571-b48b-4187-9805-99b9e9c71bfe", f"{TOOLS}/gear.png"),
    # icon-pack expansion — objects / status / actions
    "lightbulb":  ("4b8358a3-a8c9-44a8-a74c-86c8f216bbb7", f"{TOOLS}/lightbulb.png"),
    "trophy":     ("d77b3bc4-3997-4d2f-9455-fb2496554599", f"{TOOLS}/trophy.png"),
    "target":     ("f4187155-bd92-4d6d-811e-6546b8354955", f"{TOOLS}/target.png"),
    "flask":      ("89ae1131-0326-4c6d-b7c0-e87a403e4134", f"{TOOLS}/flask.png"),
    "atom":       ("704bcc7e-9453-4d82-a4de-9b33bf044d52", f"{TOOLS}/atom.png"),
    "bug":        ("ba652e61-f682-4a91-a863-bab86711018d", f"{TOOLS}/bug.png"),
    "lock":       ("916e3017-82e6-4cd0-8557-201f0c7c5dec", f"{TOOLS}/lock.png"),
    "star":       ("aa8cf03e-c8dd-49e8-ae7a-84fb1d6208b2", f"{TOOLS}/star.png"),
    "flag":       ("6f530639-c50d-4eff-b5f9-d992b4ba8992", f"{TOOLS}/flag.png"),
    "gift":       ("9b0c21c2-6604-4e68-a6ee-992bc8889f86", f"{TOOLS}/gift.png"),
    "cart":       ("41961889-6358-458f-8960-218a4ce66f50", f"{TOOLS}/cart.png"),
    "paint-brush":("cd35810a-f503-4b5c-bfc0-09fd3258cf36", f"{TOOLS}/paint-brush.png"),
    "wrench":     ("dfe7435e-1588-4e7c-9b54-0767baf75264", f"{TOOLS}/wrench.png"),
    "bookmark":   ("c82eff7b-c137-4abb-b801-f6181b808966", f"{TOOLS}/bookmark.png"),
}
ALL = {**CHARACTERS, **TOOLS_MAP}

_cache = {}

def fetch(uuid):
    if uuid in _cache:
        return _cache[uuid]
    url = BASE.format(uuid=uuid)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AUTH}", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    _cache[uuid] = img
    return img

def remove_bg(frame_rgb):
    """Flood-fill the dark background from the border -> transparent alpha."""
    w, h = frame_rgb.size
    work = frame_rgb.copy()
    SENTINEL = (255, 0, 255)
    # Seed flood-fill from a ring of border points (corners + quarter/half edges)
    pts = []
    for t in (0.0, 0.25, 0.5, 0.75, 0.999):
        x = min(w - 1, int(w * t)); y = min(h - 1, int(h * t))
        pts += [(x, 0), (x, h - 1), (0, y), (w - 1, y)]
    for sx, sy in pts:
        if work.getpixel((sx, sy)) == SENTINEL:
            continue
        try:
            ImageDraw.floodfill(work, (sx, sy), SENTINEL, thresh=FLOOD_THRESH)
        except Exception:
            pass
    arr = np.array(work)
    mask = np.all(arr == np.array(SENTINEL), axis=-1)
    rgba = np.array(frame_rgb.convert("RGBA"))
    rgba[mask, 3] = 0
    return Image.fromarray(rgba, "RGBA")

def process_sheet(img):
    """Split 2048 sheet -> 9 frames, key out bg, downscale, reassemble 512 RGBA."""
    W, H = img.size
    sheet = Image.new("RGBA", (SHEET_PX, SHEET_PX), (0, 0, 0, 0))
    for i in range(9):
        col, row = i % 3, i // 3
        x0 = round(col * W / 3); x1 = round((col + 1) * W / 3)
        y0 = round(row * H / 3); y1 = round((row + 1) * H / 3)
        frame = img.crop((x0, y0, x1, y1))
        keyed = remove_bg(frame)
        small = keyed.resize((FRAME_PX, FRAME_PX), Image.LANCZOS)
        sheet.paste(small, (col * FRAME_PX, row * FRAME_PX), small)
    return sheet

def main():
    test = "--test" in sys.argv
    targets = {"nazar": ALL["nazar"]} if test else ALL
    ok = 0
    for name, (uuid, dest) in targets.items():
        try:
            img = fetch(uuid)
            sheet = process_sheet(img)
            if test:
                sheet.save("/tmp/test_nazar_512.png")
                # contact preview over magenta to spot any holes
                bgm = Image.new("RGBA", sheet.size, (255, 0, 255, 255))
                bgm.alpha_composite(sheet)
                bgm.convert("RGB").save("/tmp/test_nazar_magenta.png")
                print(f"  TEST {name}: saved /tmp/test_nazar_512.png + magenta preview")
            else:
                sheet.save(dest, "PNG", optimize=True)
                print(f"  ✓ {name}: {dest}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
    print(f"\nDone: {ok}/{len(targets)}")

if __name__ == "__main__":
    main()
