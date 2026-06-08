#!/usr/bin/env python3
"""Verify the new default: 23x11 octant. Heroes big + a tool sampler."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ansi_render import over
WV=np.array([0.299,0.587,0.114]); COLS=23; ROWS=11; SCX,SCY=2,4
def quant(comp, cw, ch):
    subW,subH=COLS*SCX,ROWS*SCY
    a=np.array(comp.resize((subW,subH),Image.LANCZOS)).astype(float)
    for cy in range(0,subH,SCY):
        for cx in range(0,subW,SCX):
            blk=a[cy:cy+SCY,cx:cx+SCX].reshape(-1,3); lum=blk@WV
            mn,mx=lum.min(),lum.max()
            if mx-mn<8: continue
            thr=(mn+mx)/2; A=blk[lum<=thr]; B=blk[lum>thr]
            ca=A.mean(0) if len(A) else B.mean(0); cb=B.mean(0) if len(B) else A.mean(0)
            for j in range(blk.shape[0]): a[cy+j//SCX,cx+j%SCX]=ca if lum[j]<=thr else cb
    return Image.fromarray(a.astype(np.uint8)).resize((COLS*cw,ROWS*ch),Image.NEAREST)
def f0(path):
    im=Image.open(path).convert("RGBA")
    if im.width>=512: im=im.crop((0,0,256,256))
    return over(im)
def font(s):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",s)
    except Exception: return ImageFont.load_default()
NO="/agent/workspace/noorb"
heroes=[("Nazar eye","/agent/workspace/nazar_eye_sheet.png"),("Seeker soul","/agent/workspace/soul_A_sheet.png")]
tools=["search","code","git","database","terminal","mail","money","mood","phone","bug","lock","calendar"]
HW,HH=20,40  # hero cell px
TW,TH=11,22  # tool cell px
hero_tiles=[(n,quant(f0(p),HW,HH)) for n,p in heroes]
tool_tiles=[(t,quant(f0(f"{NO}/eye-{t}.png"),TW,TH)) for t in tools]
htw=COLS*HW; hth=ROWS*HH; ttw=COLS*TW; tth=ROWS*TH
pad=16; lblh=18; cols_t=6
W=max(pad+len(heroes)*(htw+pad), pad+cols_t*(ttw+pad))
rows_t=(len(tools)+cols_t-1)//cols_t
H=30+ (hth+lblh+pad) + 24 + rows_t*(tth+lblh+pad)
out=Image.new("RGB",(W,H),(8,9,12)); d=ImageDraw.Draw(out)
d.text((pad,8),"DEFAULT = 23x11 OCTANT — heroes + tool sampler",fill=(150,235,205),font=font(17))
for i,(n,t) in enumerate(hero_tiles):
    x=pad+i*(htw+pad); d.text((x,30),n,fill=(255,210,150),font=font(14)); out.paste(t,(x,30+lblh))
ty0=30+lblh+hth+pad+8
d.text((pad,ty0-4),"tools",fill=(120,200,235),font=font(14))
for i,(t,im) in enumerate(tool_tiles):
    x=pad+(i%cols_t)*(ttw+pad); y=ty0+18+(i//cols_t)*(tth+lblh+pad)
    out.paste(im,(x,y)); d.text((x,y+tth+1),t,fill=(185,210,228),font=font(11))
out.save("/agent/workspace/verify_2311.png"); print("saved",out.size)
