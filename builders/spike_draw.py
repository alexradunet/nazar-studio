#!/usr/bin/env python3
"""Spike masters (no orb): a bold flat Nazar EYE and a TOOL (magnifier), drawn
programmatically for pixel-perfect, ANSI-legible silhouettes. 256x256 RGBA, transparent."""
import math
from PIL import Image, ImageDraw, ImageChops, ImageFilter

W=256
def almond(cx, cy, halfw, halfh, n=120):
    top=[]; bot=[]
    for i in range(n+1):
        t=i/n; x=cx-halfw+2*halfw*t; b=math.sin(math.pi*t)
        top.append((x, cy-halfh*b)); bot.append((x, cy+halfh*b))
    return top+bot[::-1]

def draw_eye(path):
    base=Image.new("RGBA",(W,W),(0,0,0,0))
    layer=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(layer)
    cx=cy=128
    poly=almond(cx,cy,104,62)
    # cosmic sclera (deep indigo, the "compressed memory")
    d.polygon(poly, fill=(17,15,46,255))
    # iris bands teal->indigo (flat, few bands)
    for r,col in [(58,(34,56,150)),(50,(30,120,165)),(40,(40,178,180)),(32,(70,208,196))]:
        d.ellipse((cx-r,cy-r,cx+r,cy+r), fill=col+(255,))
    # gold filigree ring (Basm nod, no orb)
    d.ellipse((cx-60,cy-60,cx+60,cy+60), outline=(216,178,72,255), width=5)
    # pupil
    d.ellipse((cx-23,cy-23,cx+23,cy+23), fill=(7,8,18,255))
    # specular highlights
    d.ellipse((cx-15,cy-17,cx-3,cy-5), fill=(238,250,255,255))
    d.ellipse((cx+7,cy+3,cx+14,cy+10), fill=(170,225,235,255))
    # cosmic sparkles in the sclera
    for sx,sy,rr,c in [(74,150,3,(205,230,255)),(188,98,3,(255,242,205)),(96,96,2,(190,255,240)),(170,156,2,(205,222,255)),(150,86,2,(255,255,255))]:
        d.ellipse((sx-rr,sy-rr,sx+rr,sy+rr), fill=c+(255,))
    # clip everything to the almond
    mask=Image.new("L",(W,W),0); ImageDraw.Draw(mask).polygon(poly, fill=255)
    layer.putalpha(ImageChops.multiply(layer.split()[3], mask))
    base=Image.alpha_composite(base, layer)
    # bold lid outline (defines the eye at tiny sizes)
    d2=ImageDraw.Draw(base)
    d2.line(poly+[poly[0]], fill=(6,24,34,255), width=6, joint="curve")
    # upper-lid lash thickening: a second darker arc just above the top lid
    topline=almond(cx,cy-6,104,62)[:121]
    d2.line(topline, fill=(4,16,24,255), width=4, joint="curve")
    base.save(path); print("eye ->",path)

def draw_magnifier(path):
    base=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(base)
    rcx,rcy,rr=104,104,60
    # handle (thick rounded bar, drawn first so ring overlaps its top)
    d.line((150,150,212,212), fill=(20,70,86,255), width=30, joint="curve")
    d.line((150,150,212,212), fill=(44,116,128,255), width=18, joint="curve")
    d.line((152,150,206,206), fill=(96,170,178,255), width=6, joint="curve")
    # lens glass (dark glassy teal)
    d.ellipse((rcx-rr,rcy-rr,rcx+rr,rcy+rr), fill=(20,52,64,255))
    # glass glare streaks
    d.line((rcx-30,rcy-18,rcx+6,rcy-40), fill=(150,225,230,200), width=7)
    d.line((rcx-34,rcy+4,rcx-6,rcy-16), fill=(110,195,205,160), width=4)
    # thick teal ring
    d.ellipse((rcx-rr,rcy-rr,rcx+rr,rcy+rr), outline=(46,176,176,255), width=18)
    # ring highlight (top-left) and shadow (bottom-right)
    d.arc((rcx-rr,rcy-rr,rcx+rr,rcy+rr), 150, 250, fill=(120,225,220,255), width=7)
    d.arc((rcx-rr,rcy-rr,rcx+rr,rcy+rr), 320, 60, fill=(18,96,104,255), width=7)
    # crisp dark outline around ring (definition at tiny sizes)
    d.ellipse((rcx-rr-2,rcy-rr-2,rcx+rr+2,rcy+rr+2), outline=(6,26,32,255), width=4)
    d.ellipse((rcx-rr+18,rcy-rr+18,rcx+rr-18,rcy+rr-18), outline=(6,26,32,255), width=3)
    base.save(path); print("magnifier ->",path)

draw_eye("/agent/workspace/eye_master.png")
draw_magnifier("/agent/workspace/mag_master.png")
# quick side-by-side preview on a dark field at full res
field=(16,18,24)
prev=Image.new("RGB",(560,300),(10,11,15));
for i,p in enumerate(["/agent/workspace/eye_master.png","/agent/workspace/mag_master.png"]):
    im=Image.open(p); bg=Image.new("RGBA",(W,W),field+(255,)); comp=Image.alpha_composite(bg,im).convert("RGB").resize((256,256))
    prev.paste(comp,(24+i*272,22))
ImageDraw.Draw(prev).text((24,4),"eye_master",fill=(180,210,230)); ImageDraw.Draw(prev).text((296,4),"mag_master",fill=(180,210,230))
prev.save("/agent/workspace/spike_masters_preview.png"); print("preview saved")
