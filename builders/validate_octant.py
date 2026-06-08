#!/usr/bin/env python3
"""Parse the ANSI produced by the real TS renderMosaic and rasterise it back to an
image (inverting the same glyph maps) — proves the encoder + octant mapping work."""
import re
from PIL import Image, ImageDraw, ImageFont
# rebuild the exact glyph tables from sextant.ts
def sextant_inv():
    special={0:' ',21:'▌',42:'▐',63:'█'}; tbl=[]; n=0
    for p in range(64):
        if p in special: tbl.append(special[p])
        else: tbl.append(chr(0x1FB00+n)); n+=1
    return {g:p for p,g in enumerate(tbl)}, 2, 3
QUAD=[" ","▘","▝","▀","▖","▌","▞","▛","▗","▚","▐","▜","▄","▙","▟","█"]
def octant_inv():
    tbl=[]; n=0
    for v in range(256):
        b=lambda k:(v>>k)&1
        rep=b(0)==b(2) and b(1)==b(3) and b(4)==b(6) and b(5)==b(7)
        if rep:
            q=b(0)|(b(1)<<1)|(b(4)<<2)|(b(5)<<3); tbl.append(QUAD[q])
        else: tbl.append(chr(0x1CD00+n)); n+=1
    return {g:v for v,g in enumerate(tbl)}, 2, 4
CELL=re.compile("\x1b\\[38;2;(\\d+);(\\d+);(\\d+);48;2;(\\d+);(\\d+);(\\d+)m(.)", re.DOTALL)
def raster(path, inv, sc, sr, sp=9):
    inv_map,_,_=inv
    lines=open(path,encoding="utf-8").read().split("\n")
    cols=len(CELL.findall(lines[0])); rows=len(lines)
    img=Image.new("RGB",(cols*sc*sp, rows*sr*sp),(0,0,0)); d=ImageDraw.Draw(img)
    for ry,line in enumerate(lines):
        for cx,m in enumerate(CELL.finditer(line)):
            fr,fg,fb,br,bg,bb,g=int(m[1]),int(m[2]),int(m[3]),int(m[4]),int(m[5]),int(m[6]),m[7]
            p=inv_map.get(g, 0 if g==' ' else (1<<(sc*sr))-1)
            for k in range(sc*sr):
                on=(p>>k)&1; col=(fr,fg,fb) if on else (br,bg,bb)
                xx=(cx*sc+(k%sc))*sp; yy=(ry*sr+(k//sc))*sp
                d.rectangle((xx,yy,xx+sp-1,yy+sp-1),fill=col)
    return img
def font(s):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",s)
    except Exception: return ImageFont.load_default()
panels=[("eye sextant","ts_eye_sextant.ansi",sextant_inv()),("eye octant","ts_eye_octant.ansi",octant_inv()),
        ("soul sextant","ts_soul_sextant.ansi",sextant_inv()),("soul octant","ts_soul_octant.ansi",octant_inv())]
imgs=[]
for label,f,inv in panels:
    _,sc,sr=inv; imgs.append((label, raster("/agent/workspace/"+f, inv, sc, sr)))
pad=14; lblh=20; cw=max(i.width for _,i in imgs); ch=max(i.height for _,i in imgs)
W=pad+2*(cw+pad); H=30+2*(ch+lblh+pad)
out=Image.new("RGB",(W,H),(8,9,12)); d=ImageDraw.Draw(out)
d.text((pad,8),"TS renderMosaic output, rasterised back (sextant vs octant) @ 27x13",fill=(150,235,205),font=font(16))
for i,(label,im) in enumerate(imgs):
    x=pad+(i%2)*(cw+pad); y=30+(i//2)*(ch+lblh+pad)
    out.paste(im,(x,y)); d.text((x,y+im.height+2),label,fill=(200,215,230),font=font(13))
out.save("/agent/workspace/ts_roundtrip.png"); print("saved",out.size)
