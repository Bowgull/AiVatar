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
