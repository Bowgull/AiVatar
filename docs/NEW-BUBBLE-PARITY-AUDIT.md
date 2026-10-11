# New bubble vs old Aang: what got lost (audit, 2026-10-11)

Read from the code only, nothing run live. PW = src/Body/PetWindow.cs, BV = src/Body/BubbleView.cs, bjs = src/Shell/pages/bubble.js, main = src/Shell/src/main.ts, core = src/Core/src/core.ts.

## Root cause

With AANG_NEW_BUBBLE=1, the pet hands every message to the Electron bubble and returns (PW:639-651). The types handed off are `bubble`, `bubble.dots`, `bubble.clear`, `tool`, `permission`, `fact.ask`, `backup.ask` and `consent`. None of the old notification code runs for any of them:

- holding the message while WoW has focus
- the icon over his head
- the glow burst and the ambient glow
- the sounds
- the hidden and mute checks
- sliding out from the dock

BubbleView.Show and ShowDots also draw nothing in new mode (BV:368, 440), so every line the pet says itself is gone too.

Sheet 13 already described the fix and it was never built: the pet does its glow and sound first, then hands off the words, and bubble.js holds messages while in a game. The plan row at FINAL-AANG-BUILD.md:1551 ("stays C#, nothing to rebuild") is wrong.

## Lost or different

1. **Sounds.**
   - Files: assets/aang/sfx/needs-you.wav (for blocking messages) and done.wav (for finished work).
   - They play while quiet (WoW in front), with backoff {0, 20, 45, 90} s, so up to 4 times until he acts.
   - At the desk there is no sound, only the marker and glow. Mute stops them.
   - Status: MISSING (PW:705-706, 1966-2043).
2. **WoW-themed notifications.**
   - Three tiers of icon over his head: gold speech bubble (news), terracotta tick (done), white-blue "!" quest mark (needs you).
   - The icon pops in, then bobs.
   - The glow is a silhouette outline that snaps out, flickers for 650 ms, holds for 4 s, then pulses slowly until he acts.
   - When docked he peeks out 90 px; when standing he waves.
   - Status: MISSING (PW:2473-2591).
3. **Claude Code waiting or finished.**
   - Hooks POST to 127.0.0.1:47832; the Mac posts over Tailscale with a key.
   - Clicking the bubble brings Claude forward on this PC: WORKS (bjs:1245 → PW:628).
   - "That Claude window is closed now" (the `bubble.focus.failed` reply): MISSING.
   - The bold terracotta clickable "Claude" link styling: MISSING (the `link` field is ignored, bjs:1078).
   - Mac: clicking the held icon sends `claude.front host:mac` to the Mac's /front listener. MISSING, because the held icon never exists in new mode.
4. **Timing.**
   - Reply formula and the 60 s for long replies: same.
   - Expanded and scrollback clocks: different.
   - Hover: pauses the hold on any message and restarts it fully on leave. Different.
   - Asks: the old ones timed out (permission 120 s, fact 180 s, backup 180 s, consent 60 s). New asks never time out, and the brain's 120 s auto-no is never sent to the Shell, so a stale ask stays on screen.
   - Short pet lines (notes, errors, "Got it."): MISSING.
5. **Dismissing.**
   - Old: clicking the bubble dismissed it, or stopped a reply in progress. New: clicking doesn't dismiss.
   - Old: Esc was a global hotkey while expanded. New: the bubble can't take focus, so Esc does nothing.
   - Click outside to reset: MISSING.
   - The pet's own click-outside tuck likely counts a click on the Electron bubble as "outside". UNTESTED.
6. **Keys.**
   - Old: ask buttons always shown. New: also always shown, now with A/X/Z keycaps and hold levers.
   - Copy on hover only (the thumbs were removed 2026-10-04). Sheet 13 and plan 6.12 still say "copy and rate".
7. **Queueing and holding.**
   - Old: in WoW nothing popped over the game; a message became icon + glow + sound and the text showed when he came out. New: MISSING. Messages he asked for pop straight over WoW.
   - The bubble's `quiet` variable is never set (nothing sends quiet or mute to the Shell), so the brain-down card also shows over WoW.
   - Clippy rule (once he hides Aang, never come back unprompted; asks auto-no): MISSING in the Shell.
   - Failed turn ("My brain did not answer", error lines, queued position): MISSING.
   - A reply that arrives while an ask is open probably leaves the ask's keys live under the reply text.
   - The brain still holds unasked messages while quiet, muted or hushed (core:2531, 2502).
8. **Position.**
   - Old: a message while docked slid him out first. New: MISSING, so the bubble appears beside the tucked head.
   - The 45 s auto-tuck can't see the Electron bubble, asks or typing box, so he may tuck mid-ask. Likely broken.
9. **Other recorded decisions now off.**
   - The glance (500 ms look at the balloon), built 2026-10-11, lives in ShowBubble, which never runs in new mode.
   - Pet notes: mute, model, hotkey, first-dock hint, hellos, crash message, "Running on your MacBook".
   - Memory aang-wow-forever.md: "the docked icon and sound system already exists. Don't re-litigate solved UX." That system is off.

Check first on the real desktop:
- the auto-tuck and click-outside tuck against the Electron bubble;
- the bubble beside a tucked head;
- a reply arriving over an open ask.

## His decisions (2026-10-11)

- Restore ALL of it, exactly as before, in the new bubble.
- Click a message: like before. It dismisses; a Claude message brings that session forward on the PC or the Mac; while he's still typing, a click shows the rest.
- Esc AND clicking elsewhere both dismiss. Esc is only taken while a message is showing and he is NOT in a game.
- Keys show ONLY on hover, for every Aang message. A question shows just his words until hover; the "!" icon over his head says he's waiting.
