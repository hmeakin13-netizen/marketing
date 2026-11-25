import json, subprocess, numpy as np
from faster_whisper import WhisperModel
raw = subprocess.run(["ffmpeg","-v","error","-i","vo.mp3","-f","s16le","-ac","1","-ar","16000","-"],capture_output=True).stdout
a = np.frombuffer(raw,np.int16).astype(np.float32)/32768
m = WhisperModel("small.en", compute_type="int8")
segs,_ = m.transcribe(a, word_timestamps=True)
out=[]
for s in segs:
    for w in s.words:
        t=w.word.strip()
        if out and t.startswith("-"): out[-1][0]+=t; out[-1][2]=round(w.end,2); continue
        out.append([t,round(w.start,2),round(w.end,2)])
json.dump(out,open("words.json","w"))
print(" ".join(f"{w}@{s}" for w,s,e in out))
