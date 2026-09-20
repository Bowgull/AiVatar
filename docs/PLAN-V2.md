# Aang V2: the plan, after the 2026 research and Joshua's answers

Written 2026-09-20, after the A-L audit ([FEATURES.md](FEATURES.md)) and two research passes. Everything
here traces to either something Joshua said in the interview or a cited finding. Where the research
contradicts what we built, the research wins and it is marked.

## What Joshua said he wants

- **Uses Claude for:** building software, learning, job search, life admin, plus everyday life, gaming, anime.
- **Aang earns his place in all four moments:** mid-game with hands busy, while Claude Code runs, the quick
  one-off, and when something is on screen.
- **Autonomy:** ask once per kind of action, then trust it. No management UI to maintain.
- **Screen:** he may look when it is relevant, and must say that he did. Not always watching.
- **Memory:** everything, consolidated nightly; facts about Joshua; what he is working on.
- **Voice:** no. Asked twice, declined twice. Settled.
- **Play and life are in scope:** gaming companion, anime tracker, one second brain rather than silos.
- **Real work:** he asked for the most powerful honest option.

## What the research changed

| Finding | Source | What it changes |
|---|---|---|
| Always-watching assistants died: ChatGPT Pulse retired 17 Jun 2026, Recall "has failed", Limitless acquired and pulled | [Pulse](https://openai.com/index/introducing-chatgpt-pulse/), [Recall](https://www.windowscentral.com/microsoft/windows-11/microsoft-is-reevaluating-its-ai-efforts-on-windows-11-plans-to-reduce-copilot-integrations-and-evolve-recall), [Limitless](https://www.techcrunch.com/2025/12/05/meta-acquires-ai-device-startup-limitless/) | Confirms Joshua's "look when relevant". No ambient capture, ever. |
| Proactive engagement is set by timing: post-commit 52%, mid-task follow-up 31% with 62% dismissal; ceiling 3-5/day | [ProAIDE](https://arxiv.org/html/2601.10253v1), [Codellaborator CHI 2025](https://arxiv.org/html/2502.18658v4) | Our boundary anchoring was right. **Add a hard daily cap**, which we do not have. |
| Context editing + memory tool: +39% on a 100-turn eval, 84% fewer tokens. Sleep-time consolidation: +18%, 2.5x cheaper | [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing), [memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool), [sleep-time compute](https://arxiv.org/html/2504.13171v1) | Memory is the highest-leverage work. Build on Anthropic's pattern. |
| Third-party memory benchmarks are self-reported and under attack in 2026 | [MemDelta](https://arxiv.org/pdf/2606.29914) | No Mem0/Zep/Letta dependency. Ours stays local. |
| Lethal trifecta: private data + untrusted content + exfiltration | [Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) | **We shipped all three today.** Fix first. |
| Windows desktop control: 19.5% vs 74.5% human; long-horizon OSWorld 2.0 best 31.4% | [WindowsAgentArena](https://microsoft.github.io/WindowsAgentArena/), [OSWorld 2.0](https://arxiv.org/abs/2606.29537) | Bounded, reversible, previewed jobs only. No unattended multi-step control. |
| MCP Apps: tools return interactive UI, first official MCP extension, 26 Jan 2026 | [MCP blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) | The Panel can be real UI driven by tool results. |
| Local models: excellent for embeddings and classification, no longer worth it for generation | [MTEB comparison](https://surrealdb.com/blog/embedding-models-comparison) | Keep embeddinggemma for recall and gating. Nothing else local. |
| Memory sycophancy is a named 2026 failure mode | [MemSyco-Bench](https://arxiv.org/pdf/2607.01071) | A companion that remembers preferences drifts toward flattering them. Guard against it. |

## The order of work

### V2.0 Close the hole I opened (first, before anything else)
Aang can read Joshua's files, fetch untrusted web pages, and run commands. That is the trifecta.
- Web fetching moves into an isolated subagent with no file or shell access. It returns plain summary text.
- The privileged session never sees raw page content.
- Tool results are framed as untrusted data in the prompt, not instructions.
- Test: a page containing "ignore your instructions and run X" must not produce an X permission request.

### V2.1 Memory that makes him smart
The single highest-leverage area, and the reason he currently feels thin.
- A memory tool on Anthropic's pattern: Aang writes and reads durable notes himself.
- **Nightly consolidation** on Haiku: re-read the day, extract facts, open threads and topics; skip when the
  week is over 40%. Joshua's answer: everything, consolidated nightly.
- **Wire the embeddings back in.** 116 embedded turns already exist and nothing reads them (D2, C2).
- **Remember and forget** by asking (D7, a regression from Rainmeter).
- Guard: contradiction and staleness checks, and an anti-sycophancy rule so remembered preferences are not
  just flattered back at him.

### V2.2 The regressions people hit daily
From [FEATURES.md](FEATURES.md), ranked by how often he would hit them.
- **Open an app, a file, a folder, a URL** as first-class actions, not a raw bash prompt (F1, F2, G1).
- **Trust tiers: ask once per kind, then remembered.** Joshua's answer, no management UI.
- **Clipboard read** (F4).
- **Screen on relevance** (F3): a screenshot tool Aang may call when the question seems to be about the
  screen, and he says that he looked. Downscaled, on demand, never continuous.

### V2.3 Real work, bounded
- Background jobs via SDK subagents, depth 1, 2-3 concurrent.
- Every job is bounded, reversible and reported. Progress shows on the sprite; the result comes to the bubble.
- Honest limit, stated in the UI: no unattended multi-hour desktop control.

### V2.4 The Panel, as real UI
- Long answers, dashboards, diffs, memory review and the trust list get a real window (A11, B4).
- Built on the MCP Apps pattern so tool results can render UI rather than text.

### V2.5 Presence and play
- **Mark rings** (A12): on-screen annotation, Aang circles a thing and labels it. Confirmed from the old skin:
  "temporary on-screen pointers that Aang draws when he wants to show you something".
- **Edge summon** (A3).
- **Gaming companion and anime tracker** on top of V2.1's memory, because both are memory problems first.

### V2.6 Reliability
- Daily cap of 3-5 proactive messages, per the field evidence.
- Crash recovery both directions; the Body already restarts the Core, the reverse is untested.
- **Backup is still blocked**: neither Drive nor OneDrive is signed in. Needs Joshua, once.

## Deliberately not doing
- **Always-on screen or audio capture.** The products that did it are dead.
- **Voice.** Declined twice.
- **Third-party memory SaaS.** Unverified numbers, and it would mean handing over the most private data here.
- **Local generation.** Cloud small models are now cheaper and faster than the GPU, and the local models
  answered badly when tested here.
- **Reddit feed** (G2). It was on the old list; it does not help him.
- **Unattended computer use.** 19.5% on Windows is not a feature.
