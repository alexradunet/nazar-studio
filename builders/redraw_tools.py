#!/usr/bin/env python3
"""Build no-orb tool masters for all 57 eye-kinds: most are keyed+normalized from the
existing isolated icons; calendar/time/idle/container/bug/api are redrawn as clean bold
vector glyphs. Each becomes a 9-frame glow-pulse 768x768 sheet -> /agent/workspace/noorb/."""
import math, numpy as np, os
from PIL import Image, ImageDraw, ImageChops, ImageEnhance, ImageFilter, ImageFont
from ansi_render import normalize, tile
ICONS="/agent/workspace/icons"; OUT="/agent/workspace/noorb"; os.makedirs(OUT,exist_ok=True)
W=256; KEY=768
# eyekind -> source icon  (None => redrawn vector below)
MAP={
 "read":"book","write":"quill","edit":"pencil","search":"lens","bash":"term","files":"folder",
 "grep":"lens","browser":"browser","deploy":"rocket","memory":"brain","skill":"gem","health":"heart",
 "journal":"journal","gym":"dumbbell","mail":"mail","music":"music","terminal":"term","rocket":"rocket",
 "gear":"gear","money":"coins","sports":"runner","diet":"plate","sleep":"moon","mind":"lotus",
 "git":"git","merge":"merge","database":"database","cloud":"cloud","code":"code","lock":"lock",
 "package":"package","tasks":"tasks","habit":"habit","weight":"weight","water":"water","meds":"meds",
 "mood":"mood","goal":"goal","cart":"cart","phone":"phone","video":"video","chat":"chat",
 "contacts":"contacts","mic":"mic","bell":"bell","share":"share","drive":"drive","card":"card",
 "map":"map","media":"media","docs":"docs",
 "calendar":None,"time":None,"idle":None,"container":None,"bug":None,"api":None,
}
def key_dark(im, thr=60):
    rgb=im.convert("RGB").resize((KEY,KEY),Image.LANCZOS); w,h=rgb.size; work=rgb.copy(); S=(255,0,255); pts=[]
    for t in (0.0,0.12,0.25,0.5,0.75,0.88,0.999):
        x=min(w-1,int(w*t)); y=min(h-1,int(h*t)); pts+=[(x,0),(x,h-1),(0,y),(w-1,y)]
    for sx,sy in pts:
        if work.getpixel((sx,sy))==S: continue
        try: ImageDraw.floodfill(work,(sx,sy),S,thresh=thr)
        except Exception: pass
    a=np.array(work); m=np.all(a==np.array(S),axis=-1); r=np.array(rgb.convert("RGBA")); r[m,3]=0
    return Image.fromarray(r)
# ---- vector redraws (256, transparent, fill frame) ----
def v_calendar():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im)
    x0,y0,x1,y1=44,60,212,210
    d.rounded_rectangle((x0,y0,x1,y1),12,fill=(226,232,240,255),outline=(40,52,70,255),width=6)
    d.rectangle((x0,y0,x1,y0+34),fill=(70,96,140,255)); d.rounded_rectangle((x0,y0,x1,y0+40),12,outline=(40,52,70,255),width=6)
    d.line((84,48,84,76),fill=(40,52,70,255),width=9); d.line((172,48,172,76),fill=(40,52,70,255),width=9)
    for gy in (118,156):
        for gx in (72,108,144,180): d.ellipse((gx-7,gy-7,gx+7,gy+7),fill=(90,110,140,255))
    d.ellipse((108-7,194-7,108+7,194+7),fill=(210,90,70,255)); d.ellipse((144-7,194-7,144+7,194+7),fill=(90,110,140,255))
    return im
def v_time():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im); cx=cy=128
    d.ellipse((cx-86,cy-86,cx+86,cy+86),fill=(216,224,236,255),outline=(44,56,76,255),width=8)
    for a in range(0,360,30):
        r1,r2=72,82; x1=cx+r1*math.cos(math.radians(a)); y1=cy+r1*math.sin(math.radians(a))
        x2=cx+r2*math.cos(math.radians(a)); y2=cy+r2*math.sin(math.radians(a)); d.line((x1,y1,x2,y2),fill=(80,100,130,255),width=5)
    d.line((cx,cy,cx,cy-54),fill=(44,56,76,255),width=9); d.line((cx,cy,cx+40,cy+14),fill=(70,96,140,255),width=7)
    d.ellipse((cx-9,cy-9,cx+9,cy+9),fill=(210,90,70,255))
    return im
def v_idle():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im); cx=cy=128
    pts=[(cx,cy-92),(cx+22,cy-22),(cx+92,cy),(cx+22,cy+22),(cx,cy+92),(cx-22,cy+22),(cx-92,cy),(cx-22,cy-22)]
    d.polygon(pts,fill=(70,210,200,255));
    inner=[(cx,cy-46),(cx+12,cy-12),(cx+46,cy),(cx+12,cy+12),(cx,cy+46),(cx-12,cy+12),(cx-46,cy),(cx-12,cy-12)]
    d.polygon(inner,fill=(200,250,245,255))
    for sx,sy,r in [(196,70,9),(64,188,7),(206,200,6)]:
        d.polygon([(sx,sy-r),(sx+r//2,sy),(sx,sy+r),(sx-r//2,sy)],fill=(150,235,225,255))
    return im
def v_container():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im)
    x0,y0,x1,y1=42,78,214,186
    d.rounded_rectangle((x0,y0,x1,y1),8,fill=(74,118,126,255),outline=(22,40,44,255),width=7)
    for gx in range(x0+20,x1-10,22): d.line((gx,y0+6,gx,y1-6),fill=(40,74,80,255),width=6)
    d.rectangle((x0,y0,x1,y0+22),fill=(96,150,158,255)); d.rounded_rectangle((x0,y0,x1,y1),8,outline=(22,40,44,255),width=7)
    return im
def v_bug():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im); cx=128
    for s in (-1,1):
        for ly,lx in [(120,150),(150,158),(180,150)]:
            d.line((cx,ly,cx+s*lx,ly+ (lx-150)*0 + (ly-150)),fill=(20,12,12,255),width=8)
    d.ellipse((cx-46,96,cx+46,210),fill=(210,60,54,255),outline=(20,12,12,255),width=7)  # body
    d.line((cx,104,cx,200),fill=(20,12,12,255),width=6)                                   # split
    d.ellipse((cx-40,86,cx+40,128),fill=(30,18,18,255),outline=(20,12,12,255),width=5)    # head
    for s in (-1,1):
        d.line((cx+s*16,90,cx+s*40,60),fill=(20,12,12,255),width=6); d.ellipse((cx+s*40-6,54,cx+s*40+6,66),fill=(20,12,12,255))
        d.ellipse((cx+s*14-7,150,cx+s*14+7,164),fill=(250,240,230,255))                    # spots
        d.ellipse((cx+s*20-6,184,cx+s*20+6,196),fill=(250,240,230,255))
    return im
def v_api():
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im); cx=cy=128
    nodes=[(cx,cy)]; sat=[(cx,46),(cx+70,cy+44),(cx-70,cy+44)]
    for sx,sy in sat: d.line((cx,cy,sx,sy),fill=(40,150,150,255),width=8)
    for sx,sy in sat: d.ellipse((sx-22,sy-22,sx+22,sy+22),fill=(46,176,176,255),outline=(10,40,42,255),width=6)
    d.ellipse((cx-30,cy-30,cx+30,cy+30),fill=(90,214,205,255),outline=(10,40,42,255),width=7)
    return im
REDRAW={"calendar":v_calendar,"time":v_time,"idle":v_idle,"container":v_container,"bug":v_bug,"api":v_api}
def master(kind):
    if MAP[kind] is None: return normalize(REDRAW[kind](),0.9)
    return normalize(key_dark(Image.open(f"{ICONS}/{MAP[kind]}.png")),0.92)
def pulse_sheet(m):
    r,g,b,a=m.split(); rgb=Image.merge("RGB",(r,g,b))
    seq=[0,0.3,0.6,0.85,1.0,0.85,0.6,0.3,0.0]; frames=[]
    for t in seq:
        bright=ImageEnhance.Brightness(rgb).enhance(1.0+0.18*t); face=Image.merge("RGBA",(*bright.split(),a))
        glow=m.filter(ImageFilter.GaussianBlur(int(W*0.045))); ga=np.array(glow).astype(float)
        ga[...,3]=np.clip(ga[...,3]*0.55*t,0,255); glow=Image.fromarray(ga.astype(np.uint8))
        frames.append(Image.alpha_composite(glow,face))
    return frames
def save_sheet(kind,frames):
    sh=Image.new("RGBA",(W*3,W*3),(0,0,0,0))
    for i,f in enumerate(frames): sh.paste(f,((i%3)*W,(i//3)*W),f)
    sh.save(f"{OUT}/eye-{kind}.png")
kinds=list(MAP.keys());
for k in kinds: save_sheet(k, pulse_sheet(master(k)))
print("built", len(kinds), "no-orb tool sheets")
