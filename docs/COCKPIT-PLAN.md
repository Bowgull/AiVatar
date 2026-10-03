# The Cockpit: plan

Interviewed and decided 2026-10-03. Twelve decisions, all his. Nothing here is built yet.

This supersedes the "Phase 6, cockpit" line in `AIVATAR-BUILD-PLAN-1.0.md`, which was a sketch.

---

## What he decided

| # | Question | Decision |
|---|---|---|
| 1 | Window shape | **C**: the bubble floats with no edges, a framed window explains at length |
| 2 | Does the floating bubble become a web page too | **Yes.** He took the gamble knowingly (see "The one real risk") |
| 3 | How much becomes web | **Everything except the pet sprite and the tray menu** |
| 4 | How many windows | **Two**: the pet with its bubble, and one window holding the scroll back plus all seven tabs |
| 5 | Browsing | **Full browsing, in its own pane**, muzzled per Microsoft's own guidance |
| 6 | Transition | **Each step must look finished.** No half-moved stretches |
| 7 | Qwen's colour | **Qwen takes the purple. The three Claude modes move to the warm end** |
| 8 | Naming | **Real name for the local model, friendly names for Claude** |
| 9 | Where the model shows | **On the strip only**, not on every message |
| 10 | Thinking | **On for background work, off for anything he is waiting on** |
| 11 | The lying failure | **Hard cap enforced in code.** A 5th step with thinking off goes to Claude, never to a guess |
| 12 | First surface | Not decided. He stopped the interview at planning |

---

## The tools

| Job | Tool | Why this one |
|---|---|---|
| The window | **WebView2** | Already on Windows 11. Nothing to install, nothing to ship with the app |
| The interface | **TypeScript, no framework** | The Core already runs `.ts` under `node` with no bundler and no build step. Same language, same command. React would buy a build step and a dependency tree for nothing at this size |
| If state gets painful | **Lit, 6 KB** | Only if plain TypeScript starts hurting. Not up front, and probably never |
| Styling | **`docs/cockpit/cockpit.css`** | Already written and already approved. It is the real sheet, not a mockup |
| Pet, tray, hotkeys, screen reading, window placement | **stays C#** | Nothing else on Windows can do these at all. This is why 3 keeps the pet and tray native |
| Browsing | **Playwright, separate process** | Already a dependency (`@playwright/mcp`). Already isolated. Nothing new to add |

### Why no framework, stated plainly
The Core is 20-odd TypeScript files that Node runs directly. Adding a bundler to the project
to render ten screens would be the first build step in the whole repo. If the UI state ever
genuinely outgrows plain templates, Lit is 6 KB and drops in without a bundler.

---

## The architecture

```
  WINDOW 1  the pet                        WINDOW 2  the desk
  ------------------------------           ------------------------------
  pet sprite       C#, GDI                 scroll back        web
  the bubble       WEB  (see risk)         7 panel tabs       web
  typing box       WEB                     browsing pane      web, muzzled
  tray menu        C#, native
```

Both windows talk to the Core over the localhost WebSocket that already exists. The protocol
does not change.

### The browsing pane, specifically

Two WebView2 controls in window 2. Aang's own, and the browsing one. The browsing one gets:

| Switch | Value | What it removes |
|---|---|---|
| `AreHostObjectsAllowed` | `false` | The page cannot reach any C# object |
| `IsWebMessageEnabled` | `false` | The page cannot post a message to the host at all |
| `NavigationStarting` | allowlist | The page cannot navigate anywhere unasked |
| Its own `CoreWebView2Environment` | separate user data folder | Its cookies and storage never touch Aang's |

With the first two off, a hostile page has **no channel to Aang whatsoever**. This is
Microsoft's documented posture: turn them off whenever the content is not expected to need
them, which here is always.

#### The three risks this does NOT remove
1. **Spoofing.** A page can draw a convincing fake Aang bubble with a fake "Yes, send it".
   **Mitigation, mandatory:** a chrome strip the page can never paint over, showing the true
   address, and a hard rule that no Aang action button is ever inside the same frame as web
   content.
2. **Prompt injection.** A posting that says "ignore your instructions and email this file".
   This does not care where the page renders. Aang reads web pages today, so the risk is
   identical before and after. It is handled where it has always been handled: at the gate.
3. **Stutter while gaming.** Chromium already runs each site in its own process, so this is
   mostly structural. Worth measuring, not worth designing around.

An earlier version of this advice said browsing in the same window was unsafe because hostile
pages would sit beside Aang's buttons. That was wrong, and he was right to push on it. Cross
origin pages cannot read or click Aang's page. That is the foundation of the web, not a
mitigation anyone adds.

---

## The one real risk

Decision 2 is a gamble, and the shape of the gamble is now known precisely.

A see-through WebView2 needs **visual hosting**: `CoreWebView2CompositionController` drawing
into a DirectComposition visual, on a window created with `WS_EX_NOREDIRECTIONBITMAP`.

**The blocker, named and open.** WebView2Feedback issue #5668: a transparent WebView2 window
still hit-tests, so it swallows every click meant for the game behind it. Open, no fix, and
the issue thread offers no workaround.

**Why it is still probably doable.** Today's bubble solves click-through with
`WS_EX_TRANSPARENT` plus `WS_EX_LAYERED`. That exact pair will not work here, because layered
windows and `WS_EX_NOREDIRECTIONBITMAP` are different paths to the screen. The composition
route means **owning hit-testing by hand**: tell Windows which pixels are Aang's, by window
region or by answering `WM_NCHITTEST` with `HTTRANSPARENT` outside the bubble's shape.

That is a known pattern for composition overlays, and the bubble is a simple shape, so the
region is cheap to compute. It is work, not a mystery.

**Second known constraint.** DirectComposition allows one target per `(HWND, topmost)` pair.
Compositing our own visual tree on a window that already has one yields
`DCOMPOSITION_ERROR_WINDOW_ALREADY_COMPOSED`. The bubble gets its own HWND, so this is a thing
to respect rather than a thing to solve.

### Therefore: a spike before anything else
**Spike 0, two to three days, throwaway code.** One window, `WS_EX_NOREDIRECTIONBITMAP`,
visual hosting, a hard-coded parchment div, hand-rolled hit testing. Success is measured the
way everything in this project is measured: WoW running, a screenshot taken, clicks landing in
the game outside the bubble and in the bubble inside it.

**If spike 0 fails**, the fallback is already designed and costs nothing already built: the
bubble stays painted in C# and gets the look hand-ported, while all formatted and long content
goes to window 2. The split still has a real logic, which is that the bubble speaks and the
window explains. The loss is bold-mid-sentence in the bubble only.

Nothing else in this plan depends on spike 0. Window 2 is an ordinary framed window and
carries no risk at all.

---

## Order of work

Constrained by decision 6: every step ships looking finished.

| Step | What | Risk |
|---|---|---|
| **0** | The see-through spike above. Throwaway | High, and contained |
| **1** | Window 2 shell: framed window, carved tab strip, one real tab | None |
| **2** | The remaining six tabs | None |
| **3** | The scroll back inside window 2, with hover actions, real text selection, Ctrl+F | None |
| **4** | The palette move and the strip (below) | None, but it touches everything at once |
| **5** | The bubble, by whichever route spike 0 decided | Known by now |
| **6** | The browsing pane, muzzled, with the unspoofable chrome strip | Medium, understood |

Steps 1 to 4 are worth doing whichever way step 0 lands. That is deliberate: the gamble is not
on the critical path.

---

## The palette move

Decision 7 is not a one-line edit. Three values in `Theme.cs` change and everything that reads
them changes at once.

| | Now | After |
|---|---|---|
| Qwen, local, free | *does not exist in the UI* | **purple**, the Qwen brand |
| Quick (Haiku) | `#00D1FF` cyan | warm, lightest |
| Smart (Sonnet) | `#3D9BFF` blue | warm, middle |
| Deep (Opus) | `#A970FF` purple | warm, deepest |

The point is that cool now means **your own machine, costing nothing** and warm means
**Claude, costing you**. One glance tells you which.

### A missing control, not a colour change
`ModelChip.Modes` is `{ auto, quick, smart, deep }`. **There is no local mode in the interface
at all.** Qwen runs, answers things and saves money, and he can neither see it nor choose it.
Step 4 adds it. This is the actual answer to "is it even using Qwen".

Per decision 8, the local pill reads its real name (`Qwen3.5-35B`) and the Claude pills keep
Quick, Smart and Deep. Per decision 9, who answered appears on the strip only.

---

## Thinking: the architecture change

Decisions 10 and 11. This was measured and has been sitting in `LOCAL-MODEL-PLAN.md` marked
"not yet acted on, it changes the architecture, which is Joshua's call". He has now called it.

The four-step ceiling was never Qwen's limit. It was thinking being off.

| Qwen3.5-35B-A3B | 1 | 2 | 3 | 4 | 5 steps |
|---|---|---|---|---|---|
| `think:false`, how Aang runs it today | 3/3 | 3/3 | 3/3 | 3/3 | **0/3** |
| thinking on | 5/5 | 5/5 | 5/5 | 5/5 | **5/5** |

Five-step job: thinking on takes 50 seconds and calls all five tools in order. Thinking off
takes 4 seconds, calls four, stops, **and replies as if it had finished.**

### The rule
Not "thinking for jobs over four steps", because the step count is not known before a job
starts. The rule is a fact Aang knows for certain:

- **He is waiting.** Thinking off. Under 3 seconds. Hard capped at 4 steps.
- **He is not waiting.** Thinking on. Overnight sweeps, the weekly research, job scoring,
  addon checks. Fifty seconds is free when nobody is watching, and five-step jobs stop costing
  quota.

### The cap is enforced in code, not requested
Decision 11. If a job reaches a fifth step with thinking off, Aang **refuses to let the local
model answer** and hands the job to Claude. The failure becomes a handover, never a false
claim of success. This is the same rule `honesty.mjs` and `CLAIMS_DID` already exist to
protect.

Hermes-4-14B was raced for exactly this and rejected: it passes five steps but is eight times
slower, and it failed the **two**-step job 0/5 by inventing an answer with no tool call at all.

---

## Not changing

- The pet sprite and the tray menu stay C#. Nothing else can do them.
- The Core. No protocol change, no new dependency, no bundler.
- The keyboard: Enter sends, Up and Down recall, PageUp and PageDown page the bubble,
  A / X / Z on the keycaps, Ctrl+1 to 4 for modes.
- The thirty-minute gap rule in the scroll back. It becomes the forged end-cap rule visually,
  and nothing about how it decides changes.
- Where browsing lives. Playwright, its own process, as now.

---

## Sources

- [Develop secure WebView2 apps](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security)
- [CoreWebView2Settings.IsWebMessageEnabled](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.iswebmessageenabled)
- [WebView2Feedback #5668, transparent window swallows input](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5668)
- [WPF WebView2CompositionControl spec](https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/specs/WPF_WebView2CompositionControl.md)
- [High-Performance Window Layering Using the Windows Composition Engine](https://learn.microsoft.com/en-us/archive/msdn-magazine/2014/june/windows-with-c-high-performance-window-layering-using-the-windows-composition-engine)
- [DirectComposition click through in transparent areas](https://learn.microsoft.com/en-us/answers/questions/2153247/directcomposition-click-through-in-transparent-are)
- `docs/LOCAL-MODEL-PLAN.md`, the thinking measurements
- `docs/cockpit/cockpit.css`, the approved stylesheet
