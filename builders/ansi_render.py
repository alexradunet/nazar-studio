#!/usr/bin/env python3
"""Reusable faithful Chafa-style renderers (half-block 1x2 + sextant 2x3, TRUECOLOR)
plus frame-fill normalization. Used to QA no-orb masters at terminal cell sizes."""
import numpy as np
from PIL import Image
FIELD=(15,17,23)
_WV=np.array([0.299,0.587,0.114])

def normalize(img, frac=0.92, canvas=256):
    """Crop to alpha content and rescale to fill ~frac of a square canvas (no orb -> glyph fills the cell budget)."""
    img=img.convert("RGBA"); a=np.array(img); ys,xs=np.where(a[...,3]>16)
    if len(xs)==0: return img
    x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
    crop=img.crop((x0,y0,x1+1,y1+1)); w,h=crop.size
    s=frac*canvas/max(w,h); nw,nh=max(1,round(w*s)),max(1,round(h*s))
    crop=crop.resize((nw,nh),Image.LANCZOS)
    out=Image.new("RGBA",(canvas,canvas),(0,0,0,0)); out.alpha_composite(crop,((canvas-nw)//2,(canvas-nh)//2)); return out

def over(img, field=FIELD):
    img=img.convert("RGBA"); bg=Image.new("RGBA",img.size,tuple(field)+(255,))
    return Image.alpha_composite(bg,img).convert("RGB")

def half_small(comp, rows):
    cols=2*rows; return comp.resize((cols,2*rows), Image.LANCZOS)

def sext_small(comp, rows):
    cols=2*rows; sm=comp.resize((2*cols,3*rows), Image.LANCZOS)
    a=np.array(sm).astype(float); H,Wd=a.shape[0],a.shape[1]; out=a.copy()
    for cy in range(0,H,3):
        for cx in range(0,Wd,2):
            blk=a[cy:cy+3,cx:cx+2].reshape(-1,3); lum=blk@_WV
            mn,mx=lum.min(),lum.max()
            if mx-mn<2.0: continue
            thr=(mn+mx)/2; A=blk[lum<=thr]; B=blk[lum>thr]
            ca=A.mean(0) if len(A) else B.mean(0); cb=B.mean(0) if len(B) else A.mean(0)
            for j in range(blk.shape[0]):
                out[cy+j//2,cx+j%2]= ca if lum[j]<=thr else cb
    return Image.fromarray(out.astype(np.uint8))

def tile(master, rows, mode="sext", field=FIELD, px=26, do_norm=True):
    m=normalize(master) if do_norm else master.convert("RGBA")
    comp=over(m,field); sm=half_small(comp,rows) if mode=="half" else sext_small(comp,rows)
    return sm.resize((px*rows,px*rows), Image.NEAREST)
