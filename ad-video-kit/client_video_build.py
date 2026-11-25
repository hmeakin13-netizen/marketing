import json, subprocess, os
from PIL import Image, ImageFilter, ImageOps

S = "/tmp/claude-0/-home-user-marketing/a51caf29-7970-5c27-b880-1d285e394a4a/scratchpad"
W, H, FPS = 1080, 1920, 30
os.chdir(S + "/effvid")

# Real Eco Ground photos, best first; reused with different zoom direction to keep cuts every ~3s
pics = [
    "effvid/img/01_slate_ridge.jpg",
    "effvid/img/02_flat_rooflight.jpg",
    "effvid/img/04_flat_london.jpg",
    "effvid/img/05_slate_velux.jpg",
    "effvid/img/07_flashing.jpg",
    "effvid/img/03_flat_bay.jpg",
    "effvid/img/08_ridge.jpg",
    "effvid/img/09_aerial_tiles.jpg",
    "effvid/img/06_flat_narrow.jpg",
    "effvid/img/10_flat_terrace.jpg",
]
order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 2, 3]
total = 38.8
dur = total / len(order)

def frame(path, out):
    im = ImageOps.exif_transpose(Image.open(S + "/" + path)).convert("RGB")
    bg = ImageOps.fit(im, (W, H)).filter(ImageFilter.GaussianBlur(40))
    bg = Image.eval(bg, lambda v: int(v * 0.55))
    r = min(W / im.width, H / im.height)
    if im.width < im.height:  # portrait: fill
        fg = ImageOps.fit(im, (W, H))
        bg.paste(fg, (0, 0))
    else:
        r = W * 1.25 / im.width  # landscape: slightly wider than screen, centred
        fg = im.resize((int(im.width * r), int(im.height * r)))
        bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2 - 120))
    bg.save(out, quality=92)

MAP_T = 3.0
dur = (total - MAP_T) / len(order)
clips = []
for i, p in enumerate([-1] + order):
    still = f"s{i}.jpg"
    if p == -1:
        still = "map.jpg"
        n = int(round(MAP_T * FPS))
    else:
        frame(pics[p], still)
        n = int(round(dur * FPS))
    zin = i % 2 == 0
    z = f"'min(1+0.0009*on,1.12)'" if zin else f"'max(1.12-0.0009*on,1)'"
    out = f"c{i}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", still, "-vf",
                    f"scale=2160:3840,zoompan=z={z}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}",
                    "-frames:v", str(n), "-c:v", "libx264", "-pix_fmt", "yuv420p", out], check=True)
    clips.append(out)
open("list.txt", "w").write("".join(f"file '{c}'\n" for c in clips))

# Captions: 2-3 words at a time, big, centre, yellow highlight on key words
words = json.load(open("words.json"))
def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"
hdr = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Display,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
key = {"leaking", "tired", "Watch", "first.", "disappear.", "free", "drone", "inspection", "straight", "15", "year", "guarantee", "same", "day", "no-obligation", "quote."}
lines = []
i = 0
while i < len(words):
    grp = words[i:i + 3]
    # break after punctuation
    for j, (w, _, _) in enumerate(grp):
        if w.endswith((".", ",", "?")) and j < len(grp) - 1:
            grp = grp[:j + 1]
            break
    start = grp[0][1]
    end = words[i + len(grp)][1] if i + len(grp) < len(words) else grp[-1][2] + 0.4
    txt = " ".join(("{\\c&H00D7FF&}" + w.upper() + "{\\c&HFFFFFF&}") if w in key else w.upper() for w, _, _ in grp)
    txt = txt.replace(" -OBLIGATION", "-OBLIGATION")
    lines.append(f"Dialogue: 0,{ts(start)},{ts(end)},Cap,,0,0,0,,{{\\pos(540,{1790 if start < MAP_T else 1180})}}{txt}")
    i += len(grp)
open("caps.ass", "w").write(hdr + "\n".join(lines) + "\n")

subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", "vo.mp3",
                "-vf", "ass=caps.ass", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
                "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "Efficient_roof_video_v1.mp4"], check=True)
print("done")
