# Showcase plan: videos, screenshots and READMEs for Aang, Samara and Waymark

2026-10-22. Research and plan only: nothing installed, no product code changed.

**In one line:** record the real apps, then build every title card, zoom and caption as a web page that Claude writes and renders to video with **HyperFrames**. Screenshots come from a new "press kit" script that reuses the Electron harnesses we already have.

---

## 1. The tool from the TikTok, and the alternatives

### Huashu Motion, the real repo

- **Repo:** https://github.com/alchaincyf/huashu-motion. MIT licence, about 1.4k stars, pushed today (2026-10-22), v0.3.x, JavaScript, Node 22 or newer.
  - Its sister repo is https://github.com/alchaincyf/huashu-art-motion: MIT, about 4.9k stars, with 35 art styles for explainer animations.
- **What it is:** an agent skill (`npx skills add alchaincyf/huashu-motion`) plus a CLI called `om`. You tell Claude Code "make a 30-second launch film". It does the following:
  - writes the film as one `index.html` (GSAP, Canvas, Three.js and SVG);
  - writes a music score;
  - renders the film through headless Chrome and FFmpeg;
  - opens an editor where you click a frame and type what to change.
- **Why it exists:** the author built it as an open copy of Anthropic's Claude Motion (released 2026-10-08, Team and Enterprise beta only).
- **Output quality:** high, in a slick "keynote launch film" style. Its own films are fast cuts, kinetic type and 3D, all on the beat.
- **Install effort:** easy on a Mac. It needs Node 22, Chrome or Edge, and FFmpeg. There is an optional 55 MB sample pack and optional narration models.
- **Fit for Joshua: poor as the main tool.**
  1. The README says "Tested on macOS only so far". Our editing machine is the Shadow PC.
  2. Its taste is built in: rules measured from 21 commercial launch films, 20 "motion languages", fonts and music. That is the glossy launch-film look, the opposite of crisp pixel art and dark pixel wood. It would fight his style on every shot. That is the AI-slop risk he has already rejected.
  3. It draws everything in code. It "doesn't generate people or live footage". His videos are mostly real screen recordings.
  4. It stamps "Made with huashu-motion" on any film 4 s or longer unless you turn that off.
- **Worth borrowing:** its ideas. Start each film with a rhythm sheet and hook within 3 s. Have a check pass that catches cut-off or covered text. Make a share kit: a GIF under 10 MB for the README plus a post.

### The alternatives

All figures were checked on GitHub on 2026-10-22.

| Tool | What it is | Licence / activity | Fit |
|---|---|---|---|
| **HyperFrames** (heygen-com/hyperframes) | HTML + CSS + GSAP → MP4 through headless Chrome and FFmpeg. Built for agents and ships Claude Code skills | Apache-2.0, ~70k stars, pushed today | **Best fit.** Plain HTML, the same as his cockpit sheets. Not tied to macOS. Can lay real recordings, pixel title cards, zooms and captions on one timeline |
| Remotion | React → video | Source-available (a company licence is needed above 3 people; free for him), ~66k stars | Good, but React-heavy and not truly open. HyperFrames does the same job in plain HTML |
| Motion Canvas / Revideo | TypeScript animation engines, built for explainer diagrams | MIT. Motion Canvas last pushed 2026-07, Revideo 2026-07 | Built for animated diagrams, not product demos. Slowing down |
| Manim | Maths animation | n/a | Wrong tool for app demos |
| Cap (CapSoftware/Cap) | Open-source Loom alternative with a "Studio Mode": backgrounds, zooms, captions. **Runs on Windows** | AGPL + commercial, ~24k stars, v0.6.1 on 2026-10-20 | Good **manual fallback** for a hand-recorded take with auto zoom |
| OpenScreen | Open Screen Studio alternative: auto-zoom that follows the cursor, captions made on the device, GIF export | MIT. The original (~40k stars) is **archived**; maintained fork getopenscreen/openscreen (~4.8k stars) | Same role as Cap. The fork is young |
| Rotato-style device mockups | Paid apps that put recordings into 3D phone frames | Paid | Not needed. A flat pixel-styled phone frame in HTML fits his look better |

## 2. Recommendation: one toolchain

**Real footage + HyperFrames, scripted by Claude, run on the Shadow PC.**

1. **Capture.** Record the real apps, the same way every time.
   - **Electron windows** (bubble, typing box, Samara, pop-outs, notes, timer, player): the harness drives them off screen with demo data. It records frames with `webContents.beginFrameSubscription`, or `capturePage` at 30 fps, and pipes them to the ffmpeg that is already installed (Gyan build 9.0.1). This gives exact pixels and no desktop clutter.
   - **The pet itself** (C#, its own window, so the pages above can't capture it): use `ffmpeg -f gdigrab -i title="..."` on his real desktop with a plain wallpaper. Or composite Aang from his own frame PNGs: `assets/aang/frames/*` are 224×224, with animations idle, hello, talk, think, walk, zip, nap, spin, scooter and look. This is the same trick sheet 53 already uses.
   - **Waymark:** record with iOS's built-in screen recording on the test iPhone running the demo data. Or, for repeatable takes, run Playwright on https://waymark-demo.vercel.app at iPhone size with `recordVideo` (Playwright is already in the repo). The Maestro flows in `.maestro/` need a Mac or iOS simulator, so they are the Mac route.
2. **Compose in HyperFrames.** Each video is one HTML page that Claude writes.
   - **Title cards:** his pixel font (from `docs/cockpit/fonts.html`) and the browser's pixel-painted wood art, with `image-rendering: pixelated`.
   - **Smooth zooms:** GSAP on the video element. Zoom only to whole-number steps (1×, 2×, 3×) when pixel art is on screen.
   - **Captions:** short, timed in the page.
   - **Music:** one royalty-free (CC0) track per video, or none.
3. **Render settings.** Render at 3840×2160 (2160p) with Aang at a whole-number scale.
   - YouTube gives 4K uploads a much higher bitrate, which keeps pixel edges crisp.
   - Encode with `-pix_fmt yuv444p`, or a high CRF, so colour edges don't smear.
4. **Fallback.** If a take has to be by hand (for example a WoW overlay moment), record it in **Cap** with auto zoom. Then drop the MP4 into the same HyperFrames page for the title card and end card.

Why this one:
- It is the only setup where Claude can **rerun a video after a UI change** with one command.
- It keeps his look, because the cards are built from his real assets, not a stock template.
- It runs on Windows.
- It needs no subscription.

## 3. Three videos, 60 to 90 s each

Same frame for all three:
- 0 to 3 s hook on a real moment;
- pixel title card;
- 3 or 4 feature beats of about 15 s each, every one with **one** caption line;
- end card with the GitHub link.
- No voice-over in version 1 (see the questions).

### A. Aang, "a little pixel companion that lives on your desktop" (75 s)

| Time | Shot | Source |
|---|---|---|
| 0–3 | Aang zips onto an empty dark desktop, waves (hello) | frame PNGs, composited |
| 3–6 | Title card: "aang" in pixel type on dark wood | HyperFrames |
| 6–20 | Hotkey, typing box, question, speech bubble grows, first words in about half a second. Zoom 2× on the bubble | harness capture |
| 20–35 | Reminder set, then fires later with the quest icon and a soft sound | harness |
| 35–50 | A Claude Code session gets stuck; Aang pokes: "your claude's waiting on you" | harness + pet mark |
| 50–62 | Aang sits quietly beside a game window (generic, no WoW UI unless he wants it); nap animation | gdigrab or composite |
| 62–75 | End card: "lil pixel companion · github.com/Bowgull/AiVatar" | HyperFrames |

### B. Samara, "a browser where Claude gets its own tabs" (75 s)

| Time | Shot |
|---|---|
| 0–3 | The plum lantern icon lights up; Samara opens as a floating page with soft edges |
| 3–6 | Title card "samara" with the lantern |
| 6–25 | Claude shows its plan card; one site is unticked; the plan runs in Claude's own grouped tabs. Zoom on the plan card |
| 25–40 | The big STOP key gets pressed |
| 40–55 | Shield button with per-site rules. Caption: "bank & money sites are never opened" |
| 55–68 | Pop-out takes the tab: a video pinned edge to edge, then the pop-out family snapping together |
| 68–75 | End card |

### C. Waymark, "a training journal for lifting, muay thai & running" (60 s)

Vertical 1080×1920 for Shorts, plus a 16:9 cut with the phone centred on dark grain.

| Time | Shot |
|---|---|
| 0–3 | A bag-round timer counts down, mid-session |
| 3–6 | Title card |
| 6–20 | Today tab (Block Zero, week 4 of 6) |
| 20–35 | Bag work with prescribed rounds, then the round timer |
| 35–48 | A run from Strava becoming evidence; the coach explains a change |
| 48–60 | End card with the demo link waymark-demo.vercel.app |

Use the demo data from `DEMO_SCRIPT.md`, never his real log.

## 4. Screenshot press kit

### The script

Add `src/Shell/test/electron/presskit-shots.ts`, built the same way as `speech-shots.ts`:
- real pages served by `servePages`;
- off screen;
- the harness catches its own errors, so no dialogs pop up.

It writes to `docs/press/` (committed) these shots:

| File | Content |
|---|---|
| `hero.png` 2560×1280 | Aang + bubble + Samara on dark grain. Doubles as the **social preview** (GitHub wants 1280×640, so this is the same image at 2×) |
| `aang-bubble.png` | Aang mid-reply, bubble open |
| `typing-box.png` | Typing box under Aang (256 wide, 111 tall, drawn at 2×) |
| `samara.png` and `samara-plan.png` | Samara window; plan card with one row unticked |
| `popouts.png` | Player, notes and timer pop-outs snapped together |
| `brief.png` | Morning brief (sheet 23 B) |
| `loop-*.gif` / `loop-*.mp4` | 3–6 s loops: Aang idle, the bubble growing, a pop-out snapping |

### Rules the script enforces

- **2× device scale**, and every pixel-art layer at a whole-number scale with `image-rendering: pixelated`.
- **One background:** his dark grain at the same exposure in every shot, a 48 px margin, and a soft-edge drop shadow (dark wood, not black outlines).
- **Crisp GIFs:**
  - `ffmpeg -i in.mp4 -vf "fps=20,scale=iw:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none" out.gif`
  - Keep each GIF under 10 MB for the README.
  - Also export an MP4. GitHub plays MP4s dragged into a README edit as `user-attachments`, and they look sharper than GIFs.
- **Privacy scrub:** this is a hard fail, not an eyeball check.
  - Every shot loads a demo profile: a fake name, fake reminders, example.com sites, no real mail.
  - Before saving, the script reads the page's `innerText` and its input values. If it finds an email pattern, "bocas", "Joshua", a street address, a token shape (`sk-`, `ghp_`, long hex or base64) or a real hostname from his history, it refuses to write the file.
  - Samara's address bar and tab titles count too.
- **Waymark shots:** run Playwright on the demo site at 390×844 at 3×. Put each shot into a flat **pixel-styled phone frame drawn in HTML**: rounded dark body, no Apple artwork, consistent with his look. Save to `Waymark/docs/press/`.

## 5. READMEs, plus the GitHub About box, topics and social preview

### What a great README for an app like this has

1. A hero GIF or MP4 at the top.
2. A one-line pitch.
3. 3 to 5 feature sections, each with one image.
4. Install or try it.
5. How it's built.
6. Roadmap or status.
7. Credits and licence.

Also: a GitHub About line with a homepage link, 5 to 10 topics, and a custom social preview image.

### AiVatar (public): https://github.com/Bowgull/AiVatar

**Current README:** casual voice, honest "what i did" section. Keep both. Gaps:
- no images at all;
- names are confusing: the repo is "AiVatar", the README says "aang", and Samara lives inside it;
- no install or "can I run it" line (it is Windows + a Claude subscription; say so plainly);
- no topics, no homepage (Bowgull/aang has a home page and privacy policy; link it), no custom social preview.

**Plan:**
- hero MP4;
- a "meet aang" and a "samara" section, each with 2 images from the press kit;
- a short "how it's built" (C# pet + Electron shell + Claude Agent SDK, and the decision log in `docs/`);
- move the technical notes under a folded `<details>` block;
- topics: `desktop-pet`, `pixel-art`, `electron`, `csharp`, `claude`, `ai-companion`, `browser`;
- social preview = `hero.png`.

**Privacy risk (public now):** tracked files contain his personal email. At least these do:
- `docs/DRIVE-CLAUDE-MD.md`, `docs/FINAL-AANG-BUILD.md`, `docs/PORT-TO-MAC.md`;
- tests (`booking`, `emailfacts`, `g15`, `mail-e6`, `lockdown`);
- `tabclose-shots.ts`.

It is already in git history, so editing the files only stops new copies. Decide whether that is fine.

### Waymark (public): https://github.com/Bowgull/Waymark

**Current README:** developer setup only (commands, migrations). The About line and the demo homepage are good. Gaps:
- no pitch for a visitor;
- no screenshots;
- no topics or social preview.

**Plan:**
- vertical hero loop;
- a "what a day looks like" section with 3 framed phone shots (Today, Bag work, Coach);
- a "try the demo" link;
- move the setup commands under "for developers";
- topics: `fitness`, `muay-thai`, `training-log`, `capacitor`, `react`, `cloudflare-workers`, `ios`.

**Privacy risks (public now):**
- tracked `🐉🥊 MUAY THAI CONDITIONING JOURNAL 🐉🥊.xlsx` (his personal journal);
- `Waymark Style Guide.docx`, `SESSION_PROMPT.md`, `WAYMARK_SESSION_HANDOFF.md`;
- `DEMO_SCRIPT.md` and the README name the live Worker URL `waymark.example.workers.dev`.

Check these before sending people to the repo.

## 6. Effort and quota

| Piece | Sessions | Quota |
|---|---|---|
| Press kit script + scrub + first shot set (Aang/Samara) | 1 | Low. One Electron run per pass, no live model calls |
| Waymark Playwright shots + phone frame | 0.5 | Low |
| Two README rewrites, topics, social preview | 0.5 | Low. Topics and the About box are set with `gh repo edit`; the social preview image is uploaded by hand in Settings |
| HyperFrames setup (Node 22 check, `npx hyperframes`) + shared pixel title-card kit | 0.5 | Low |
| Each video (capture script + composition + 2 rounds of notes) | 1–1.5 each | Medium. Most of the cost is Claude writing HTML and looking at frames, 2 rounds of notes max |
| **Total** | **about 5–6 sessions** | Rendering is local and free |

## 7. Questions for Joshua

1. **Voice:**
   - captions + music only;
   - your own voice;
   - or wait for Aang's own voice (step V) and let him narrate his video?
2. **Waymark repo:** should the journal spreadsheet, style guide and handoff notes come out of the public repo? Also, is a history rewrite OK, or just remove them going forward?
3. **Samara:** keep it inside the Aang repo, or give it its own repo and page later?
4. **WoW in the Aang video:** OK to show Aang sitting next to your real game, or keep it generic?

---

Sources: [huashu-motion](https://github.com/alchaincyf/huashu-motion) · [huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion) · [HyperFrames](https://github.com/heygen-com/hyperframes) · [Remotion](https://github.com/remotion-dev/remotion) · [Motion Canvas](https://github.com/motion-canvas/motion-canvas) · [Revideo](https://github.com/midrender/revideo) · [Cap](https://github.com/CapSoftware/Cap) · [OpenScreen (archived)](https://github.com/siddharthvaddem/openscreen) · [OpenScreen fork](https://github.com/getopenscreen/openscreen) · [HyperFrames write-up](https://themenonlab.blog/blog/heygen-hyperframes-video-as-code) · [Trendshift listing](https://trendshift.io/repositories/284570)
