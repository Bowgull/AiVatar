# Third-party notices

AiVatar (Aang and Samara) uses the following work by others. Each keeps its own licence; nothing here changes it.
Drafted 2026-11-19 from the versions in `src/Shell/package.json` and `src/Core/package.json`. Packages installed
by npm are not stored in this repo; their licence texts ship inside each package in `node_modules`.

## Samara (src/Shell)

| Component | Version | Licence | Notes |
|---|---|---|---|
| Electron | 44.7.0 | MIT | Includes Chromium and Node.js, each under its own licences (see Electron's `LICENSES.chromium.html`). |
| castLabs Electron for Content Security (`electron-drm`, castlabs/electron-releases) | 44.5.1+wvcus | MIT for the Electron code; **uncertain for the rest** | The Widevine CDM it downloads and the castLabs EVS signing service come under castLabs' and Google's own terms, not MIT. Not cleared: see `docs/LICENSE-OPTIONS.md`. |
| Ghostery adblocker (`@ghostery/adblocker-electron`, `@ghostery/adblocker`) | 2.18.2 | MPL-2.0 | Used unmodified from npm. MPL-2.0 is file-level: changes to its own files would have to be shared under MPL-2.0. |
| DuckDuckGo Autoconsent (`@duckduckgo/autoconsent`) | 16.53.0 | MPL-2.0 | Used unmodified from npm. Same MPL-2.0 file-level terms. |
| Dark Reader (`darkreader`) | 4.9.133 | MIT | |
| tldts (`tldts-experimental`) | 7.4.x | MIT | Built on the Public Suffix List (MPL-2.0). |
| ws | 8.x | MIT | |
| @electron/fuses (build tool only) | 1.8.x | MIT | |
| pixelarticons (`src/Shell/pages/art/pixelarticons/`) | | MIT, (c) 2019 Gerrit Halfmann | Licence text alongside. |
| Ad and tracker filter lists (uBlock Origin, EasyList and others) | fetched at run time | Their own (GPL-3.0, CC BY-SA 3.0 and others) | Downloaded by Samara when it starts; not stored in this repo. |

## Aang's brain (src/Core)

| Component | Version | Licence | Notes |
|---|---|---|---|
| Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) | 0.3.278 | Proprietary, (c) Anthropic PBC | Used under Anthropic's legal agreements (https://code.claude.com/docs/en/legal-and-compliance). Not open source and not redistributed here. |
| Playwright MCP (`@playwright/mcp`) | 0.0.82 | Apache-2.0 | |
| discord.js | 14.x | Apache-2.0 | |
| chrono-node | 2.10.1 | MIT | |
| unpdf | 1.8.1 | MIT | Bundles PDF.js (Apache-2.0). |
| ws | 8.x | MIT | |
| zod | 4.x | MIT | |

The pet window (`src/Body`, .NET 10 WinForms) uses no NuGet packages; .NET itself is MIT.

## Fonts

| Font | Where | Licence |
|---|---|---|
| Atkinson Hyperlegible | `assets/aang/fonts/` | SIL Open Font License 1.1 (Braille Institute) |
| Press Start 2P | `assets/aang/fonts/`, `src/Shell/pages/fonts/notes/` | SIL OFL 1.1 |
| Cinzel | `src/Shell/pages/fonts/` | SIL OFL 1.1 |
| Figtree | `src/Shell/pages/fonts/` | SIL OFL 1.1 |
| Silkscreen | `src/Shell/pages/fonts/` | SIL OFL 1.1 |
| Caveat, IM Fell English, Patrick Hand, VT323 | `src/Shell/pages/fonts/notes/` | SIL OFL 1.1 (texts alongside) |
| Special Elite | `src/Shell/pages/fonts/notes/` | Apache-2.0 (text alongside) |

OFL fonts may be bundled and redistributed with software under any licence, but may not be sold on their own.
The OFL texts for Atkinson Hyperlegible, Press Start 2P (in `assets/`), Cinzel, Figtree and Silkscreen are not in
the repo yet and should be added beside the font files.
