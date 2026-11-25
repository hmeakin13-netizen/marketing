import json
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
key={"winter","quiet","storm","crowns","stumps","find","straight","phone.","Yours","only,","45","60","free","One","area.","Tap"}
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
