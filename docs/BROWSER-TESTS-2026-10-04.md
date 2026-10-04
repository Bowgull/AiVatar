# Browser tests, 2026-10-04

Run on his machine: **Windows 11 Home build 22621, Electron 44.5.1, Chromium 152.0.7977.130**.
Scratch code in the session scratchpad, not kept. Raw results in `out/*.json` there.

These settle questions the research could only guess at. Two of my own tests were wrong the first
time and were re-run correctly; both are noted below, because the wrong versions would have given
the opposite answer.

---

## Results

| # | Test | Result | What it means |
|---|---|---|---|
| 1 | Google sign-in in a plain Electron window | **PASS** | The real form, "Sign in to continue to YouTube", no block. Electron is not on Google's embedded-browser list. **A detection gap, not permission**: a Chromium bump could close it |
| 2 | Transparent, frameless, always-on-top, click-through window | **PASS** | The overlay works |
| 3 | Video playing in that window | **PASS** | YouTube, 8.03 s in, not paused, 854 px wide |
| 4 | Smart App Control | **OFF** | An unsigned `Aang.exe` runs fine. One feared blocker gone |
| 5 | Site isolation | **ON** | `chrome://process-internals` shows a Site Isolation section; renderer limit 82. A hostile cross-origin frame does not share a process with its host |
| 6 | **Passkeys, platform (Windows Hello)** | **HANGS** | See below. The worst possible shape |
| 7 | Passkeys, roaming USB key | **Blocked** | `OperationError: A request is already pending`. The hung request above poisons every later one |
| 8 | Push notifications | **ABSENT** | `AbortError: Registration failed - push service not available`, with a real VAPID key |
| 9 | Widevine DRM in stock Electron | **Absent** | `NotSupportedError`. Confirms the castLabs runtime is the only route |
| 10 | PlayReady DRM in stock Electron | **Absent** | `NotSupportedError` |
| 11 | Codecs | **H.264 yes, AAC yes, AV1 yes, HEVC no** | Stock Electron does ship the proprietary codecs, unlike stock CEF. Most video just works |
| 12 | Payment Request | **Exists, does not work** | Constructor fine; `canMakePayment()` throws `UnknownError: Renderer process could not establish or lost IPC connection to the PaymentRequest service`. **Rejects cleanly**, so a site can fall back |
| 13 | `getDisplayMedia` with no handler | **Rejects cleanly** | `NotSupportedError: Not supported`. Screen sharing needs a picker, but it fails honestly |
| 14 | Crash recovery | **Fires, does not recover** | See below |
| 15 | Google Meet, default Electron user agent | **SERVED** | No "unsupported browser" wall. One data point only |
| 16 | `navigator.share` | Absent | Minor |
| 17 | `registerProtocolHandler`, File System Access, Notification | **Present** | `Notification.permission` already `granted` |

---

## The one that matters: passkeys hang

```
isUserVerifyingPlatformAuthenticatorAvailable()  ->  false
isConditionalMediationAvailable()                ->  true     (contradicts the line above)
navigator.credentials.create({ platform })       ->  NEVER SETTLES
```

It waited **25 seconds and ignored its own 8-second timeout**. No error, no rejection, nothing for a
page's fallback code to catch. A site would simply sit there forever.

Then the next attempt, with a USB key, failed with `A request is already pending`. **One hung
request blocks every future one for the life of the page.**

This matches the open Electron issues exactly, and it is worse than a missing feature. A missing
feature lets a site say "use a password instead". A hang gives a frozen page.

**Whether this PC has Windows Hello set up could not be confirmed** (the checks need administrator
rights). It does not change the conclusion: an absent authenticator rejects immediately, it does not
hang and ignore its own timeout. The hang is the integration, not the hardware.

### Correction to my own test
The first run reported `SecurityError: This is an invalid domain`, because I served the page from
`127.0.0.1`, and a raw IP address is not a valid relying-party id under the WebAuthn spec. That was
my error, not Electron's. Re-run from `localhost`, which is both valid and a secure context, it
hangs. **The first result would have hidden the real bug.**

---

## Crash recovery: the window lives, the page is dead, and talking to it hangs

```
render-process-gone  ->  { reason: "crashed", exitCode: 2 }      fires correctly
window still open    ->  true
page content         ->  gone, and nothing restores it
executeJavaScript on the dead view  ->  HUNG until the 90 s watchdog
```

Two rules fall out, both load-bearing for a default browser:

1. **`render-process-gone` must be handled and the view reloaded by hand.** Electron will leave a
   blank window forever otherwise, which the research said and this confirms.
2. **Never `await` anything on a renderer that may be dead.** It does not throw, it hangs. Every
   call into a tab needs a timeout, or one crashed tab freezes the code that touches it.

---

## Locked video over WoW: works, through Shadow, with one switch

**Tested later the same day, and it overturns what I had told him.** I had said Prime and
Crunchyroll "almost certainly" could not play in a see-through window. He disputed it. He was right.

**The machine is a Shadow cloud PC.** Everything on it reaches him as a video stream, so "the screen"
is itself a capture. That matters for every test in this file.

castLabs Electron **44.5.1+wvcus**, Widevine module **4.10.3050.0** installed itself. Shaka Player's
public Widevine test stream, with a real licence from Shaka's licence proxy.

| Run | Window | Hardware acceleration | Decrypted and playing? | What reached his screen through Shadow |
|---|---|---|---|---|
| 1 | Normal | On | **Yes**: 345 frames, time advancing | Shadow error **S:102 "protected video that we cannot display"** |
| 2 | See-through, always on top, click-through | On | **Yes**: 355 frames, time advancing | Same block (screen copy pure black) |
| 3 | **See-through, always on top, click-through** | **Off** | **Yes**: 1,500 frames in 60 s, a steady 25 fps | **The video, playing clearly, no lag.** Confirmed by his own eyes |

**Why.** With hardware acceleration on, Chromium sends Widevine video down a DirectComposition path
flagged `DXGI_SWAP_CHAIN_FLAG_DISPLAY_ONLY`, which Microsoft documents as blocking screen grabbing.
Shadow streams by grabbing the screen, so it got nothing and showed S:102. With acceleration off,
the video is drawn like ordinary video and Shadow can stream it.

**This is Shadow's own documented fix** ([S-102 support article](https://support.shadow.tech/hc/en-us/articles/32731834359953-S-102-Shadow-has-detected-a-protected-video-that-we-cannot-display)),
not a way around the protection. The licensed Widevine module still decrypts the video, for the
subscriber, on his own screen.

**What it changes:**
- The video pop-out over WoW **can** carry Prime, Crunchyroll and Netflix, not only YouTube and Twitch.
- The DRM pop-out runs with hardware acceleration off. That only affects that one window's process,
  not WoW. Worth trying later: the narrower switch `disable-direct-composition-video-overlays`, which
  keeps acceleration for everything except the protected-video path.
- Aang's screenshots of a DRM window will be black whenever acceleration is on. Expected.

**Still to confirm with his real accounts**, at build time:
- **Crunchyroll and Prime** may play unsigned; both work in Linux Chrome, which has no signature.
- **Netflix rejects** development-signed castLabs builds (error M7121-1331). It needs castLabs'
  **free EVS production signing**, which needs a signup **in his name**.
- Quality: Prime around 720p; Netflix possibly up to 1080p; Crunchyroll unconfirmed.

The Mac stays as the fallback: he plays Shadow on his MacBook, and macOS picture-in-picture floats
over the Shadow window if anything here ever fails.

---

## Not run, and why

| Test | Why not |
|---|---|
| Writing the default-browser registry block and clicking "Set default" | Changes his system. Needs his say-so, and should be done on a throwaway Windows account so the one-shot Windows prompt is not used up |
| Adversarial protocol-handler arguments | Needs a packaged `Aang.exe` that does not exist yet |
| Teams and Zoom web | The run died partway. Worth repeating; Meet passing is a good sign but not proof |
| Windows Hello presence | Administrator rights |
| PDF form filling | Not reached |

---

## What this changes

**Better than feared:**
- Smart App Control is off, so no signing problem.
- Site isolation is on, so the sandbox story holds.
- H.264 and AAC ship, so ordinary video works.
- Google sign-in and Google Meet both work with Electron's own user agent, so the user-agent
  rewriting idea can wait. **Do not strip the token pre-emptively**: it currently costs nothing and
  pretending to be Chrome while lacking Chrome's features turns honest refusals into silent breakage.
- Nearly every missing feature **rejects cleanly**, which is what lets a website fall back.

**Worse than feared:**
- Passkeys hang, and poison later attempts. This was ranked the top blocker and it is confirmed.
- Push is genuinely absent, so any site using it for codes or alerts stays silent.

**The passkey hang has a cheap stopgap:** delete `window.PublicKeyCredential` so sites never offer a
passkey and fall back to password plus code. Ugly, one line, and it turns a frozen page into a
working login. That moves from "nice to have" to **required before daily use**.

---

# Step 6.1: measured over WoW, 2026-10-04

**This is the measurement the old plan called the one that could kill the design.** Taken on his
Shadow cloud PC with WoW running and him playing, not idling at a login screen.

**The rig:** Windows 11 Home 22621, NVIDIA RTX 2000 Ada (virtualised, through Shadow), WowB.exe.
Stock **Electron 44.5.1** for runs 2 to 4 and **castLabs 44.5.1+wvcus** for run 5, so the two builds
are the same Chromium version and the comparison is like for like. Frame data from **Intel PresentMon
2.6.0** (signature checked: Intel Corporation, valid), one 25-minute trace of 90,088 WoW frames, sliced
per run afterwards. Process and GPU counters sampled every ~8 s for 2 minutes per run. Throwaway
scripts in the session scratchpad; not kept.

**Two things to know about the numbers.** PresentMon needs administrator rights, so he approved one
UAC prompt and the trace ran unattended after that. Its `TimeInDateTime` came out exactly 4 hours
behind the wall clock on this machine; the offset was measured against the known trace end rather than
assumed, and applied when slicing.

## What it cost

| Run | WoW CPU (median) | GPU drawing the game | GPU video decode | Window CPU | Window RAM |
|---|---|---|---|---|---|
| 1. WoW alone (twice) | 21-23% | 25-32% | 0% | - | - |
| 2. Idle Electron window | 20.6% | 23.9% | 0% | **0%** | 277 MB |
| 3. A page scrolling | 21.5% | 35.9% | 0% | 2.5% | 349 MB |
| 4. YouTube, see-through, on top | 21.9% | **47.4%** | 1.9% | 2.1% | 636 MB |
| 5. Widevine, castLabs, hw accel off | 22.2% | 26.8% | 0% | 2.3% | 549 MB |
| 4b. Run 4 again, **Instant Replay on** | 20.1% | 51.3% | 2.8% | 2.9% | 651 MB |

## How evenly WoW's frames arrived

Average FPS hides stutter, so what matters is the 1% low (the worst one frame in a hundred) and
outright hitches.

| Run | frames | avg FPS | 1% low | 0.1% low | worst frame | hitches >50 ms |
|---|---|---|---|---|---|---|
| 1b. Baseline | 6,950 | 59.9 | 43.9 | 39.8 | 36.6 ms | **0** |
| 2. Idle window | 6,714 | 59.9 | 43.5 | 40.5 | 26.3 ms | **0** |
| 3. Scrolling | 7,250 | 59.9 | 43.8 | 40.7 | 26.3 ms | **0** |
| 4. Video over WoW | 6,738 | 60.2 | 43.5 | 39.3 | 37.5 ms | **0** |
| 5. DRM over WoW | 6,684 | 59.7 | 43.2 | 36.8 | 202.4 ms | 4 |
| 4b. Video + Instant Replay | 6,713 | 59.9 | 43.2 | 39.8 | **27.8 ms** | **0** |

**Runs 2, 3 and 4 are indistinguishable from the baseline.** Every difference is a few tenths of a
frame per second on the 1% low, which is less than the gap between the two baseline runs. Not one
hitch over 50 ms in six minutes of play with a window open, a page scrolling, and video playing on top.

**Run 5's four hitches all landed inside the same single second**, 14 s into the run, then 106 s ran
clean. That is the moment protected playback starts, not a cost that continues. It cost one visible
stumble of about a fifth of a second.

**NVIDIA Instant Replay changes nothing here, and the research expected it to.** Run 4 was repeated
with Instant Replay armed. It is plainly running: GPU encoding goes from 4.3% to **19.9%**, on top of
what Shadow already spends encoding his screen for the MacBook, and total GPU reaches **71%**, the
highest of any run. WoW's own CPU did not move (20.1%), and frame pacing came out **identical with zero
hitches** and a worst frame of 27.8 ms, better than the baseline's own 36.6 ms. Three things competing
for the same video hardware (Instant Replay recording, Shadow streaming, a transparent window
compositing) cost nothing measurable.

*(The registry value `DVREnabled` under `NVSPCAPS` stays unset when Instant Replay is on, so it is not
a usable check. The encoder jumping to 19.9% is the proof it was armed.)*

**His verdict, which is half the pass mark:** with the see-through video window on top, "same as
always", game and video both. On the DRM run, "everything looks great", and the picture was visible
rather than the black box Shadow gives for protected video when hardware acceleration is left on.

## The finding that changes a design choice

**Transparency costs about as much GPU as the game does. The video costs almost nothing.**

Run 4's window was see-through and run 5's was not. The see-through one pushed the GPU's drawing load
from ~29% to **47.4%**; the opaque one left it at **26.8%**, which is the baseline. Video decode was
1.9% at most in either. So the expense is Windows blending a transparent always-on-top window over the
game every frame, not playing the video.

It did not cost a single frame here, because this machine has the headroom. It is still the one real
cost found, and it sets a rule for 6.3: **the pop-out defaults to opaque, and see-through is a thing he
turns on**, not the other way round. The see-through slider (decision 40) stays; its default moves.

**Hardware acceleration being off cost far less than feared.** Decoding protected video on the main
processor instead of the GPU came to 2.3%, about the same as YouTube decoding on the GPU.

## Verdict

**6.1 passes. Phase 6 is unblocked.** Against the three conditions:

1. *An idle window costs close to nothing.* **Yes.** 0% CPU, 277 MB, WoW's own CPU unmoved.
2. *WoW's frame pacing is within noise of the baseline.* **Yes for runs 2 to 4**, to within tenths of a
   frame per second and zero hitches. Run 5 adds one cluster of hitches when protected playback starts,
   lasting one second out of 120.
3. *He says it feels the same.* **Yes**, on both the see-through run and the DRM run.

## What this does not prove

- **The test clip was small.** Run 5 used a public Shaka Widevine demo asset, not a 1080p Netflix or
  Prime stream. Decoding on the main processor gets more expensive with resolution, so 2.3% is a floor,
  not the number for real anime at full size. **Re-measure in 6.3 with a real stream.**
- **One scene, one character, two minutes a run.** A 20-player raid pull may behave differently than
  what he was doing.
- **The see-through cost was measured on a machine with headroom.** Total GPU peaked at 70% of a card
  that is already sharing itself with Shadow's own encoder.
