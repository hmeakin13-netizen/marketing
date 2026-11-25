exec(open("reel.py").read())
w=json.load(open("w1.json"))
C=S+"/"
clips=[C+"jrpvid/c04.mp4",C+"sovvid/c1.mp4",C+"egsvid/c3.mp4",C+"jrpvid/c12.mp4",C+"sovvid/c8.mp4",C+"effvid/c2.mp4",C+"egsvid/c7.mp4",C+"jrpvid/c10.mp4",C+"sovvid/c4.mp4",C+"effvid/c6.mp4",C+"jrpvid/c22.mp4",C+"egsvid/c10.mp4",C+"sovvid/c9.mp4"]
def card(y,num,t1,t2):
    im,d=layer(); d.rounded_rectangle([80,y,W-80,y+230],40,fill=(10,30,22,225),outline=Y,width=5)
    d.ellipse([115,y+55,235,y+175],fill=Y); d.text((175,y+115),num,font=f("Black",76),fill=DK,anchor="mm")
    d.text((270,y+60),t1,font=f("Bold",54),fill=WH); d.text((270,y+132),t2,font=f("Regular",42),fill=(215,225,220)); return el(im)
fix_t=T(w,"fix?")
els=[E(txt(260,"PAYING A LEAD SITE",f("Black",86),Y),0.0,"drop",0.3,fix_t),E(txt(370,"FOR JOBS?",f("Black",86),Y),0.3,"drop",0.3,fix_t),
     E(txt(500,"Here's why it's costing you",f("SemiBold",52)),T(w,"here's"),"fade",0.4,T(w,"1.")),
     E(card(520,"1","Same job, 4 firms","Sent to 3 or 4 others"),T(w,"1."),"drop",0.4,fix_t),
     E(card(790,"2","Race to ring first","Cheapest quote wins"),T(w,"2."),"drop",0.4,fix_t),
     E(card(1060,"3","Too slow?","They may have booked elsewhere"),T(w,"3."),"drop",0.4,fix_t),
     E(txt(330,"THE FIX",f("Black",120),Y),fix_t,"pop",0.35),
     E(txt(560,"Enquiries that are",f("Bold",68)),T(w,"enquiries"),"up",0.4),
     E(txt(700,"YOURS ONLY",f("Black",130),DK,box=Y),T(w,"yours"),"pop",0.4),
     E(txt(900,"On your own Page",f("SemiBold",58)),T(w,"ads"),"fade",0.3),
     E(txt(990,"In your name",f("SemiBold",58)),T(w,"in",1) if False else T(w,"name,"),"fade",0.3),
     E(txt(1080,"Straight to your phone",f("SemiBold",58)),T(w,"straight"),"fade",0.3),
     E(txt(1290,"Message us \"LEADS\"",f("Black",72),DK,box=Y),T(w,"message"),"pop",0.4),
     E(logo_el(1420),T(w,"follow"),"up",0.4)]
build("Reel1_lead_sites",
      "vo1.mp3",w,clips,els,{"costing","same","race","cheapest","booked","fix?","yours","only.","straight","leads."},{"Enquiries":"Enquiries"},dim=0.55)
