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

Later milestones add `submit`, `chip`, `quota`, `stop`, `queue` and attachment messages; this file is
updated in the same commit as any protocol change.
