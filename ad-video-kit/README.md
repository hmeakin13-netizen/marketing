# Ad video kit

Scripts used to build Apex and client video ads and reels (Nov 2026). Paths inside point at an old scratchpad: change `S=` at the top to your working folder.

- `client_video_build.py`: client job video. Real photos, zoom cuts, area map first, captions, voiceover (`vo.mp3` + `words.json`).
- `tx.py`: word timings from the voiceover (faster_whisper small.en). Gives `words.json`.
- `anim.py`: Apex tree surgeon ad with animated graphics that drop in on the spoken word. Needs a UK outline: the Natural Earth 50m countries geojson.
- `caps.py`: burned-in captions (ASS), 2 to 3 words at a time, yellow key words.
- `reel.py`, `r1.py`, `r2.py`: organic reels. Client footage background, animated text cards, captions.
- `AD_STYLE_GUIDE.md`: rules, what works, and a copy-paste prompt.

Voice: ElevenLabs `eleven_v4`, voice `8DnGo4ExCMEivIGjQGHB` ("Tom - British Ad Man"), 1 take.

Posting: render 720p under 3MB, upload to Google Drive, share by link, then give Metricool the `https://drive.google.com/uc?export=download&id=<id>` URL.
