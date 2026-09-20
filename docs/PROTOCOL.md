# Body <-> Core protocol, version 1

Transport: WebSocket on `ws://127.0.0.1:47831/body`. The Core is the server; the Body connects and
reconnects every 1.5 s. Messages are single JSON objects with a string field `t`. Unknown `t` values are
ignored, so either side can add messages without breaking the other. The Body works on its own when the
Core is down (drag, poke, tray); it must never block on the link.

## Core to Body

| `t` | Fields | Meaning |
|---|---|---|
| `state` | `state`: idle, talk, think, nap, walk, scooter, look, hello, spin, zip | Play an animation. One-shot states return to idle. |
| `bubble` | `text`, `stream` (bool), `proactive` (bool), `who` (optional label) | Show or update the bubble. `stream: true` means more text will follow. `proactive: true` messages are held while the Body is in quiet mode. |
| `bubble.dots` | none | Show the thinking dots with an empty bubble. |
| `bubble.clear` | none | Hide the bubble. |
| `quiet` | `on` (bool) | Force quiet mode on or off, overriding the WoW-focus detection. |
| `ping` | none | Body replies `pong`. |

## Body to Core

| `t` | Fields | Meaning |
|---|---|---|
| `hello` | `v`: 1, `pid` | Sent on every (re)connect. |
| `presence` | `quiet` (bool), `foreground` (process name) | Sent when quiet mode changes. |
| `poked` | none | The sprite was clicked without dragging. |
| `moved` | `x`, `y` | The window was dragged to a new position. |
| `pong` | none | Reply to `ping`. |

## Added in M2 (chat)

Body (or any client) to Core:

| `t` | Fields | Meaning |
|---|---|---|
| `submit` | `id`, `text`, `mode` (auto, quick, smart, deep; default auto), `once` (bool) | Ask Aang something. `once` grants a single bigger-model turn while saving quota is on. |
| `stop` | `id` (optional) | Interrupt the running turn. |
| `saving` | `on` (bool) | Turn quota saving on or off (the 50% opt-in). |
| `mute` | `on` (bool) | Master mute. While it is on the Core holds unprompted messages and delivers them when it goes off. |
| `rate` | `id`, `value` (up, down, none) | Joshua rated a reply. The Core appends it, with the turn it is about, to `ratings.jsonl` for the voice review. |

Core to Body:

| `t` | Fields | Meaning |
|---|---|---|
| `ack` | `id` | Sent immediately on `submit`, before any model work. Target: within 100 ms. |
| `queued` | `id`, `position` | The message waits behind a running turn. |
| `tool` | `id`, `name`, `phase` (start, done), `label` | A short receipt line such as "checking the weather". |
| `bubble` | adds `id`, `who` (label such as "Quick") | Streamed reply text; the final message has `stream: false`. |
| `quota` | `five`, `week` (0-1), `fiveResetsAt`, `weekResetsAt` (epoch s), `level` (ok, warn, offer, saving) | Live account-level usage from the stream. |
| `consent` | `id`, `wanted` | Saving is on and a bigger model was requested; resubmit with `once: true` to allow it. |
| `error` | `id`, `message`, `next` | What failed, why, and what to do. Never an empty bubble. |

This file is updated in the same commit as any protocol change.

## Added in M4 (proactive)

Claude Code posts its own hook events to `http://127.0.0.1:47832/hook` (the WebSocket port plus one),
loopback only. The endpoint answers `204` with an empty body, because a `UserPromptSubmit` hook's stdout
would otherwise be added to that session's prompt. `tools/install-hooks.mjs` writes and removes the five
one-line curl hooks (SessionStart, UserPromptSubmit, Notification, Stop, SessionEnd) in
`~/.claude/settings.json`, touching nothing else and backing the file up first.

Aang speaks up unprompted for two things only, and never for anything else:
- **Claude Code is waiting on you** (a Notification: a permission prompt or an idle wait), at most once a
  minute per session.
- **A long turn finished** (a Stop after 60 s or more, or after it had been waiting).
- **A reminder came due**, from `set_reminder`.

While the Body is quiet (the game has focus) or muted, these are held in the Core, newest five, and delivered
in order six seconds apart once he is back. `presence` and `mute` are what tell the Core which it is; the
Body sends both on every connect.
