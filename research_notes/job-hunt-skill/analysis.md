# The job-hunt skill vs the Aang browser (2026-10-14)

Read from the PC copy (`~/.claude/skills/job-hunt`, dated 2026-10-01). The Mac copy was edited today by his session (Aang browser first, ask before Chrome); otherwise assumed the same.

## What the skill does
Five jobs: sweep (14 boards x 52 lane keywords, LinkedIn as 13 OR-groups x 2 pages), screen (title, geography, pay, years, then the description), apply (Ashby, Greenhouse, Lever, BambooHR, Rippling, Easy Apply; Workday stops), resume/LinkedIn/interview prep, log (pipeline file, coverage grid, Drive mirror). Aang handoff: shortlist.json, drafts.json, answers-approved.json, applied.json.

## What it uses from Claude in Chrome, and where Aang's browser stands
| Need | Chrome extension | Aang browser today | Gap |
|---|---|---|---|
| Pick his browser, never [friend]'s ([id]) | list/select browser | Only his machines | Better |
| Read pages | get_page_text/read_page/find | read (states, values), find, changes | Better |
| LinkedIn search cards | li_extract.js parses main.innerText (new UI has NO job-id links) | jobs/collect look for job links and card ids | **Gap: add a text parser like li_extract** |
| Bulk board sweeps | board_loop.js: same-origin GET fetch loops in one tab per board, paced, 429 backoff | None (no page scripts) | **Gap: a built-in paced sweep tool (GET only, board presets from boards.md, block detection)** |
| Parallel tabs | one tab per board | 6 pages per session | **Raise for sweeps (12)** |
| Typing into React forms | click + computer type + Tab | type (insertText) + verify | Same, verified after |
| Custom dropdowns, typeaheads, radios by label | JS clicks on [role=option] | select (native + custom), click, verify | Mostly covered |
| Read back every field before submit | JS reading input.value | read gives value + state per control | Covered; add a one-call form check |
| Resume upload | un-hide input + file_upload | **None** | **Gap: upload a file from his job-hunt folder only, asked every time** |
| Cross-origin Greenhouse embeds | use the direct embed URL | frame words + address, open it | Same approach |
| LinkedIn "safety/go" apply links | URLs blocked from tool output | hrefs come back whole | Better |
| CAPTCHA at the end of BambooHR | Josh clicks it, tab left open | A security-check page stops the whole session | **Conflict: on application forms, report "needs Josh" and keep the tab; only stop the session on job boards** |
| Leave a filled form for Josh | his own Chrome tab | hidden tab; double-click in the tab list makes it his | Tell the skill |
| Confirmation screenshot | screenshot | picture (marks optional) | Same |
| Gmail, Drive, Indeed, ZipRecruiter | connectors | unchanged | None |

## Plan
1. LinkedIn text-card parser (from li_extract.js), Easy Apply and salary flags.
2. browser_sweep: paced same-origin GET searches for the boards in boards.md, card presets, 429/"Security Check" backoff then stop, coverage per keyword.
3. Upload a file (only from his job-hunt folder; asked every time).
4. One-call form check: every field, label, value, required, invalid message.
5. CAPTCHA on an application form: "needs Josh", tab kept, session not stopped; boards still stop.
6. Page limit 12 for sweeps.
7. Rewrite the skill's chrome-extension.md as aang-browser.md and point SKILL.md at it (shown to him first).
