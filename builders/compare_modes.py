#!/usr/bin/env python3
"""Fidelity ladder: half-block (1x2) vs sextant (2x3) vs octant (2x4), all at 27x13
cells, 2 colours/cell. Rasterised exactly as the terminal would fill each cell."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ansi_render import over, FIELD
W=256; COLS=27; ROWS=13; CW=14; CH=28  # equal tile size across modes
WV=np.array([0.299,0.587,0.114])
def quant(comp, scx, scy):
    subW, subH = COLS*scx, ROWS*scy
    a=np.array(comp.resize((subW,subH), Image.LANCZOS)).astype(float)
    for cy in range(0,subH,scy):
        for cx in range(0,subW,scx):
            blk=a[cy:cy+scy,cx:cx+scx].reshape(-1,3); lum=blk@WV
            mn,mx=lum.min(),lum.max()
            if mx-mn<8: continue
            thr=(mn+mx)/2; A=blk[lum<=thr]; B=blk[lum>thr]
            ca=A.mean(0) if len(A) else B.mean(0); cb=B.mean(0) if len(B) else A.mean(0)
            for j in range(blk.shape[0]): a[cy+j//scx,cx+j%scx]= ca if lum[j]<=thr else cb
    return Image.fromarray(a.astype(np.uint8)).resize((COLS*CW,ROWS*CH), Image.NEAREST)
def frame0(path):
    im=Image.open(path).convert("RGBA")
    if im.width>=512: im=im.crop((0,0,W,W))
    return over(im)
MODES=[("half-block 1x2",1,2),("sextant 2x3",2,3),("octant 2x4",2,4)]
SUBJ=[("Nazar eye","/agent/workspace/nazar_eye_sheet.png"),
      ("Seeker soul","/agent/workspace/soul_A_sheet.png"),
      ("code </>","/agent/workspace/noorb/eye-code.png"),
      ("search","/agent/workspace/noorb/eye-search.png")]
def font(s):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",s)
    except Exception: return ImageFont.load_default()
pad=16; lblh=22; tw=COLS*CW; th=ROWS*CH
Wt=pad+len(MODES)*(tw+pad); Ht=44+len(SUBJ)*(th+lblh+pad)
out=Image.new("RGB",(Wt,Ht),(8,9,12)); d=ImageDraw.Draw(out)
d.text((pad,12),"FIDELITY LADDER @ 27x13 — half-block vs sextant vs OCTANT (2 colours/cell)",fill=(150,235,205),font=font(18))
for mi,(mn,_,_) in enumerate(MODES):
    d.text((pad+mi*(tw+pad),40),mn,fill=(255,210,150),font=font(15))
for si,(sn,path) in enumerate(SUBJ):
    comp=frame0(path); y=64+si*(th+lblh+pad)
    d.text((4,y+th//2),sn,fill=(190,215,230),font=font(13))
    for mi,(mn,scx,scy) in enumerate(MODES):
        out.paste(quant(comp,scx,scy),(pad+mi*(tw+pad),y))
out.save("/agent/workspace/modes_compare.png"); print("saved",out.size)
