exec(open("reel.py").read())
w=json.load(open("w2.json"))
C=S+"/sovvid/"
clips=[C+f"c{i}.mp4" for i in [1,2,3,4,6,7,8,9,10,12]]
end_t=T(w,"want")
im,d=layer()
els=[E(txt(260,"ONE VIDEO AD",f("Black",104),Y),0.0,"drop",0.3,end_t),E(txt(380,"A ROOFER IN KENT",f("Black",80)),T(w,"roofer"),"drop",0.3,end_t),
     E(txt(560,"Real jobs",f("Bold",62),DK,box=Y),T(w,"real"),"pop",0.3,T(w,"in",2)),
     E(txt(680,"His own footage",f("Bold",62),DK,box=Y),T(w,"own"),"pop",0.3,T(w,"in",2)),
     E(txt(800,"Map of his area",f("Bold",62),DK,box=Y),T(w,"map"),"pop",0.3,T(w,"in",2)),
     E(txt(620,"FIRST 5 DAYS",f("Black",80)),T(w,"in",2),"drop",0.3,T(w,"no")),
     E(txt(800,"4 ENQUIRIES",f("Black",130),Y),T(w,"four"),"pop",0.4,T(w,"no")),
     E(txt(1010,"3 in 24 hours",f("Black",76),DK,box=Y),T(w,"three"),"pop",0.4,T(w,"no")),
     E(txt(600,"NO STOCK PHOTOS",f("Black",90),WH,box=(200,40,40)),T(w,"no"),"pop",0.3,end_t),
     E(txt(760,"NO AI",f("Black",90),WH,box=(200,40,40)),T(w,"no",2),"pop",0.3,end_t),
     E(txt(960,"Just his work",f("Bold",70),Y),T(w,"just"),"up",0.4,end_t),
     E(txt(500,"Want one for",f("Black",96)),end_t,"drop",0.3),E(txt(620,"YOUR TRADE?",f("Black",110),Y),T(w,"your"),"drop",0.3),
     E(txt(900,"Message us \"VIDEO\"",f("Black",76),DK,box=Y),T(w,"message"),"pop",0.4),
     E(logo_el(1060),T(w,"message")+0.3,"up",0.4)]
build("Reel2_kent_roofer_video","vo2.mp3",w,clips,els,{"kent.","four","three","24-hour","no","ai,","video."},{"inquiries.":"enquiries."},dim=0.5)
