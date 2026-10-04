# What it takes: Aang's browser as the everyday browser

Written 2026-10-04, from a software engineer's point of view. Pulls together five research reports
(`Aang/reports/`), the hands-on tests (`docs/BROWSER-TESTS-2026-10-04.md`), and a pass over Reddit
via Google search results.

**Where judgement replaces measurement, it says so.** The effort figures are estimates for one
person building with AI help. Nobody has published how long this takes, because almost nobody has
done it and stayed.

---

## The answer first

**Replacing most browsing on this PC is achievable. Replacing all of it is not, and should not be
the goal.**

"Most" here means: the sites you use every day, your link clicks from Discord and email, your job
hunt, WoW guides, YouTube and Twitch, and the video over your game. Realistically **85 to 90% of
your browsing**.

Chrome stays installed, on purpose, for a short list:

| Kept in Chrome | Why |
|---|---|
| Any site that insists on a passkey | Passkeys hang in Electron (tested). Hidden until the Windows Hello bridge is proven |
| The odd Google sign-in that gets blocked | If Aang is the default browser, "open it in your default browser" sends it back to Aang. Chrome is the escape hatch |
| Netflix and Prime in full quality | Aang's DRM route tops out around 720p. Edge does 1080p and up |
| Anything that breaks during a security-patch gap | The castLabs DRM runtime lags weeks behind |

That split is how every small browser lives. It is not a failure state.

**Three workstreams, roughly 14 to 20 weeks of build** (my estimate):

| Workstream | What it is | Estimate |
|---|---|---|
| **A. The browser** | Safe enough and solid enough to be the default | 8 to 11 weeks |
| **B. Aang's intelligence inside it** | Reading, remembering, acting, safely | 3 to 4 weeks |
| **C. The video player** | The overlay over WoW, and "put X on" | 3 to 5 weeks |

---

## What Reddit added

The earlier research could not reach Reddit at all. This pass read Reddit through Google's search
results, which shows thread titles, top answers and snippets, **not full threads**. Treat these as
signals.

**1. The overlay's real enemy is stutter, not window layering.** The single biggest cluster of
gaming-plus-browser threads is people whose second-monitor YouTube or Twitch stutters while they
play. Big threads: r/DestinyTechSupport (260+ comments), r/buildapc (130+), r/wow, r/pathofexile
(80+). The fixes that keep coming up:

- Turning off **NVIDIA Instant Replay / ShadowPlay** and the GeForce in-game overlay
- Turning off **hardware acceleration** in the browser
- **"Chrome throttles in the background"**, so the video drops frames when the game has focus
- Mixed refresh rates (a 60 Hz and a 144 Hz monitor) causing it with no clean software fix

**This changes the overlay plan.** See workstream C.

**2. The 4-step ceiling is not just your local model.** On r/OpenAI, a Comet user: *"it can't do more
than 4-5 same type actions in a row."* That is the same ceiling measured on Qwen with thinking off.
It is a property of current agents, not of a cheap model. Keep agent jobs short.

**3. People judge an AI browser as a browser first.** Top answer on r/browsers about Dia: *"AI
features on browsers are often gimmicky at best and invasive at worst."* On Comet: *"zero UI
improvements... not even workspaces."* On Atlas: *"I didn't find a good use case."* The AI is a
bonus. The browser has to stand on its own.

**4. Vertical tabs, confirmed by ordinary users.** "Can't go back" threads across r/browsers,
r/firefox, r/MicrosoftEdge and r/mac. The top answer to "horizontal or vertical?" is *"vertical +
group tabs."* One r/MicrosoftEdge user: vertical tabs plus sleeping tabs *"changed the game for me."*

**5. The feel matters, and that backs your design language.** Asked why they use Opera GX, the top
answer was *"I love browser customization and sound effects, it makes my browsing more alive."*
Meanwhile on the GX limiters: *"pretty much useless in my experience"* and *"PRO TIP: It isn't."*
**People stay for how it feels, not for the performance claims.**

**6. What people cannot live without**, from the "can't live without" threads: ad blocking, sync,
uBlock plus Bitwarden (58 votes), Dark Reader. Nothing exotic. The basics, done well.

**7. Arc leavers miss three things:** automatic picture-in-picture, workspaces, and uBlock. Auto PiP
is directly relevant: you want video to follow you when you switch away.

**8. Electron browsers have a reputation problem.** Vieb, used as a daily driver: *"YouTube is kinda
broken on there."* Min: *"if you use the browser for anything more than going to a safe webpage, it
won't be enough."* That reputation is mostly about security lag, which is exactly what the
two-runtime split and the patch alert are for.

---

## Workstream A: the browser itself

### The architecture

```
  WINDOWS TRAY (C#)  supervises everything, restarts what dies
        |
        +-- Aang Core (Node)         the brain, SQLite, memory
        |
        +-- Aang windows (Electron)  bubble, scroll back, panel tabs
        |
        +-- BROWSER (Electron)       its own program, its own process tree
        |      main process           tabs, address bar, permissions, downloads
        |      one view per tab       WebContentsView, sandboxed
        |
        +-- DRM WINDOW (castLabs)    allow-list only: Netflix, Prime, Crunchyroll
        |
        +-- VIDEO OVERLAY (Electron) transparent, always on top
```

**The browser is a separate program from Aang's own windows.** A bad website crashing the browser
must never take the pet and the brain down with it. The tray already supervises the Core; it
supervises the browser the same way.

### Build order

| # | Build | Borrowed | Hand-written | Weeks |
|---|---|---|---|---|
| A1 | **Hardening before any real login.** Cookie encryption on, sandbox, the security switches | `@electron/fuses` | Settings | 0.5 |
| A2 | **Tab positioning layer.** Turns "where a tab should be" into "where the view actually is", with monitor scaling and drag | Nothing exists | **All of it** | 1 |
| A3 | **Shell.** Vertical tab rail, address bar, back and forward, reopen closed tab, find, zoom | Min, Tree Style Tab's tree logic | Glue in TypeScript | 2 |
| A4 | **Never lose a tab.** Snapshots every few seconds; the same snapshot powers crash restore, sleeping tabs, and restarting for updates | Electron's history save and restore | Snapshot writer, restore | 1 |
| A5 | **Crash and hang handling.** A crashed tab gets a "this page crashed, reload" plate. Every call into a tab has a timeout, because calling a dead one hangs (tested) | Nothing | All of it | 0.5 |
| A6 | **Protection.** Ad and tracker blocking with a visible per-site pause; phishing lists on every load; downloads marked so Defender scans them; passkeys hidden | Ghostery, Phishing.Database, URLhaus | Warning page, pause UI | 1 |
| A7 | **Default browser.** Registration, the "Set default" button, link handling hardened against hostile links | Registry layout from the research | Link router, argument checks | 1 |
| A8 | **Your stuff.** Bitwarden filling, Floccus bookmarks and tabs with the Mac, one-time bookmark import | Min's Bitwarden adapter, Floccus, bookmark-parser | Wiring | 1 |
| A9 | **Everyday extras.** Downloads list, print, PDF, screen-share picker for calls, spellcheck | electron-dl | Picker, print flow | 1 |
| A10 | **DRM window.** castLabs runtime for the allow-list only, with a patch alert | castLabs | Allow-list, alert | 0.5 |
| A11 | **Upkeep automation.** Electron and castLabs upgrades flagged automatically; a monthly passkey-bridge check | Renovate or Dependabot | Config | 0.5 |
| | | | **Total** | **~10** |

### The three hardest parts, honestly

1. **A2, the tab positioning layer.** Every layout library arranges ordinary page elements, but
   browser views are not page elements. Nobody has written the piece in between. It is fiddly
   because of per-monitor scaling and redraw tearing while dragging.
2. **A4 and A5, never losing anything.** This is where a default browser lives or dies. A crash that
   loses tabs once is forgiven. Twice, you go back to Chrome.
3. **A7, link handling.** The moment Aang is the default, hostile links arrive from email and
   Discord. There is a whole known class of bugs where a link smuggles in startup instructions. It
   must be closed and tested with deliberately nasty links.

### What does not need building

Google sign-in works. Google Meet works. Ordinary video codecs ship. Site isolation is on. Unsigned
apps run. All tested on this machine.

---

## Workstream B: Aang's intelligence inside the browser

The rule from every source: **the AI is liked when you call it and hated when it barges in.** Reddit,
Hacker News and the market all agree. So Aang inside the browser is a reader and a helper you
summon, and an actor only for short, approved jobs.

### What he can do, in order of value

| Capability | How | Cost |
|---|---|---|
| **Read any page** and tell you the gist | Readability strips the page to the article, Turndown makes it about 2,000 tokens, Qwen summarises | Free, local |
| **Chat with your open tabs** | The same reader across tabs. The feature Dia measured at 40% daily use | Free for most; Claude for long comparisons |
| **Remember everything you read** | Every page you finish reading goes into a searchable index: keywords plus meaning. "What was that mage site from Tuesday" | Free. Roughly 8 to 25 MB per thousand pages |
| **Trails** | Records how pages led to each other, so a research session keeps its shape. Exports to plain Markdown | Free |
| **Mark as done** | A tab or trail can be finished. Aang marks job postings done after you apply | Free |
| **Per-site routines** | Open a job posting: offer a score. Open a WoW guide: offer the build in five lines. **Offered, never forced** | Free mostly |
| **Short actions** | Fill a form, click through a few steps, always with your approval on signed-in sites | Qwen up to 4 steps; Claude past that |

### How he sees the page

Not by screenshots. The research found a better, cheaper way, borrowed from **Vimium**, the keyboard
browsing extension: label every clickable thing on the page with a short stable code. That label
list doubles as the index the AI uses to act. "Click B7" is unambiguous, cheap in tokens, and works
for a small local model.

### Safety, unchanged and enforced in code

- **Your words set the plan.** Page text is only data and can never add a step.
- **Reading is free. Acting on a signed-in site needs you.**
- Approvals are drawn by Aang, in the carved chrome, **never inside the page area**. A routine ask is a
  small chip. A serious one, like sending or buying, is a heavy lever. They feel physically
  different on purpose, because the research shows identical prompts get clicked without reading.
- He never types a password, never reads a password field, never sees a login cookie.
- The agent drives a **separate browser profile**, never the one holding your logins.

### Tool count

Qwen makes clean tool calls with about **five tools or fewer**. So the browser gets a small shelf of
its own: list tabs, read tab, search history, open, act on a label. Not fifty.

### Build order

| # | Build | Weeks |
|---|---|---|
| B1 | Page reader and summariser | 0.5 |
| B2 | Searchable reading memory | 1 |
| B3 | The labelled-element index | 0.5 |
| B4 | Small tool shelf, chat with tabs | 0.5 |
| B5 | Trails and mark as done | 0.5 |
| B6 | Agent lane on its own profile, approval chips and lever | 1 |
| | **Total** | **~4** |

---

## Workstream C: the video player

### What changed today

**Stutter is the problem gamers actually hit.** Reddit is full of it. So the overlay is built
defensively against stutter from day one:

| Defence | Why |
|---|---|
| **Background throttling off for the overlay** | Chromium slows down windows that are not focused. Over a game, the overlay is never focused. Reddit names this exact cause |
| **A "smooth video" switch that turns hardware decoding off for the overlay only** | The most repeated fix on Reddit. Your card is already busy with WoW and the local model |
| **Hide the window fully when not in use** | A window on top of a borderless game can knock the game off its fastest display path |
| **Test with NVIDIA Instant Replay on and off** | Named repeatedly as the cause |
| **Measure, do not guess** | PresentMon with WoW running, with and without the overlay |

### The rest of the player

| Piece | How | Status |
|---|---|---|
| Transparent, always-on-top, click-through window | Electron, documented | **Tested, works** |
| Video inside it | A tiny page served from your own machine with the embed inside. Direct embeds fail with Error 153 | **Tested, works** |
| **Ghost mode and edit mode** | A hotkey flips between "clicks pass through" and "drag and resize". **Not hover**, which has known Windows bugs | To build |
| Size and position | A few snap rectangles plus free drag in edit mode. 16:9 calculated by Aang, not trusted to Windows | To build |
| Fullscreen, play, pause, volume, scrub | Aang's own controls, big enough to hit mid-fight | To build |
| Transparency slider | `setOpacity`, with the controls snapping back to full brightness on hover | To build |
| **Auto picture-in-picture** | Video in a tab follows you into the overlay when you switch to WoW. What Arc users miss most | To build |
| SponsorBlock | One request per video, skip the segments | To build |
| Twitch "is he live" | twurple | To build |
| **"Put X on"** | Code matches your words, Qwen fills in blanks, the Streaming Availability API finds where it is in Canada with a dub, the right window opens | To build |
| Marking episodes watched | Aang tells Simkl when he plays something. Covers Prime, Disney+, anywhere | To build |
| Netflix and Prime | castLabs window, not the overlay. DRM video almost certainly will not composite into a see-through window | Expected limit |

### Build order

| # | Build | Weeks |
|---|---|---|
| C1 | Overlay window, ghost and edit modes, snap sizes, stutter defences, PresentMon check with WoW | 1 to 1.5 |
| C2 | Controls, transparency slider, fullscreen, auto PiP | 1 |
| C3 | "Put X on", Twitch, YouTube, Streaming Availability, dub preference | 1 to 1.5 |
| C4 | SponsorBlock, Simkl marking, pin to the WoW window | 0.5 to 1 |
| | **Total** | **~3.5 to 5** |

---

## What this costs you

**Time:** 14 to 20 weeks of building, by my estimate.

**Claude quota:** I cannot give you a trustworthy number, and I should not invent one. What I can
give you is a way to find out cheaply: **build A1 and A2 first, then read your usage meter.** Those
two are about a week and a half of the most typical kind of work. Multiply out from there before
committing to the rest.

**Upkeep, forever:** a new Electron version every 8 weeks, castLabs monthly, filter lists daily, the
passkey bridge until it matures. This is what killed Beaker and stalls Zen. It is the real cost.

---

## The honest risks, ranked

1. **Upkeep fatigue.** The research is unanimous that small browsers die of month-six maintenance,
   not month-one features.
2. **Stutter over WoW.** Untested, and the thing gamers complain about most. C1 must be measured
   before anything else in C is built.
3. **Passkeys.** Hidden is a workaround, not a fix. More sites require them every year.
4. **Electron's reputation is earned.** Security lag is real. The two-runtime split and the patch
   alert contain it; they do not remove it.
5. **Google could start blocking Electron's sign-in.** It works today because Google does not
   recognise the name, not because Google allows it.

---

## What I would do first

Three things, in this order, before committing to the full build:

1. **C1 alone, measured with WoW running.** The overlay is the reason this browser exists. If it
   stutters and cannot be fixed, the plan changes. About a week.
2. **A1 and A2, then read the quota meter.** Gives a real cost per week before the big spend.
3. **Use it for a week as a second browser, not the default.** Note every site that breaks. That list
   decides how long Chrome stays.

Only then flip the default switch.
