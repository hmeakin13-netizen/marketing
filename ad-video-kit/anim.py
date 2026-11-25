import json, subprocess, os, math, random
from PIL import Image, ImageDraw, ImageFont
S="/tmp/claude-0/-home-user-marketing/a51caf29-7970-5c27-b880-1d285e394a4a/scratchpad"
os.chdir(S+"/apexvid")
W,H,FPS=1080,1920,30
F="/usr/share/fonts/opentype/inter/"
def f(w,s): return ImageFont.truetype(F+f"Inter-{w}.otf",s)
SNOWF=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",60)
BG=(12,38,28); BG2=(20,58,42); Y=(255,215,0); WH=(255,255,255); GR=(170,195,180); RED=(230,70,60)
old=Image.open(S+"/apexads/homescreen_old.png").convert("RGB")
k=1632/500; ICON=old.crop((int(41*k),int(265*k),int(89*k),int(313*k)))

BASE=Image.new("RGBA",(W,H)); bd=ImageDraw.Draw(BASE)
for y in range(H):
    t=y/H; bd.line([(0,y),(W,y)],fill=tuple(int(BG[i]*(1-t)+BG2[i]*t) for i in range(3))+(255,))

def layer():
    im=Image.new("RGBA",(W,H),(0,0,0,0)); return im, ImageDraw.Draw(im)
def el(im):  # crop to bbox
    b=im.getbbox(); return (im.crop(b), b[0], b[1])
def ctext_el(y,t,font,fill=WH):
    im,d=layer(); d.text((W//2,y),t,font=font,fill=fill,anchor="mm"); return el(im)

ne=json.load(open(S+"/dl_ne/ne.geojson"))
polys=[p[0] for ft in ne["features"] if ft["properties"].get("ADM0_A3")=="GBR" for p in ft["geometry"]["coordinates"]]
def ukmap(cx,cy,h,fill=(46,110,80),outline=(120,200,150)):
    im,d=layer(); sx=math.cos(math.radians(54.5)); sc=h/11.0
    P=lambda lo,la:(cx+(lo+3.45)*sx*sc, cy-(la-55.4)*sc)
    for p in polys:
        pts=[P(lo,la) for lo,la in p]
        if len(pts)>2: d.polygon(pts,fill=fill,outline=outline,width=3)
    return el(im), P

def ease_out_back(x):
    c1=1.70158; c3=c1+1; return 1+c3*(x-1)**3+c1*(x-1)**2
def clamp(x): return max(0,min(1,x))

# element: dict(img,x,y,t0,anim,dur)
def E(e,t0,anim="drop",dur=0.35,**kw):
    img,x,y=e; d=dict(img=img,x=x,y=y,t0=t0,anim=anim,dur=dur); d.update(kw); return d

def render_el(frame,e,t):
    if t<e["t0"]: return
    p=clamp((t-e["t0"])/e["dur"]); img=e["img"]; x,y=e["x"],e["y"]
    a=1.0
    if e["anim"]=="drop":
        y=y-int(140*(1-ease_out_back(p))); a=clamp(p*2)
    elif e["anim"]=="up":
        y=y+int(200*(1-ease_out_back(p))); a=clamp(p*2)
    elif e["anim"]=="pop":
        s=max(0.05,ease_out_back(p)); 
        if s!=1:
            nw,nh=max(1,int(img.width*s)),max(1,int(img.height*s))
            x+= (img.width-nw)//2; y+=(img.height-nh)//2; img=img.resize((nw,nh))
        a=clamp(p*2)
    elif e["anim"]=="fade":
        a=p
    elif e["anim"]=="wipe":  # reveal left to right
        w=int(img.width*p)
        if w<1: return
        img=img.crop((0,0,w,img.height))
    if "shake" in e:
        for ts in e["shake"]:
            if ts<=t<ts+0.3: x+=int(10*math.sin((t-ts)*60))
    if a<1:
        img=img.copy(); al=img.getchannel("A").point(lambda v:int(v*a)); img.putalpha(al)
    frame.alpha_composite(img,(x,y))

words=json.load(open("words.json"))
fix={"Surgeons.":"surgeons.","inquiries":"enquiries"}
words=[[fix.get(w,w),a,b] for w,a,b in words]
def T(word,n=1):
    c=0
    for w,a,b in words:
        if w.lower().strip(".,?")==word.lower().strip(".,?"):
            c+=1
            if c==n: return a
    raise Exception(word)

scenes=[]
# ---- S1 map
end1=T("If")-0.08
(mimg,mx,my),P=ukmap(W//2,880,900)
els=[E(ctext_el(230,"TREE SURGEONS",f("Black",112),Y),0.0),
     E(ctext_el(345,"ACROSS THE UK",f("Bold",70)),0.35),
     E((mimg,mx,my),0.15,"pop",0.5)]
random.seed(4)
pts=[(-1.5,53.8),(-0.1,51.5),(-2.2,52.5),(-3.2,55.9),(-1.6,54.9),(-2.6,51.4),(1.2,52.6),(-4.1,50.4),(-3.0,53.4),(-1.1,52.9),(0.5,51.3),(-4.2,57.4),(-2.1,57.1),(-3.9,51.6),(-1.4,50.9),(-0.6,53.0)]
for i,(lo,la) in enumerate(pts):
    cx,cy=P(lo,la); im,d=layer(); d.ellipse([cx-14,cy-14,cx+14,cy+14],fill=Y); d.ellipse([cx-26,cy-26,cx+26,cy+26],outline=Y+(140,),width=4)
    els.append(E(el(im),0.7+i*0.13,"pop",0.25))
scenes.append((0,end1,els,None))
# ---- S2 quiet phone + snow
s2=end1; end2=T("Homeowners")-0.08
im,d=layer(); d.rounded_rectangle([250,330,830,1430],70,fill=(15,15,18),outline=(80,80,90),width=8); d.rounded_rectangle([450,358,630,400],22,fill=(0,0,0))
d.text((W//2,540),"Wednesday 2 December",font=f("Medium",30),fill=GR,anchor="mm"); d.text((W//2,650),"7:12",font=f("Light",150),fill=WH,anchor="mm")
phone2=el(im)
els=[E(ctext_el(210,"WINTER GONE QUIET?",f("Black",80),Y),s2+0.05),
     E(phone2,s2+0.1,"up",0.45),
     E(ctext_el(980,"No new enquiries",f("Medium",42),(150,150,160)),T("quiet"),"fade",0.5),
     E(ctext_el(1050,"0",f("Black",120),(150,150,160)),T("quiet")+0.2,"pop",0.4)]
scenes.append((s2,end2,els,"snow"))
# ---- S3 jobs drop in on keyword
s3=end2; end3=T("We")-0.08
els=[E(ctext_el(200,"HOMEOWNERS",f("Black",90),Y),s3+0.03),E(ctext_el(300,"STILL NEED:",f("Black",90),Y),s3+0.2)]
for i,(t,sub,kw) in enumerate([("Storm damage cleared","Fallen and split limbs","storm"),("Crowns reduced","Overgrown trees near the house","crowns"),("Stumps out","Before spring planting","stumps")]):
    y=430+i*300
    im,d=layer(); d.rounded_rectangle([90,y,W-90,y+240],40,fill=(255,255,255,28),outline=(120,200,150),width=4)
    d.text((280,y+70),t,font=f("Bold",58),fill=WH); d.text((280,y+145),sub,font=f("Regular",40),fill=GR)
    els.append(E(el(im),T(kw)-0.1,"drop",0.4))
    im,d=layer(); d.ellipse([140,y+70,240,y+170],fill=Y); d.line([(165,y+120),(185,y+145),(220,y+95)],fill=BG,width=14)
    els.append(E(el(im),T(kw)+0.25,"pop",0.3))
els.append(E(ctext_el(1390,"They just need to find you.",f("SemiBold",54)),T("They"),"up",0.4))
scenes.append((s3,end3,els,None))
# ---- S4 notifications drop in one at a time
s4=end3; end4=T("Yours")-0.08
x0,y0,x1=180,440,900
im,d=layer(); d.rounded_rectangle([150,350,930,1400],70,fill=(15,15,18),outline=(80,80,90),width=8); d.rounded_rectangle([450,378,630,420],22,fill=(0,0,0)); d.text((W//2,520),"7:12",font=f("Light",110),fill=WH,anchor="mm")
d.text((W//2,1365),"Example notifications",font=f("Regular",28),fill=(190,195,195),anchor="mm")
phone4=el(im)
ic=ICON.resize((90,90))
def card(y,title,lines,time):
    im,d=layer(); hh=130+len(lines)*46
    d.rounded_rectangle([x0+10,y,x1-10,y+hh],34,fill=(60,70,70,235))
    im.paste(ic,(x0+35,y+25))
    d.text((x0+145,y+22),"Apex Leads",font=f("SemiBold",34),fill=WH); d.text((x1-40,y+26),time,font=f("Regular",30),fill=(210,215,215),anchor="ra")
    d.text((x0+145,y+66),title,font=f("SemiBold",36),fill=WH)
    for i,l in enumerate(lines): d.text((x0+145,y+114+i*46),l,font=f("Regular",34),fill=WH)
    return el(im), y+hh+24
c1,y=card(620,"New enquiry",["Oak crown reduction","Wants a quote this week"],"9:47 PM")
c2,y=card(y,"New enquiry",["Storm-damaged ash","Ready to start"],"6:58 AM")
c3,y=card(y,"New enquiry",["3 conifers + stump grinding"],"7:05 AM")
tn=[T("enquiries"),T("straight"),T("phone.")]
els=[E(ctext_el(170,"STRAIGHT TO",f("Black",90),Y),s4+0.03),E(ctext_el(270,"YOUR PHONE",f("Black",90),Y),s4+0.18),
     dict(**E(phone4,s4+0.05,"up",0.45),shake=tn),
     E(c1,tn[0],"drop",0.35),E(c2,tn[1],"drop",0.35),E(c3,tn[2],"drop",0.35),
     E(ctext_el(1480,"Ads on your own Page, in your name",f("SemiBold",46),GR),T("own",2),"fade",0.4)]
scenes.append((s4,end4,els,None))
# ---- S5 yours only + animated strike
s5=end4; end5=T("45")-0.08
im,d=layer(); d.line([(170,1045),(910,1045)],fill=RED,width=10); strike=el(im)
els=[E(ctext_el(560,"YOURS",f("Black",210),Y),T("Yours"),"pop",0.35),E(ctext_el(770,"ONLY",f("Black",210),Y),T("only,"),"pop",0.35),
     E(ctext_el(1040,"Shared with 3 other firms",f("SemiBold",58),GR),T("not",2),"fade",0.3),
     E(strike,T("shared"),"wipe",0.8)]
scenes.append((s5,end5,els,None))
# ---- S6 counter
s6=end5; end6=T("One")-0.08
im,d=layer(); d.rounded_rectangle([110,880,W-110,1130],40,fill=(255,255,255,30),outline=Y,width=5); d.text((W//2,960),"or we keep working",font=f("SemiBold",62),fill=WH,anchor="mm"); d.text((W//2,1050),"free until you have them",font=f("SemiBold",62),fill=WH,anchor="mm")
box=el(im)
counter=[ctext_el(420,str(n),f("Black",330),Y) for n in range(46)]
els=[E(ctext_el(640,"QUALIFIED LEADS",f("Black",92)),T("qualified"),"drop",0.35),E(ctext_el(750,"IN 60 DAYS",f("Black",92)),T("60"),"drop",0.35),
     E(box,T("or",2) if False else T("working"),"pop",0.4),E(ctext_el(1220,"You pay your own ad spend",f("Regular",40),GR),T("until",2) if False else T("got"),"fade",0.4)]
scenes.append((s6,end6,els,("count",T("45"),T("leads"),counter)))
# ---- S7 area + CTA
s7=end6; end7=words[-1][2]+0.8
(mimg,mx,my),P=ukmap(W//2,830,820,fill=(40,95,70),outline=(100,170,130))
cx,cy=P(-1.9,52.5)
im,d=layer(); d.rounded_rectangle([140,1290,W-140,1440],75,fill=Y); d.text((W//2,1365),"Is your area free?",font=f("Bold",60),fill=BG,anchor="mm"); btn=el(im)
im,d=layer(); im.paste(ICON.resize((110,110)),(W//2-280,1470)); d.text((W//2-150,1525),"Apex Leads",font=f("Bold",56),fill=WH,anchor="lm"); logo=el(im)
els=[E(ctext_el(190,"ONE TREE SURGEON",f("Black",90),Y),s7+0.03),E(ctext_el(295,"PER AREA",f("Black",90),Y),s7+0.2),
     E((mimg,mx,my),s7+0.05,"fade",0.4),E(btn,T("Tap"),"pop",0.4),E(logo,T("yours",2),"up",0.4)]
scenes.append((s7,end7,els,("pulse",cx,cy,T("area."))))

# snowflakes
random.seed(1); flakes=[(random.uniform(0,W),random.uniform(-H,0),random.uniform(80,160),random.uniform(0,6)) for _ in range(40)]
snowimg=Image.new("RGBA",(70,70)); ImageDraw.Draw(snowimg).text((35,35),"❄",font=SNOWF,fill=(210,235,255,170),anchor="mm")

total=end7; N=int(total*FPS)
p=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgba","-s",f"{W}x{H}","-r",str(FPS),"-i","-",
    "-c:v","libx264","-pix_fmt","yuv420p","-crf","19","-preset","medium","anim.mp4"],stdin=subprocess.PIPE)
for n in range(N):
    t=n/FPS; fr=BASE.copy()
    for s0,s1,els,extra in scenes:
        if not (s0<=t<s1): continue
        if extra=="snow":
            for x,y0,v,ph in flakes:
                fr.alpha_composite(snowimg,(int(x+20*math.sin(t*1.5+ph))%W,int((y0+v*(t-s0)*4)%H)))
        for e in els: render_el(fr,e,t)
        if isinstance(extra,tuple) and extra[0]=="count":
            _,ta,tb,cnt=extra
            if t>=ta:
                v=int(round(45*clamp((t-ta)/max(0.4,tb-ta+0.3))))
                img,x,y=cnt[v]; fr.alpha_composite(img,(x,y))
        if isinstance(extra,tuple) and extra[0]=="pulse":
            _,cx,cy,tp=extra
            if t>=tp:
                d=ImageDraw.Draw(fr,"RGBA")
                for k2 in range(2):
                    ph=((t-tp)*0.9+k2*0.5)%1; r=30+170*ph
                    d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(255,215,0,int(220*(1-ph))),width=8)
                d.ellipse([cx-20,cy-20,cx+20,cy+20],fill=Y)
    p.stdin.write(fr.tobytes())
p.stdin.close(); p.wait()
print("frames",N,"total",round(total,2))
