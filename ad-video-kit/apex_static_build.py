import json, subprocess, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S="/tmp/claude-0/-home-user-marketing/a51caf29-7970-5c27-b880-1d285e394a4a/scratchpad"
os.chdir(S+"/apexvid")
W,H,FPS=1080,1920,30
F="/usr/share/fonts/opentype/inter/"
def f(w,s): return ImageFont.truetype(F+f"Inter-{w}.otf",s)
BG=(12,38,28); BG2=(20,58,42); Y=(255,215,0); WH=(255,255,255); GR=(170,195,180)
old=Image.open(S+"/apexads/homescreen_old.png").convert("RGB")
k=1632/500; icon=old.crop((int(41*k),int(265*k),int(89*k),int(313*k)))

def base():
    im=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(im)
    for y in range(H):  # vertical gradient
        t=y/H; d.line([(0,y),(W,y)],fill=tuple(int(BG[i]*(1-t)+BG2[i]*t) for i in range(3)))
    return im, ImageDraw.Draw(im,"RGBA")

# UK outline
ne=json.load(open(S+"/dl_ne/ne.geojson"))
polys=[]
for ft in ne["features"]:
    if ft["properties"].get("ADM0_A3")=="GBR":
        for poly in ft["geometry"]["coordinates"]: polys.append(poly[0])
def ukmap(d,cx,cy,h,fill=(46,110,80),outline=(120,200,150)):
    lat0=54.5; sx=math.cos(math.radians(lat0))
    lon_min,lon_max,lat_min,lat_max=-8.7,1.8,49.9,60.9
    sc=h/(lat_max-lat_min)
    def P(lon,lat): return (cx+(lon-(lon_min+lon_max)/2)*sx*sc, cy-(lat-(lat_min+lat_max)/2)*sc)
    for p in polys:
        pts=[P(lo,la) for lo,la in p]
        if len(pts)>2: d.polygon(pts,fill=fill,outline=outline,width=3)
    return P

def phone(im,d,x,y,w,h):
    d.rounded_rectangle([x,y,x+w,y+h],70,fill=(15,15,18),outline=(80,80,90),width=8)
    d.rounded_rectangle([x+w//2-90,y+28,x+w//2+90,y+70],22,fill=(0,0,0))
    return (x+30,y+90,x+w-30,y+h-40)

def ctext(d,y,t,font,fill=WH): d.text((W//2,y),t,font=font,fill=fill,anchor="mm")

scenes=[]
# 1 UK map call-out
im,d=base()
ctext(d,230,"TREE SURGEONS",f("Black",112),Y)
ctext(d,345,"ACROSS THE UK",f("Bold",70))
ukmap(d,W//2,860,900)
scenes.append((im,3.1))
# 2 quiet phone
im,d=base()
ctext(d,210,"WINTER GONE QUIET?",f("Black",80),Y)
x0,y0,x1,y1=phone(im,d,250,330,580,1100)
d.text((W//2,y0+120),"Wednesday 2 December",font=f("Medium",30),fill=GR,anchor="mm")
d.text((W//2,y0+230),"7:12",font=f("Light",150),fill=WH,anchor="mm")
d.text((W//2,y0+560),"No notifications",font=f("Medium",40),fill=(140,140,150),anchor="mm")
for sx,sy in [(120,520),(960,640),(150,1100),(930,1250),(200,1380),(880,420)]:
    d.text((sx,sy),"❄",font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",70),fill=(200,230,255,160),anchor="mm")
scenes.append((im,3.95))
# 3 jobs still needed
im,d=base()
ctext(d,200,"HOMEOWNERS",f("Black",90),Y)
ctext(d,300,"STILL NEED:",f("Black",90),Y)
for i,(t,s) in enumerate([("Storm damage cleared","Fallen and split limbs"),("Crowns reduced","Overgrown trees near the house"),("Stumps out","Before spring planting")]):
    y=430+i*300
    d.rounded_rectangle([90,y,W-90,y+240],40,fill=(255,255,255,28),outline=(120,200,150),width=4)
    d.ellipse([140,y+70,240,y+170],fill=Y)
    d.line([(165,y+120),(185,y+145),(220,y+95)],fill=BG,width=14)
    d.text((280,y+70),t,font=f("Bold",58),fill=WH)
    d.text((280,y+145),s,font=f("Regular",40),fill=GR)
ctext(d,1390,"They just need to find you.",f("SemiBold",54))
scenes.append((im,6.9))
# 4 enquiries to your phone
im,d=base()
ctext(d,170,"STRAIGHT TO",f("Black",90),Y)
ctext(d,270,"YOUR PHONE",f("Black",90),Y)
x0,y0,x1,y1=phone(im,d,150,350,780,1050)
d.text((W//2,y0+80),"7:12",font=f("Light",110),fill=WH,anchor="mm")
ic=icon.resize((90,90))
def card(y,title,lines,time):
    hh=130+len(lines)*46
    d.rounded_rectangle([x0+10,y,x1-10,y+hh],34,fill=(60,70,70,230))
    im.paste(ic,(x0+35,y+25))
    d.text((x0+145,y+22),"Apex Leads",font=f("SemiBold",34),fill=WH)
    d.text((x1-40,y+26),time,font=f("Regular",30),fill=(210,215,215),anchor="ra")
    d.text((x0+145,y+66),title,font=f("SemiBold",36),fill=WH)
    for i,l in enumerate(lines): d.text((x0+145,y+114+i*46),l,font=f("Regular",34),fill=WH)
    return y+hh+24
y=y0+200
y=card(y,"New enquiry",["Oak crown reduction","Wants a quote this week"],"9:47 PM")
y=card(y,"New enquiry",["Storm-damaged ash","Ready to start"],"6:58 AM")
y=card(y,"New enquiry",["3 conifers + stump grinding"],"7:05 AM")
d.text((W//2,y1-30),"Example notifications",font=f("Regular",28),fill=(190,195,195),anchor="mm")
ctext(d,1480,"Ads on your own Page, in your name",f("SemiBold",46),GR)
scenes.append((im,6.0))
# 5 yours only
im,d=base()
ctext(d,560,"YOURS",f("Black",210),Y)
ctext(d,770,"ONLY",f("Black",210),Y)
ctext(d,1040,"Shared with 3 other firms",f("SemiBold",58),GR)
d.line([(170,1045),(910,1045)],fill=(230,70,60),width=10)
scenes.append((im,2.95))
# 6 guarantee
im,d=base()
ctext(d,420,"30",f("Black",330),Y)
ctext(d,640,"QUALIFIED LEADS",f("Black",92))
ctext(d,750,"IN 60 DAYS",f("Black",92))
d.rounded_rectangle([110,880,W-110,1130],40,fill=(255,255,255,30),outline=Y,width=5)
ctext(d,960,"or we keep working",f("SemiBold",62))
ctext(d,1050,"free until you have them",f("SemiBold",62))
ctext(d,1220,"You pay your own ad spend",f("Regular",40),GR)
scenes.append((im,5.2))
# 7 one per area + CTA
im,d=base()
ctext(d,190,"ONE TREE SURGEON",f("Black",90),Y)
ctext(d,295,"PER AREA",f("Black",90),Y)
P=ukmap(d,W//2,830,820,fill=(40,95,70),outline=(100,170,130))
cx,cy=P(-1.9,52.5)
for r,a in [(120,60),(80,110)]:
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(255,215,0,a))
d.ellipse([cx-18,cy-18,cx+18,cy+18],fill=Y)
d.rounded_rectangle([140,1290,W-140,1440],75,fill=Y)
ctext(d,1365,"Is your area free?",f("Bold",60),BG)
im.paste(icon.resize((110,110)),(W//2-280,1470))
d.text((W//2-150,1525),"Apex Leads",font=f("Bold",56),fill=WH,anchor="lm")
scenes.append((im,4.6))

clips=[]
for i,(im,dur) in enumerate(scenes):
    im.save(f"s{i}.jpg",quality=93)
    n=int(round(dur*FPS))
    z="'min(1+0.0007*on,1.06)'" if i%2==0 else "'max(1.06-0.0007*on,1)'"
    subprocess.run(["ffmpeg","-v","error","-y","-loop","1","-i",f"s{i}.jpg","-vf",
        f"scale=2160:3840,zoompan=z={z}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}",
        "-frames:v",str(n),"-c:v","libx264","-pix_fmt","yuv420p",f"c{i}.mp4"],check=True)
    clips.append(f"c{i}.mp4")
open("list.txt","w").write("".join(f"file '{c}'\n" for c in clips))

words=json.load(open("words.json"))
fix={"Surgeons.":"surgeons.","inquiries":"enquiries"}
words=[[fix.get(w,w),a,b] for w,a,b in words]
def ts(t): return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"
hdr="""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Display,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1
"""+"\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
key={"winter","quiet","storm","crowns","stumps","find","straight","phone.","Yours","only,","30","60","free","One","area.","Tap"}
lines=[];i=0
while i<len(words):
    grp=words[i:i+3]
    for j,(w,_,_) in enumerate(grp):
        if w.endswith((".",",","?")) and j<len(grp)-1: grp=grp[:j+1];break
    st=grp[0][1]; en=words[i+len(grp)][1] if i+len(grp)<len(words) else grp[-1][2]+0.6
    txt=" ".join(("{\\c&H00D7FF&}"+w.upper()+"{\\c&HFFFFFF&}") if w in key else w.upper() for w,_,_ in grp)
    lines.append(f"Dialogue: 0,{ts(st)},{ts(en)},Cap,,0,0,0,,{{\\pos(540,1700)}}{txt}")
    i+=len(grp)
open("caps.ass","w").write(hdr+"\n".join(lines)+"\n")
subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i","list.txt","-i","vo.mp3",
 "-vf","ass=caps.ass","-map","0:v","-map","1:a","-c:v","libx264","-crf","20","-preset","medium",
 "-c:a","aac","-b:a","160k","-shortest","-movflags","+faststart","Apex_tree_surgeons_video_v1.mp4"],check=True)
print("done", sum(d for _,d in scenes))
