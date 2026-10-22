# Showcase tools: what to use for the videos, and why

2026-10-22. Research only. Nothing installed. Follows `docs/SHOWCASE-PLAN.md`, and corrects it in three places (marked **Correction**).

**In one line:** the apps are always real footage; everything around them (title cards, zooms, captions, the phone frame) is HTML that Claude writes and HyperFrames turns into video. You narrate from the script in `docs/SHOWCASE-SCRIPTS.md`, recorded on the MacBook. No subscriptions.

---

## 1. Your questions, answered straight

### "Can Huashu Motion's glossy film style not just be changed in a setting?"

**Not a setting. It's steering.**

- There is no theme file. You describe the product and the agent "reads your product first and offers three directions to choose from". The look comes from:
  - its reference library: 20 "motion languages";
  - colour rules it measured from commercial launch films;
  - 27 bundled fonts;
  - a scoring system that writes keynote-style music.
- You *can* tell it "crisp pixel art, dark pixel wood, gold, game menu". It will try. But every session starts from those launch-film references, so you would be pushing against them each time. That is the AI-slop risk you already rejected.
- Its sister repo, huashu-art-motion, does have an 8-bit style and a Mario-style pixel demo. It is built for drawn explainer scenes, not app footage, and doesn't say it can hold a video clip.

### "Is drawing in code bad? Can it not capture video?"

**Correction:** the old plan said Huashu "draws everything in code" as if it can't use footage. That was too strong.
- Its `om grab` command pulls in "screenshots, icons and screen recordings" from a local project.
- For live footage the README says, in effect, *bring your own footage and it does the compositing and packaging*.

Drawing in code isn't bad. It is the right tool for half the job:

| Good in code | Must be real capture |
|---|---|
| Title cards in your pixel font on pixel wood | Aang himself, the bubble, Samara, Waymark |
| Zooms and pans onto a real recording | Anything a viewer could mistake for the real app |
| Captions, arrows, a highlight ring around a button | |
| The flat pixel phone frame for Waymark | |
| Transitions between beats | |

Why the app must be real: a redrawn UI drifts from the app the moment you change it, and a viewer who installs it and sees something different feels lied to.

HyperFrames is also "drawing in code". It's the same idea as Huashu. The difference is that its whole design is clips on a timeline, so real recordings are first-class.

### "We can turn off the name at the end"

Yes.
- Huashu puts a small "Made with huashu-motion" line in a corner for the last 1.2 s of any film 4 s or longer.
- The README says to tell the agent and it turns it off. There is no documented flag.
- HyperFrames adds nothing to your video.

### "Pros and cons of HyperFrames?"

See section 3. Short version:
- **Pros:** plain HTML that Claude already writes well; real video clips on a timeline; Apache-2.0, free; Claude Code skills from the makers; the same input gives the same video every time, so Claude can re-render after a UI change.
- **Cons:** Windows is a second-class citizen.
  - A visible console window pops up for the whole render (open bug #5653).
  - Exact-frame capture is Linux-only; Windows uses a less exact fallback.
  - Renders are slow-ish: one reviewer measured about 3 min for 30 s of 1080p.

None of that is a deal-breaker for 60-90 s videos, but it shapes *when* you render: not while you're in WoW.

---

## 2. The jobs, and the tools for each

His situation, used for every verdict:
- Windows Shadow cloud PC, played on the MacBook;
- one GPU shared with WoW;
- Claude writes most of the code;
- he narrates;
- the look is crisp pixel art, never glossy.

### (a) Screen recording

| Tool | What it is | Pros for you | Cons for you |
|---|---|---|---|
| **Our Electron harness** (already in repo) | Drives Aang's windows off screen with demo data and grabs frames (`capturePage` / `beginFrameSubscription`) into ffmpeg | Exact pixels, no desktop clutter, no private data, repeatable with one command, costs nothing | Only for Electron windows. Can't see the C# pet window |
| **OBS Studio** | The free standard recorder | Free, open source, no account, rock-solid on Windows. Window capture works for the C# pet. Zoom-to-mouse plugins exist (Zoominator, tested on Windows 11) | No auto zoom or cursor smoothing built in. Settings take one careful setup |
| **OpenScreen** (getopenscreen fork) | Free "Screen Studio" clone | MIT. Windows 10/11. Auto zoom that follows the cursor, cursor smoothing after recording, captions made on the device, GIF export | Young fork (4.8k stars) that warns of "rough edges". The .exe is unsigned (SmartScreen warning). The original repo is archived |
| **Recordly** | OpenScreen fork with a fuller cursor pipeline | Free, open source, auto zoom, Windows build listed | Only third-party listings found. Even younger |
| **Cap** | Open-source Loom alternative | Windows app, Studio Mode editor (backgrounds, manual zooms, click ripples since 0.6.0), 4K/60 export on Free | Free tier is "personal use only". Transcriptions are Pro. **Correction:** auto zoom from clicks is not confirmed; one comparison lists it as missing. Sign-in flow. Reports of A/V desync on long Windows takes |
| **FocuSee** | Paid Screen Studio clone for Windows | Closest to Screen Studio on Windows (auto zoom, smoothing) | Paid, no free plan after trial, closed source |
| Screen Studio | The Mac original | The best at this | Mac only and paid. On your Mac it would record the *Shadow stream*, with its compression artefacts. No |
| Tella / Loom | Cloud recorders built around a webcam | Easy sharing | Subscription, cloud upload, webcam-first. Wrong job |
| **ScreenToGif** | Tiny Windows recorder and GIF editor | Free, quick for a 3 s loop | Its GIFs are bigger and blurrier than our ffmpeg recipe. Use it only for a throwaway clip |

**Verdict:**
- Harness for every Electron window.
- OBS for the pet and any "real desktop" moment.
- Zooms get added later in HyperFrames, so the recorder doesn't need auto zoom.
- OpenScreen only if you ever want to make a quick video yourself start to finish without Claude.

### (b) Putting it together (code to video)

| Tool | Pros for you | Cons for you |
|---|---|---|
| **HyperFrames** (HeyGen) | Plain HTML/CSS/GSAP, the same as your cockpit sheets. Real `<video>` and `<audio>` on tracks via `data-start` / `data-duration`. Captions skill uses whisper.cpp word timings. Same input → same frames. Apache-2.0, no per-render fees. Official Claude Code plugin. Lint catches black or silent renders. In production at HeyGen; tldraw and TanStack use it | Windows console window during render (#5653, open). Exact-frame capture is Linux-only; Windows uses a screenshot fallback (fine for us, slightly less exact). Slow on one machine. Video-heavy pages can time out with several workers; use one worker. Small block catalog, so Claude writes most of it (fine). Studio app is Mac/Linux only; we use the CLI and browser preview |
| **Huashu Motion** | Great ideas: hook within 3 s, rhythm sheet, a check pass for clipped text. Narration + word alignment + music ducking built in. Can pull in your recordings | "Tested on macOS only so far". Launch-film taste baked into its references. Writes its own music. A watermark line unless told not to. One person's project, v0.3 |
| **Remotion** | Most mature. Free for individuals and companies up to 3 people, so free for you. Big ecosystem | React plus a bundler, more for Claude to get wrong. HeyGen built HyperFrames because agents struggled with it. Licence changes "slightly" in 5.0 |
| **Motion Canvas / Revideo** | MIT, made for animated diagrams | Built for explainers, not product demos. Slowing down (last pushes mid-2026) |
| **DaVinci Resolve (free)** | A real editor if you ever want to drag clips by hand. Strong on Windows | Heavy on the GPU you share with WoW. Big learning curve. Claude can't drive it. Keep as an emergency hand-edit option only |

**Verdict:** HyperFrames. It keeps what was right about Huashu (Claude writes HTML, you give notes on frames) without its taste. It's also the only one here built around clips.

### (c) Narration

| Step | Tool | Why | Watch out |
|---|---|---|---|
| Record | **On the MacBook**, not the Shadow. Audacity (free) or QuickTime → New Audio Recording | The Shadow gets your mic through the streaming client, which compresses it. Record where the mic is | Quiet room, phone face down, mic a fist's width away, 2 s of silence at the start (for noise removal) |
| Clean | **Audacity**: Noise Reduction (learn from the 2 s of silence), then a gentle compressor | Free, offline, nothing uploaded | Don't overdo noise reduction; it makes the voice watery |
| Clean, the easy way | **Adobe Podcast Enhance Speech** (free web) | One upload, sounds like a studio. Free tier is roughly 1 h a day, far more than you need | Can sound robotic at full strength; use the strength slider. It uploads your voice to Adobe |
| Loudness | `ffmpeg -i vo.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 vo-14.wav` | YouTube plays at about -14 LUFS; this matches it | none |
| Skip | **Descript free** | none | Free plan is about 1 transcription hour a month, with watermarked 720p exports. Not needed |

### (d) Syncing narration to the pictures, and captions

**Narration first, pictures second.** This is the trick that makes a narrated video easy.
1. You record the script.
2. **whisper.cpp** turns it into a transcript with a time for every word. It runs locally; for a 90 s clip even the CPU is fine. HyperFrames' captions skill runs whisper.cpp for you.
3. Claude sets each beat's `data-start` from those word times, so each shot lands on the word that names it.
4. **Captions:**
   - **YouTube (16:9):** upload the script as a transcript in YouTube Studio and let it auto-sync. That's free, and gives viewers proper captions they can turn off. Or upload the `.srt` from whisper.
   - **Shorts (vertical):** burn in short captions in your pixel font. Shorts viewers watch muted.

Tips:
- Use an English-only Whisper model (`small.en` or `medium.en`) for your English narration.
- The HyperFrames captions skill warns that Whisper invents words over silence. Trim silence first.

### (e) Pixel-art title cards and transitions

Custom HTML in HyperFrames, nothing bought:
- your pixel font from `docs/cockpit/fonts.html`;
- the browser's painted pixel wood;
- gold;
- `image-rendering: pixelated` and whole-number scales only.

Transitions in the style of a game menu:
- a wood panel slides in with a 2-frame step, like FFX menus;
- a hard cut with a one-frame flash;
- an iris wipe, like N64 Zelda.

Never cross-dissolve pixel art: blended pixels look muddy.

**Music:** none, or one quiet track from the YouTube Audio Library (free, cleared for YouTube), ducked about 20 dB under your voice.

### (f) GitHub GIFs

| Tool | Use it for | Why |
|---|---|---|
| **ffmpeg palettegen, `dither=none`, `flags=neighbor`** | Anything pixel art | Pixel art has few colours. No dithering keeps edges clean and files small. The recipe is in SHOWCASE-PLAN §4 |
| **gifski** | Clips with real video or gradients (a video pop-out) | Thousands of colours per frame with temporal dithering. That same dithering speckles flat pixel art, so don't use it on Aang |
| **MP4 in the README** (drag into a GitHub edit box) | The hero clip | Sharper and smaller than any GIF. GitHub plays it inline |

### (g) Waymark on the phone

| Route | Pros | Cons |
|---|---|---|
| **iPhone screen recording** (Control Centre) on the demo account | Real device, real feel. Records the app's sound, so the boxing bells come through | Shows the status bar (crop it). No visible taps. Every take is by hand |
| **Playwright on the demo site** at 390×844, 3× (already in repo) | Repeatable. Claude can redo it after a UI change. Can draw a tap dot where it clicks | Web build, not the native shell. The bells need adding in the edit |
| **Phone frame** | A flat pixel-style phone drawn in HTML: dark rounded body, no Apple artwork | none |

Use both: Playwright for most shots, one real iPhone take for the bag round so the bell is real.

---

## 3. HyperFrames in depth

- **What it is:** "an open-source framework for turning HTML, CSS, media, and seekable animations into deterministic MP4 videos". HeyGen, Apache-2.0, about 70k stars, very active (release v0.8.x, Oct 2026).
- **How a video is written:**
  - One `index.html`. The root has `data-composition-id`, `data-width` and `data-height`.
  - Each clip, image or text block has `data-start`, `data-duration` and `data-track-index`, plus `class="clip"`.
  - Animation is a **paused** GSAP timeline registered on `window.__timelines`. The renderer seeks it frame by frame. It never plays in real time.
- **Video clips:**
  - Before rendering, ffmpeg turns each `<video>` into numbered frames, and the renderer flips them in like a flipbook.
  - Don't animate a `<video>`'s width or top directly; wrap it in a div and zoom the div.
  - Use one worker when there are several clips.
- **Audio:**
  - `<audio>` on a track with `data-volume`.
  - Never call `play()` or set `currentTime` in scripts.
  - Tight sync is just careful `data-start` maths, which is why we time from whisper.
- **Captions:** captions skill plus caption blocks. The transcript comes from whisper.cpp with word timestamps.
- **Determinism rules for Claude:**
  - no `Date.now()`, no unseeded `Math.random()`, no network fetches at render time;
  - fonts are embedded locally.
- **Commands:** `npx hyperframes init`, `preview` (browser, live reload), `lint`, `check`, `snapshot --at 0,3,8` (stills for notes), `render`, `doctor`.
- **Requirements:** Node 22+, FFmpeg on PATH (ours is 9.0.1), and headless Chrome, which it fetches.
- **Windows gotchas:**
  1. A console window titled `chrome-headless-shell.exe` stays open for the whole render, and closing it kills the render (#5653, open, no fix). So render when you're not gaming, and expect that window.
  2. Exact frame capture (`beginFrame`) is Linux-only; Windows uses screenshot timing. For our mostly-clip videos that's fine. If a frame ever stutters, the Docker (Linux) render path is the fix.
  3. If a page has no GSAP timeline, add `data-no-timeline`, or every render waits 45 s.
  4. Turn telemetry off. The bug report shows the telemetry sender can open its own window on Windows.
- **Speed:** a reviewer measured 35-50 s for 10 s of 1080p and about 3 min for 30 s on an M2 Pro. A 90 s 4K video is likely 10-20 min on the Shadow. Use draft quality while giving notes (see `npx hyperframes render --help`).
- **Maturity:** used in production at HeyGen; one hands-on review says the "agents already know HTML" claim "mostly holds up". The same comparison says one-shot prompts fail on both HyperFrames and Remotion, about 26 prompts per intro. Plan on 2 rounds of notes per video, not one.

**Correction on render settings (SHOWCASE-PLAN §2.3):**
- Drop `yuv444p`. YouTube re-encodes everything to 4:2:0, so the extra colour detail never reaches viewers, and 4:4:4 H.264 is poorly supported by players and editors.
- What actually keeps pixels crisp:
  - render at **3840×2160** (YouTube gives 4K far more bitrate);
  - put every pixel-art layer at an **even** whole-number scale (2×, 4×), so 4:2:0's 2×2 colour blocks line up with the art's pixels;
  - x264 `-crf 14 -preset slow -pix_fmt yuv420p`.
- Shorts: 2160×3840.

---

## 4. Recommendation: the toolchain

| Job | Tool | Who |
|---|---|---|
| Script | `docs/SHOWCASE-SCRIPTS.md` | Claude writes, you edit until it sounds like you |
| App footage (Electron) | Press-kit harness, demo data, off screen | Claude |
| Pet and real desktop | OBS, plain dark wallpaper | You press record; Claude writes the OBS steps |
| Waymark | Playwright on demo site + one real iPhone take | Claude / you |
| Narration | Audacity on the MacBook → Enhance Speech (optional) → ffmpeg loudnorm | You read, Claude runs the loudness pass |
| Timing | whisper.cpp word times | Claude |
| Edit and render | HyperFrames, 4K, one worker | Claude; you give notes on stills and drafts |
| Captions | YouTube auto-sync from script (16:9); burned-in pixel captions (Shorts) | Claude / you click upload |
| GIFs | ffmpeg recipe (pixel); gifski (video bits); MP4 hero | Claude |

**Not using:**
- Huashu (macOS-only, launch-film taste);
- Remotion (React, no gain over HyperFrames for us);
- Cap (no confirmed auto zoom, personal-use free tier, and we zoom later anyway);
- Descript, Tella, Loom, Screen Studio.

**Steal from Huashu:** hook within 3 s, a rhythm sheet before building, a check pass for clipped or covered text, and a share kit (GIF under 10 MB plus a short post).

---

## 5. The workflow, step by step

1. **Script.** Read `SHOWCASE-SCRIPTS.md` out loud once. Cross out anything that doesn't sound like you. Claude re-times.
2. **Privacy check.** Demo profile on. The press-kit scrub refuses any frame with an email, "bocas", "Joshua", tokens or real hostnames (SHOWCASE-PLAN §4).
3. **Record footage.**
   - Claude runs the harness capture for each Electron beat. Output: `showcase/<video>/clips/*.mp4`, 4K, 60 fps.
   - You record the pet beats in OBS (Claude gives exact settings: 3840×2160, CQP 14, plain dark wallpaper, game closed).
   - Waymark: Playwright clips, plus one iPhone bag-round take.
4. **Narration.** On the Mac: one take per paragraph, three tries each, then keep the best. Clean, then loudness to -14 LUFS. Drop the WAVs in `showcase/<video>/vo/`.
5. **Timing.** whisper.cpp → `transcript.json`. Claude maps each script line to its shot list row.
6. **Build.** Claude writes `showcase/<video>/index.html`: title card, clips, zooms, captions, end card (no tool name, no watermark). Lint, check, snapshot stills at each beat.
7. **Notes, round 1.** You see stills and a draft render in Samara's Mockups trail. Notes in plain words.
8. **Notes, round 2.** Final render: 4K 16:9, plus the vertical teaser cut.
9. **Upload to YouTube.** Title, short description, the GitHub link, the script as transcript (auto-sync), a custom thumbnail made from a title-card frame. Teasers go up as Shorts.
10. **GitHub.** Hero MP4 in the README, 1-2 GIF loops, social preview `hero.png`.

**When:**
- Render and run whisper only when WoW is closed: same GPU.
- Expect the `chrome-headless-shell` console window while rendering.

**Effort:** same as SHOWCASE-PLAN §6, about 5-6 sessions, plus about 30 min of your time per video for narration.

---

## Sources

- Huashu Motion: https://github.com/alchaincyf/huashu-motion (README: style, `om grab`, macOS-only line, watermark line, voice) · https://github.com/alchaincyf/huashu-art-motion
- HyperFrames: https://github.com/heygen-com/hyperframes · https://hyperframes.heygen.com/guides/troubleshooting · https://www.heygen.com/research/html-to-video (video pre-extraction, Linux-only beginFrame, decoder timeouts) · https://github.com/heygen-com/hyperframes/issues/5653 (Windows console window) · captions skill https://skills.sh/heygen-com/hyperframes/captions · review https://andrew.ooo/posts/hyperframes-heygen-html-video-agents-review/ · https://news.ycombinator.com/item?id=47902856 · Remotion vs HyperFrames https://x.com/mvanhorn/article/2063624356484501832
- Remotion licence: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- Revideo: https://docs.re.video/
- Cap: https://github.com/CapSoftware/Cap · https://cap.so/pricing · https://newreleases.io/project/github/CapSoftware/Cap/release/cap-v0.6.0 · https://www.screenkite.com/blog/open-source-screen-recorders-cap-screenize-screenkite
- OpenScreen: https://github.com/getopenscreen/openscreen · Recordly: https://alternativeto.net/software/recordly/about/
- FocuSee: https://focusee.imobie.com/reviews/screen-studio-for-windows.htm · https://www.docsie.io/vs/screen-studio-vs-focusee-pricing/
- OBS zoom plugins: https://obsproject.com/forum/resources/zoominator-source-zoom-and-mouse-follow-plugin.2357 · https://github.com/tryptech/obs-zoom-and-follow
- Adobe Podcast limits: https://aitoolsatlas.ai/tools/adobe-podcast/pricing · Descript free tier: https://sonix.ai/resources/descript-pricing/
- whisper.cpp: https://github.com/ggml-org/whisper.cpp/releases
- gifski: https://gif.ski/
- Pixel art upscaling for YouTube: https://www.vogons.org/viewtopic.php?p=248166
