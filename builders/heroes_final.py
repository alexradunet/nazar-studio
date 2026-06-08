#!/usr/bin/env python3
"""Lock + animate the two heroes (no orb):
  NAZAR eye  -> 9-frame BLINK (thinking), vector, frame0 = open rest.
  SEEKER soul -> 9-frame RADIANCE PULSE (typing/alive), from AI master A, frame0 = rest.
Outputs 768x768 3x3 sheets + sextant GIF previews + frame strips at 27x13."""
import math, numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageEnhance, ImageFilter, ImageFont
from ansi_render import tile, over, normalize, sext_small
W=256
def almond(cx,cy,hw,hh,n=160):
    top=[]; bot=[]
    for i in range(n+1):
        t=i/n; x=cx-hw+2*hw*t; b=math.sin(math.pi*t)
        top.append((x,cy-hh*b)); bot.append((x,cy+hh*b))
    return top+bot[::-1]
def eye_frame(halfh, hw=118):
    base=Image.new("RGBA",(W,W),(0,0,0,0)); layer=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(layer)
    cx=cy=128; poly=almond(cx,cy,hw,max(2,halfh))
    d.polygon(poly, fill=(16,14,46,255))
    if halfh>14:
        for r,col in [(66,(32,54,150)),(56,(28,118,168)),(45,(40,184,184)),(34,(78,214,200))]:
            d.ellipse((cx-r,cy-r,cx+r,cy+r), fill=col+(255,))
        d.ellipse((cx-67,cy-67,cx+67,cy+67), outline=(218,180,74,255), width=6)
        d.ellipse((cx-27,cy-27,cx+27,cy+27), fill=(6,7,16,255))
        d.ellipse((cx-18,cy-20,cx-3,cy-5), fill=(242,251,255,255))
        d.ellipse((cx+8,cy+5,cx+16,cy+13), fill=(168,224,234,255))
        for sx,sy,rr,c in [(78,150,3,(208,232,255)),(184,100,3,(255,243,208)),(150,84,2,(255,255,255))]:
            d.ellipse((sx-rr,sy-rr,sx+rr,sy+rr), fill=c+(255,))
    mask=Image.new("L",(W,W),0); ImageDraw.Draw(mask).polygon(poly, fill=255)
    layer.putalpha(ImageChops.multiply(layer.split()[3], mask))
    base=Image.alpha_composite(base,layer); d2=ImageDraw.Draw(base)
    d2.line(poly+[poly[0]], fill=(6,24,34,255), width=7, joint="curve")
    d2.line(almond(cx,cy-6,hw,max(2,halfh))[:161], fill=(3,14,22,255), width=5, joint="curve")
    return base
BLINK=[80,74,54,28,8,28,54,74,80]
eye_frames=[eye_frame(h) for h in BLINK]

soul=normalize(Image.open("/agent/workspace/souls/A_radiant_keyed.png"),0.92)
r,g,b,a=soul.split(); rgb0=Image.merge("RGB",(r,g,b))
def soul_frame(t):
    rgb=ImageEnhance.Brightness(rgb0).enhance(1.0+0.17*t)
    face=Image.merge("RGBA",(*rgb.split(),a))
    gold=Image.new("RGBA",(W,W),(255,206,120,0)); gold.putalpha(a.point(lambda v:int(v*0.65)))
    glow=gold.filter(ImageFilter.GaussianBlur(12)); ga=np.array(glow).astype(float)
    ga[...,3]=np.clip(ga[...,3]*(0.20+0.80*t),0,255); glow=Image.fromarray(ga.astype(np.uint8))
    return Image.alpha_composite(glow, face)
PULSE=[0,0.3,0.6,0.85,1.0,0.85,0.6,0.3,0.0]
soul_frames=[soul_frame(t) for t in PULSE]

def sheet(frames,path):
    sh=Image.new("RGBA",(W*3,W*3),(0,0,0,0))
    for i,f in enumerate(frames): sh.paste(f,((i%3)*W,(i//3)*W),f)
    sh.save(path)
sheet(eye_frames,"/agent/workspace/nazar_eye_sheet.png")
sheet(soul_frames,"/agent/workspace/soul_A_sheet.png")

def gif(frames,rows,path,px=18,dur=140,field=(15,17,23)):
    g=[tile(f,rows,"sext",field=field,px=px,do_norm=False) for f in frames]
    g[0].save(path,save_all=True,append_images=g[1:],duration=dur,loop=0)
gif(eye_frames,13,"/agent/workspace/nazar_eye_27.gif",dur=130)
gif(soul_frames,13,"/agent/workspace/soul_A_27.gif",dur=150)
gif(eye_frames,17,"/agent/workspace/nazar_eye_35.gif",dur=130)
gif(soul_frames,17,"/agent/workspace/soul_A_35.gif",dur=150)

def font(s):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",s)
    except Exception: return ImageFont.load_default()
def strip(frames,rows,label):
    ts=[tile(f,rows,"sext",px=16,do_norm=False) for f in frames]
    w=10+sum(t.width+8 for t in ts); h=ts[0].height+30
    im=Image.new("RGB",(w,h),(10,11,15)); d=ImageDraw.Draw(im); d.text((10,4),label,fill=(150,235,205),font=font(15)); x=10
    for i,t in enumerate(ts): im.paste(t,(x,24)); d.text((x,24+t.height+1),str(i),fill=(150,170,190),font=font(11)); x+=t.width+8
    return im
s1=strip(eye_frames,13,"NAZAR eye — blink/think (9 frames @ 27x13 sextant)")
s2=strip(soul_frames,13,"SEEKER soul A — radiance pulse (9 frames @ 27x13 sextant)")
out=Image.new("RGB",(max(s1.width,s2.width),s1.height+s2.height+8),(6,7,10)); out.paste(s1,(0,0)); out.paste(s2,(0,s1.height+8))
out.save("/agent/workspace/heroes_anim_strips.png"); print("done", out.size)
