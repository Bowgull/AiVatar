# Aang feature audit: the A-L list, against the app that exists now

The A-L list was written at 12:52 on 2026-09-20 and describes the **Rainmeter Aang**. That Aang was
retired at 16:00 the same day. Everything below is re-checked against the **new standalone app**, so a
tick here means it works in the app Joshua is running now, not that it once worked in the skin.

**Legend:** OK done and tested in the new app · PART partial · NO not built in the new app ·
GONE worked in Rainmeter, lost when it was retired (a regression) · DROP deliberately dropped, with the reason
· BLOCK blocked on something outside the code

Counted 2026-09-20 after the capability work: **23 OK, 9 PART, 14 GONE, 9 NO, 5 DROP, 3 BLOCK.**

## A. Presence and UI
| | Feature | Then | Now |
|---|---|---|---|
| A1 | Sprite with idle/walk/talk/think/nap states | partial | **OK** all ten states, screenshotted |
| A2 | Loaded and running on startup | done today | **OK** starts with Windows, starts its own Core |
| A3 | Edge-trigger summon (hover the screen edge to reveal) | partial | **GONE** the AangEdge skin was retired; the hotkey replaced it |
| A4 | Reply bubble | cramped, 34 chars | **OK** rebuilt: wraps, grows, "...v" expands to 12 lines with a scrollbar |
| A5 | Streaming replies | Claude path only | **OK** streams on every reply |
| A6 | Tier indicator (which brain answered) | not started | **OK** the model chip shows and sets Auto/Quick/Smart/Deep |
| A7 | Quota dial | not started | **OK** gauge in the input box, numbers behind a click, 40%/50% rule |
| A8 | Thinking/busy state | not started | **OK** dots within 100 ms, tool receipts, elapsed |
| A9 | Visible during fullscreen games | not possible | **DROP** borderless only; quiet while WoW has focus |
| A10 | Option chips / plan-approve UI | backend only | **OK** as the yes/no permission question, which is a real decision |
| A11 | Link chips to guide pages | done | **GONE** no Panel exists in the new app |
| A12 | Screen-pointing rings (Mark) | done | **GONE** not ported |

## B. Interaction
| | Feature | Then | Now |
|---|---|---|---|
| B1 | Typed input with typo tolerance | Levenshtein | **OK** Claude reads his typos; the voice prompt says so explicitly |
| B2 | Deterministic commands: open apps, settings | done | **GONE** only via Bash behind a yes/no, which is heavy for "open firefox" |
| B3 | Conversational replies | done | **OK** |
| B4 | Long answers to a guide page + chip | done | **GONE** no Panel; long answers expand in the bubble instead |
| B5 | Notifications, reminders, timers | untested | **OK** survive a restart, fire late if the Core was off, live-tested |
| B6 | Sound cues | unverified | **NO** |
| B7 | Voice in and out | dropped | **DROP** Joshua declined |

## C. Routing and models
| | Feature | Then | Now |
|---|---|---|---|
| C1 | Tier 0 regex fast path | done | **DROP** Claude is the voice; a regex layer would answer in the wrong voice |
| C2 | Tier 1 semantic cache | calibrated | **GONE** the embeddings are kept but nothing reads them |
| C3 | Tier 2 local model | done | **DROP** the local models answered badly; retired as voices |
| C4 | Tier 3 Claude | done | **OK** |
| C5 | Device profile by game state | measured | **PART** quiet mode knows about WoW; no model changes by game state |
| C6 | Haiku/Sonnet/Opus routing | not started | **OK** Auto routes, and the chip overrides |
| C7 | Quota-blown fallback | done | **PART** saving mode keeps to Quick; no local fallback exists any more |
| C8 | Trained embedding router | not started | **NO** |
| C9 | Local pre-compression before Claude | not started | **NO** |
| C10 | In-game local to Claude escalation | not started | **DROP** follows from C3 |

## D. Memory
| | Feature | Then | Now |
|---|---|---|---|
| D1 | SQLite + FTS5 full text | done | **OK** search_memory, with stopwords and bm25 |
| D2 | Embeddings and semantic recall | 116 turns | **GONE** the table is carried over; nothing queries it |
| D3 | Fact extraction | partial | **NO** |
| D4 | Idle consolidation | wired | **NO** |
| D5 | Contradiction and fact aging | not started | **NO** |
| D6 | Off-machine Brain backup | biggest risk | **BLOCK** neither Drive nor OneDrive is signed in on this machine |
| D7 | Explicit remember and forget | done | **GONE** he cannot tell Aang to remember something |
| D8 | Episodic timeline | schema only | **NO** |

## E. Co-learning
| | Feature | Then | Now |
|---|---|---|---|
| E1 | Topic clustering | done, 15 topics | **GONE** |
| E2 | Curiosity detection | tested | **GONE** |
| E3 | Spaced resurfacing | logic tested | **GONE** Joshua chose "session status and reminders only", so this needs his say-so to come back |
| E4 | Weekly reflection | works | **GONE** same |
| E5 | Learning journal UI | not started | **NO** |
| E6 | WoW combat-log analysis | deferred | **DROP** deferred by Joshua |

## F. Desktop
| | Feature | Then | Now |
|---|---|---|---|
| F1 | App launching | done | **GONE** possible through Bash with a yes/no, but there is no clean "open X" |
| F2 | Path-validated file and folder open | done | **GONE** same |
| F3 | On-demand screenshot and vision | done | **GONE** he cannot show Aang his screen |
| F4 | Clipboard read | untested | **GONE** |
| F5 | Window and focus awareness | not started | **PART** the Body knows the foreground process; Aang is never told |
| F6 | Power mode with an approval gate | untested | **OK** rebuilt as the permission question, live-tested both ways |
| F7 | Mouse and keyboard automation | must refuse in WoW | **NO** and it should stay off until asked for |

## G. Browser and web
| | Feature | Then | Now |
|---|---|---|---|
| G1 | Open URLs | done | **GONE** only via Bash with a yes/no |
| G2 | Reddit feed | done | **GONE** |
| G3 | Web search | via Claude | **OK** WebSearch and WebFetch, live-tested |
| G4 | Local page fetch | not started | **OK** WebFetch does it, and it costs no local model |
| G5 | Browser automation via CDP | not started | **NO** |

## H to L
| | Feature | Then | Now |
|---|---|---|---|
| H1 | Document ingestion and local RAG | unfed | **NO** |
| I1 | Repo and coding work | via Claude | **OK** Read/Glob/Grep freely, Bash and Write behind a yes/no |
| I2 | Job search workflows | Brain file only | **NO** |
| J1 | Morning brief | blocked | **BLOCK** Google auth |
| J2 | Calendar and email | blocked | **BLOCK** Google auth |
| K1 | Quota accounting | done | **OK** live from the stream, with the 40/50 rule |
| K2 | Routing decision log | debug.txt | **OK** turns.jsonl records lane, timings, tools, lint flags |
| K3 | Version control | done | **OK** its own git repo, committed per milestone |
| K4 | Crash and degradation handling | partial | **PART** the Body restarts the Core and survives it being gone; the reverse is untested |
| L1 | Prompt-injection defenses | done | **PART** tool output is not yet treated as untrusted in the prompt |
| L2 | Control-line whitelist | done | **OK** the protocol ignores anything it does not know |
| L3 | Secrets never in Brain | policy only | **PART** still policy only |

## The regressions, in the order they are worth fixing
Everything marked GONE worked before and does not now. Ranked by how often Joshua would hit it:

1. **F1, F2, G1 open an app, a file, a folder, a URL.** Daily. Today it needs a yes/no on a raw command.
2. **D7 remember and forget.** He cannot tell Aang to keep something.
3. **F3 screenshot and vision.** He cannot show Aang what he is looking at.
4. **F4 clipboard.** "what do you make of this" after a copy.
5. **D2, C2 semantic recall and the cache.** The embeddings are sitting in the database unused.
6. **A3 edge summon**, **A11/B4 the Panel and link chips**, **A12 Mark rings**.
7. **E1 to E4 co-learning.** Only with Joshua's say-so: it means Aang speaks up more, which he restricted.
