#!/usr/bin/env python3
"""Size ladder: eye / soul / code at 9, 11, 13 rows, sextant vs octant, shown at
true relative footprint (constant px per cell) so we can judge the detail tradeoff."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ansi_render import over
WV=np.array([0.299,0.587,0.114]); CW=12; CH=24
def cols_for(rows): return 2*rows+1   # matches avatarColumns(rows) at ~2.0 cell aspect
def quant(comp, cols, rows, scx, scy):
    subW, subH = cols*scx, rows*scy
    a=np.array(comp.resize((subW,subH), Image.LANCZOS)).astype(float)
    for cy in range(0,subH,scy):
        for cx in range(0,subW,scx):
            blk=a[cy:cy+scy,cx:cx+scx].reshape(-1,3); lum=blk@WV
            mn,mx=lum.min(),lum.max()
            if mx-mn<8: continue
            thr=(mn+mx)/2; A=blk[lum<=thr]; B=blk[lum>thr]
            ca=A.mean(0) if len(A) else B.mean(0); cb=B.mean(0) if len(B) else A.mean(0)
            for j in range(blk.shape[0]): a[cy+j//scx,cx+j%scx]= ca if lum[j]<=thr else cb
    return Image.fromarray(a.astype(np.uint8)).resize((cols*CW,rows*CH), Image.NEAREST)
def frame0(path):
    im=Image.open(path).convert("RGBA")
    if im.width>=512: im=im.crop((0,0,256,256))
    return over(im)
SUBJ=[("Nazar eye","/agent/workspace/nazar_eye_sheet.png"),
      ("Seeker soul","/agent/workspace/soul_A_sheet.png"),
      ("code </>","/agent/workspace/noorb/eye-code.png")]
SIZES=[9,11,13]; MODES=[("sextant",2,3),("octant",2,4)]
def font(s):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",s)
    except Exception: return ImageFont.load_default()
boxW=cols_for(13)*CW; boxH=13*CH; pad=16; lblh=18; mlbl=70
secW=mlbl+pad+len(SIZES)*(boxW+pad)
secH=24+len(MODES)*(boxH+lblh+pad)
W=secW; H=20+len(SUBJ)*(secH+pad)
out=Image.new("RGB",(W,H),(8,9,12)); d=ImageDraw.Draw(out)
d.text((pad,4),"SIZE x MODE — where does detail hold? (true relative footprint)",fill=(150,235,205),font=font(16))
for si,(sn,path) in enumerate(SUBJ):
    comp=frame0(path); sy0=22+si*(secH+pad)
    d.text((pad,sy0),sn,fill=(255,210,150),font=font(15))
    for mi,(mn,scx,scy) in enumerate(MODES):
        ry=sy0+24+mi*(boxH+lblh+pad)
        d.text((4,ry+boxH//2),mn,fill=(120,200,235),font=font(13))
        for zi,rows in enumerate(SIZES):
            cols=cols_for(rows); t=quant(comp,cols,rows,scx,scy)
            x=mlbl+pad+zi*(boxW+pad)
            out.paste(t,(x,ry))  # top-left aligned -> smaller sizes visibly smaller
            d.text((x,ry+boxH+1),f"{cols}x{rows}",fill=(185,210,228),font=font(12))
out.save("/agent/workspace/size_ladder.png"); print("saved",out.size)
