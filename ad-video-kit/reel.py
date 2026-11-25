import json, subprocess, os, math, sys
from PIL import Image, ImageDraw, ImageFont
S="/tmp/claude-0/-home-user-marketing/a51caf29-7970-5c27-b880-1d285e394a4a/scratchpad"
os.chdir(S+"/reels")
W,H,FPS=1080,1920,30
F="/usr/share/fonts/opentype/inter/"
def f(w,s): return ImageFont.truetype(F+f"Inter-{w}.otf",s)
Y=(255,215,0); WH=(255,255,255); RED=(230,70,60); DK=(12,38,28)
old=Image.open(S+"/apexads/homescreen_old.png").convert("RGB"); k=1632/500
ICON=old.crop((int(41*k),int(265*k),int(89*k),int(313*k)))
def layer(): im=Image.new("RGBA",(W,H),(0,0,0,0)); return im,ImageDraw.Draw(im)
def el(im): b=im.getbbox(); return (im.crop(b),b[0],b[1])
def txt(y,t,font,fill=WH,box=None):
    im,d=layer()
    if box:
        bb=d.textbbox((W//2,y),t,font=font,anchor="mm"); d.rounded_rectangle([bb[0]-36,bb[1]-26,bb[2]+36,bb[3]+26],28,fill=box)
    d.text((W//2,y),t,font=font,fill=fill,anchor="mm",stroke_width=0 if box else 6,stroke_fill=(0,0,0)); return el(im)
def eob(x): c1=1.70158; c3=c1+1; return 1+c3*(x-1)**3+c1*(x-1)**2
cl=lambda x:max(0,min(1,x))
def E(e,t0,anim="drop",dur=0.35,t1=None): img,x,y=e; return dict(img=img,x=x,y=y,t0=t0,anim=anim,dur=dur,t1=t1)
def draw(fr,e,t):
    if t<e["t0"] or (e["t1"] and t>=e["t1"]): return
    p=cl((t-e["t0"])/e["dur"]); img,x,y=e["img"],e["x"],e["y"]; a=1
    if e["anim"]=="drop": y-=int(140*(1-eob(p))); a=cl(p*2)
    elif e["anim"]=="up": y+=int(200*(1-eob(p))); a=cl(p*2)
    elif e["anim"]=="pop":
        s=max(0.05,eob(p)); nw,nh=max(1,int(img.width*s)),max(1,int(img.height*s)); x+=(img.width-nw)//2; y+=(img.height-nh)//2; img=img.resize((nw,nh)); a=cl(p*2)
    elif e["anim"]=="wipe":
        w=int(img.width*p)
        if w<1: return
        img=img.crop((0,0,w,img.height))
    elif e["anim"]=="fade": a=p
    if a<1: img=img.copy(); img.putalpha(img.getchannel("A").point(lambda v:int(v*a)))
    fr.alpha_composite(img,(x,y))
def T(words,w,n=1):
    c=0
    for ww,a,b in words:
        if ww.lower().strip(".,?")==w.lower().strip(".,?"):
            c+=1
            if c==n: return a
    raise Exception(w)

def caps(words,key,path,fix):
    words=[[fix.get(w,w),a,b] for w,a,b in words]
    ts=lambda t:f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"
    hdr="[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Cap,Inter Display,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    L=[];i=0
    while i<len(words):
        g=words[i:i+3]
        for j,(w,_,_) in enumerate(g):
            if w.endswith((".",",","?")) and j<len(g)-1: g=g[:j+1];break
        st=g[0][1]; en=words[i+len(g)][1] if i+len(g)<len(words) else g[-1][2]+0.8
        t=" ".join(("{\\c&H00D7FF&}"+w.upper()+"{\\c&HFFFFFF&}") if w.lower().strip(".,?") in key else w.upper() for w,_,_ in g)
        L.append(f"Dialogue: 0,{ts(st)},{ts(en)},Cap,,0,0,0,,{{\\pos(540,1640)}}{t}"); i+=len(g)
    open(path,"w").write(hdr+"\n".join(L)+"\n")

def build(name,vo,words,clips,els,key,fix,dim=0.5,endcard=None):
    total=words[-1][2]+1.4; N=int(total*FPS)
    seg=total/len(clips)
    # background: each clip trimmed to seg, darkened
    lst=[]
    for i,c in enumerate(clips):
        o=f"bg_{name}_{i}.mp4"
        subprocess.run(["ffmpeg","-v","error","-y","-stream_loop","-1","-i",c,"-t",f"{seg:.3f}","-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},eq=brightness=-0.12:saturation=1.1,fps={FPS}","-an","-c:v","libx264","-pix_fmt","yuv420p",o],check=True)
        lst.append(o)
    open(f"bg_{name}.txt","w").write("".join(f"file '{x}'\n" for x in lst))
    subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i",f"bg_{name}.txt","-c","copy",f"bg_{name}.mp4"],check=True)
    dec=subprocess.Popen(["ffmpeg","-v","error","-i",f"bg_{name}.mp4","-f","rawvideo","-pix_fmt","rgba","-"],stdout=subprocess.PIPE)
    enc=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgba","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-c:v","libx264","-pix_fmt","yuv420p","-crf","19","-preset","medium",f"ov_{name}.mp4"],stdin=subprocess.PIPE)
    shade=Image.new("RGBA",(W,H),(0,0,0,int(255*dim)))
    last=None
    for n in range(N):
        raw=dec.stdout.read(W*H*4)
        if len(raw)==W*H*4: last=raw
        fr=Image.frombytes("RGBA",(W,H),last); fr.alpha_composite(shade); t=n/FPS
        for e in els: draw(fr,e,t)
        enc.stdin.write(fr.tobytes())
    enc.stdin.close(); enc.wait(); dec.kill()
    caps(words,key,f"caps_{name}.ass",fix)
    subprocess.run(["ffmpeg","-v","error","-y","-i",f"ov_{name}.mp4","-i",vo,"-vf",f"ass=caps_{name}.ass","-map","0:v","-map","1:a","-c:v","libx264","-crf","20","-preset","medium","-c:a","aac","-b:a","160k","-shortest","-movflags","+faststart",f"{name}.mp4"],check=True)
    print(name,"done",round(total,1))

def logo_el(y):
    im,d=layer(); im.paste(ICON.resize((110,110)),(W//2-250,y)); d.text((W//2-120,y+55),"Apex Leads",font=f("Bold",58),fill=WH,anchor="lm"); return el(im)
