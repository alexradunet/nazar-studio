#!/usr/bin/env python3
"""Build 30 NEW tool sprites (coding / life-mgmt / calls / apps) in the locked Style-A
icon-in-orb family: colored icon keyed off its flat dark bg, composited into its
domain-colored crystal orb (+ glow underlay), glow-pulse animated (9-frame cross-fade),
saved as 768x768 3x3 sheets -> assets/avatars/tools/eye-<name>.png. Clone of build_tools.py."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
ORBS="/agent/workspace/nazar-studio/assets/avatars/orbs"
TOOLS="/agent/workspace/nazar-studio/assets/avatars/tools"
ICONS="/agent/workspace/icons"
FRAME=256
# 30 NEW tools: eye-name -> (icon file in ICONS/, orb color)
MAP={
 # CODING / ENGINEERING (10)
 "git":("git","indigo"),"merge":("merge","indigo"),"database":("database","slate"),
 "cloud":("cloud","indigo"),"container":("container","slate"),"bug":("bug","red"),
 "api":("api","teal"),"code":("code","teal"),"lock":("lock","slate"),"package":("package","gold"),
 # LIFE-MANAGEMENT (8)
 "tasks":("tasks","teal"),"habit":("habit","green"),"weight":("weight","teal"),
 "water":("water","indigo"),"meds":("meds","red"),"mood":("mood","violet"),
 "goal":("goal","ember"),"cart":("cart","gold"),
 # CALLS / COMMUNICATION (6)
 "phone":("phone","teal"),"video":("video","indigo"),"chat":("chat","teal"),
 "contacts":("contacts","indigo"),"mic":("mic","violet"),"bell":("bell","gold"),
 # APPS / INTEGRATIONS (6)
 "share":("share","indigo"),"drive":("drive","indigo"),"card":("card","gold"),
 "map":("map","green"),"media":("media","violet"),"docs":("docs","teal"),
}
def key_icon(p):
    rgb=Image.open(p).convert("RGB"); w,h=rgb.size; work=rgb.copy(); S=(255,0,255); pts=[]
    for t in (0.0,0.2,0.4,0.6,0.8,0.999):
        x=min(w-1,int(w*t)); y=min(h-1,int(h*t)); pts+=[(x,0),(x,h-1),(0,y),(w-1,y)]
    for sx,sy in pts:
        if work.getpixel((sx,sy))==S: continue
        try: ImageDraw.floodfill(work,(sx,sy),S,thresh=70)
        except Exception: pass
    a=np.array(work); m=np.all(a==np.array(S),axis=-1); r=np.array(rgb.convert("RGBA")); r[m,3]=0
    k=Image.fromarray(r); arr=np.array(k); ys,xs=np.where(arr[...,3]>40)
    return k.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
_orb={}
def orb(c):
    if c not in _orb: _orb[c]=Image.open(f"{ORBS}/orb-{c}.png").convert("RGBA")
    return _orb[c].copy()
def compose(color, icon, glow_scale, bright, frac=0.45):
    o=orb(color); W=o.width
    if icon is None:
        return ImageEnhance.Brightness(o).enhance(bright)
    ic=key_icon(f"{ICONS}/{icon}.png"); s=W*frac/max(ic.size)
    ic=ic.resize((max(1,round(ic.width*s)),max(1,round(ic.height*s))),Image.LANCZOS)
    if bright!=1.0: ic=ImageEnhance.Brightness(ic).enhance(bright)
    layer=Image.new("RGBA",o.size,(0,0,0,0)); layer.alpha_composite(ic,((W-ic.width)//2,(W-ic.height)//2))
    glow=layer.filter(ImageFilter.GaussianBlur(int(W*0.035)))
    ga=np.array(glow).astype(float); ga[...,3]=np.clip(ga[...,3]*glow_scale,0,255); glow=Image.fromarray(ga.astype(np.uint8))
    return Image.alpha_composite(Image.alpha_composite(o,glow),layer)
def frames(color, icon):
    base=compose(color,icon,1.0,1.0); bright=compose(color,icon,2.4,1.18)
    A=np.array(base.resize((FRAME,FRAME),Image.LANCZOS)).astype(float)
    B=np.array(bright.resize((FRAME,FRAME),Image.LANCZOS)).astype(float)
    seq=[0,0.3,0.6,0.85,1.0,0.85,0.6,0.3,0.0]
    return [Image.fromarray((A*(1-t)+B*t).astype(np.uint8)) for t in seq]
def save_sheet(name, frs):
    sh=Image.new("RGBA",(FRAME*3,FRAME*3),(0,0,0,0))
    for i,fr in enumerate(frs): sh.paste(fr,((i%3)*FRAME,(i//3)*FRAME),fr)
    sh.save(f"{TOOLS}/eye-{name}.png")
allnames=[]
for name,(icon,color) in MAP.items():
    save_sheet(name, frames(color,icon)); allnames.append(name)
print("wrote", len(allnames), "NEW tool sheets")
# QA contact (frame0 of each new tool)
field=(16,34,31); cell=150; cols=6; rows=(len(allnames)+cols-1)//cols
m=Image.new("RGB",(cell*cols+6*(cols+1),(cell+18)*rows+6),(12,14,16)); d=ImageDraw.Draw(m)
for i,n in enumerate(allnames):
    sh=Image.open(f"{TOOLS}/eye-{n}.png").convert("RGBA"); fr=sh.crop((0,0,FRAME,FRAME))
    t=Image.alpha_composite(Image.new("RGBA",(FRAME,FRAME),field+(255,)),fr).convert("RGB").resize((cell,cell))
    x=6+(i%cols)*(cell+6); y=18+(i//cols)*(cell+18); m.paste(t,(x,y)); d.text((x+2,y-11),n,fill=(160,225,200))
m.save("/agent/workspace/tools_new30_contact.png"); print("contact saved")
