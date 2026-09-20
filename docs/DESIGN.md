# AiVatar: look, feel and the drawing layer

The design half of [THE-PLAN.md](THE-PLAN.md). What it looks like, how it moves, how it sounds, and how
the drawing layer works in both directions. Written 2026-09-20.

---

## 1. The drawing layer, both ways

Joshua asked for square, circle, free draw. Right - but the more valuable half is the direction nobody
usually builds.

### 1a. Aang draws (output) - "let me show you"

A click-through layered overlay across the whole desktop. Aang calls a tool and shapes appear, then fade.

| Shape | What it is for |
|---|---|
| **Ring / ellipse** | "this one" - the default, drawn around a UIA bounding rectangle |
| **Rectangle** | a region, a panel, a block of text |
| **Arrow** | "from here to there" - a flow, a drag, a reference between two things |
| **Freehand** | a scribble, an underline, a circle round three things at once |
| **Label** | a short line of text pinned to a shape, in the bubble's own type |
| **Spotlight** | dim everything except one region. For "look at nothing else but this" |

Rules that keep it from being annoying:
- **Everything is temporary.** Shapes fade after a few seconds or on the next click. Nothing persists
  unless Joshua pins it.
- **Drawn in Aang's palette**, not system red. It should look like he did it, not like an error dialog.
- **He walks to it.** The sprite moves to the annotation and points. This is the whole reason a pixel pet
  beats a chat window, so it is not an afterthought.
- **The overlay sets `WDA_EXCLUDEFROMCAPTURE`** so Aang's own screenshots never contain his own drawings.
- **Borderless only.** It cannot composite over exclusive-fullscreen games; that is a DWM limitation, not
  a bug to fix. Detect and say so rather than drawing into the void.

### 1b. Joshua draws (input) - "look at this bit"

This is the better idea and it falls straight out of the cost research. Instead of sending the whole
screen, **Joshua rings the thing he cares about and only that crop is sent.**

Hold the hotkey, the screen dims slightly, drag a box or scribble a circle, release. Aang gets a small,
precise image and the UIA text under that region - and the question is already answered before it is asked.

Why this is the right mechanic:
- A full 1080p frame is **1,560 tokens**. A 400x300 crop is about **150**. Ten times cheaper and more
  accurate, because the model is not hunting for what you meant.
- It is **explicit consent**, every time. Nothing is ever captured that he did not personally ring. That
  matches "look when relevant" without any always-watching machinery.
- It solves the DRM hole honestly: if the crop comes back black, Aang says the video is protected and
  falls back to the window title, instead of hallucinating.
- Same toolkit either way: box, ellipse, freehand, and the same renderer. One overlay, two directions.

Three ways in, all cheap: hold the hotkey and drag, right-click Aang and pick "show him something", or
paste an image into the input box.

---

## 2. Visual language

Taken from what already exists on screen - the bubble, the chip strip, the input box - and made into
rules so everything new matches.

### Palette
| Token | Value | Used for |
|---|---|---|
| Ink | `#100A22` | every surface, bubble fill, input background |
| Paper | `#F0F4FF` | body text |
| Aang cyan | `#5ADCFF` | the outline, the chip, focus, his voice |
| Grip purple | `#B278FF` | scrollbars, selection, secondary controls |
| Yes green | `#78E696` | affirmative, saving quota, good rating |
| No red | `#FF8278` | negative, over quota, bad rating |
| Warn amber | `#FFC85A` | 40% quota, waiting on you, caution |

Every surface is the same near-black. Colour only ever means something - it is never decoration. If a
thing is cyan it is Aang speaking or Aang asking.

### Shape
- **Radius 14** on the bubble, **10** on the input, **full round** on pills. Nothing square-cornered
  except deliberate annotation rectangles.
- **1.8 px strokes** for anything Aang owns. Hairlines look like system chrome; we are not system chrome.
- The bubble and its tail are **one continuous path**. This was a real bug once and the fix is now a rule:
  never compose a shape out of two shapes that have to line up.

### Type
- **Bahnschrift** throughout. Already in use, it is a Windows system face so there is nothing to ship,
  and its condensed cut fits a 232 px bubble better than Segoe.
- Body 11 pt, strip 8.5 pt, annotation labels 9 pt bold.
- Line height 16 px in the bubble. Text never re-wraps once painted; earlier lines hold still while new
  ones arrive. This is measured by an automated test, not eyeballed.

### The sprite
- 118 pre-rendered frames at 224x224, nearest-neighbour scaled. Pixel art must never be smoothed.
- Ten states: idle, look, hello, nap, think, spin, zip, talk, walk, scooter.
- **He is the status indicator.** Thinking is a state, not a spinner. Working in the background is a
  state. Waiting on you is a state. Any time a conventional app would show a progress widget, Aang does
  it with his body instead.

---

## 3. Motion

- **Under 100 ms** - anything that reacts to a click or a keystroke. Already measured and met.
- **~150 ms ease-out** - the bubble growing, a pill appearing.
- **~250 ms** - Aang walking a short distance.
- **Never animate** a thing that is trying to be read. Text arrives; the box around it does not keep moving.
- **60 fps ceiling, 0 fps floor.** The frame loop stops entirely when nothing moves. That is why he costs
  0.7% of a core, and it is a design rule as much as a performance one.
- Easing is a single ease-out curve everywhere. No bounce, no spring. He is calm; the content is not.

---

## 4. Sound

Currently none. Proposal, and it should stay this small:
- **Three cues only**: he has something to say, he needs a yes or no, a job finished.
- Short, soft, low. Nothing that cuts through a raid.
- **Silent by default while any game has focus**, obeying the same quiet rule as the bubble.
- Off switch in the tray, and the master mute covers it too.

Anything beyond three cues becomes noise in a week.

---

## 5. Surfaces, and when each one is right

| Surface | For | Not for |
|---|---|---|
| **Bubble** | an answer, a question, a receipt. Up to ~12 lines | anything with structure |
| **Input box + strip** | typing, the model chip, quota | status he has not asked for |
| **Annotation overlay** | pointing at the screen, and cropping from it | anything that needs to persist |
| **Panel** | long answers, diffs, dashboards, memory review, the trust list | quick answers |
| **Tray** | settings, hotkey, mute, Core health | anything he needs mid-task |

The rule that keeps this honest: **the bubble is for a sentence, the Panel is for a document.** A long
answer that expands to twelve lines and scrolls is the bubble failing gracefully, not the bubble
succeeding. The Panel is the fix.

### The Panel
Built on the **MCP Apps** pattern (first official MCP extension, 26 Jan 2026) so a tool result can render
real interactive UI. Same palette, same type, same radii - it should read as Aang's window, not a browser.
Opens on demand, closes when done, never sits there taking up the desktop.

First four things it holds: a long answer with markdown and copyable code; a memory review screen (what he
knows about you, with a delete on every row); the trust list (what he may do without asking, revocable);
and a job view for background work.

---

## 6. Personality, as a design constraint

The voice rules are enforced by a linter in the Core, not left to chance. They are a design decision as
much as the palette:

- Plain words, one to three sentences, answer first.
- No markdown, no emoji, no exclamation marks unless Joshua used one first.
- Never offer more help in the last sentence. The last sentence carries information.
- Read past typos and vague references without ever correcting them. "the chibi" means you.
- State only what a tool returned this turn. If he did not look it up, he does not know it.
- **Say what you actually did.** If he read a file, say so. If he could not see the screen because the
  video was DRM-protected, say that, and do not guess.

The anti-sycophancy rule belongs here too: a companion who remembers your preferences will drift toward
flattering them ([MemSyco-Bench](https://arxiv.org/pdf/2607.01071)). Aang is allowed to disagree, and the
memory guards exist so that remembering Joshua does not turn into agreeing with him.

---

## 7. What "done" looks like

A design gate, checked the same way the performance gates are - by looking, not assuming:

- Every state of every surface screenshotted and reviewed by eye, at 100%, 125% and 150% DPI.
- The bubble, input, overlay and Panel side by side: same black, same cyan, same radius, same type.
- Aang idle over WoW, over a browser, over the desktop: never a hard edge, never a white box, never focus
  stolen.
- The drawing layer over a game, a browser and a DRM video, with the honest failure messages captured.
- One unbroken pass: ask something, get an answer, ring something on screen, ask about it, get a job
  running, come back to it. Screenshotted end to end.
