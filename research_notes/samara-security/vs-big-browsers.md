# Samara vs the big browsers: security comparison

Researched 2026-10-14. Samara = castLabs ECS Electron 44.5.1+wvcus (Chromium 152), WebContentsView tabs with sandbox and contextIsolation, Ghostery adblocker, Dark Reader, own phishing/malware blocklists, Tailscale sync of tabs/cookies/logins between PC and Mac, and a local key-protected door that lets Claude/Aang drive hidden tabs. No Safe Browsing, no Web Store, engine updated by hand.

How to read this file:
- **[measured]**: I pulled the numbers myself from GitHub release/PR data or a test report PDF.
- **[vendor]**: the browser maker's own claim or marketing. Not independently checked.
- **[secondary]**: news or blog coverage. Could not confirm against the primary source.
- **[unverified]**: plausible, but I could not prove it. Test it before relying on it.

---

## 1. What the big browsers have that Samara does not get by default

### 1a. Layers Samara does NOT have

**Google Safe Browsing (Standard, Enhanced, real-time)**
- Chrome, Brave, Firefox and Safari all use Google's Safe Browsing lists:
  - Brave proxies the lookups so Google never sees your IP. https://support.brave.app/hc/articles/15222663599629-Safe-Browsing-in-Brave
  - Safari has proxied them through Apple since iOS 14.5. https://www.theregister.com/2021/02/12/apple_safe_browing/
  - Edge uses Microsoft Defender SmartScreen instead. https://learn.microsoft.com/en-us/deployedge/microsoft-edge-security-smartscreen
- Chrome's Enhanced Protection adds real-time checks, and since Chrome 137 an on-device Gemini Nano scam classifier. Google says Enhanced users are "twice as safe" as Standard users [vendor]. https://blog.google/technology/safety-security/how-were-using-ai-to-combat-the-latest-scams/
- **Electron has no Safe Browsing.** The maintainers refused it: "Safe Browsing is only meaningful for browsers, Electron is designed for desktop apps so we will not integrate it." https://github.com/electron/electron/issues/4440
- Distro builds compile it out entirely (`safe_browsing_mode=0`). https://github.com/electron/electron/issues/43191
- Samara's replacement is Phishing.Database + URLhaus + OpenPhish blocklists. They are free community feeds. As far as I could find, no independent test has measured them against Safe Browsing.

**HTTPS-First / "Always Use Secure Connections"**
- Chrome 147 (April 2026) turned this on for Enhanced Protection users. Chrome 154 (October 2026) turns it on for everyone: it tries HTTPS first and warns before loading plain-HTTP public sites. https://blog.google/security/https-by-defau/ and https://cyberinsider.com/chrome-will-default-to-https-for-all-public-sites-starting-october-2026/
- This feature lives in Chrome's browser layer, not in the content layer that Electron ships. **I believe Samara gets none of it [unverified].**
- Test: open `http://http.badssl.com/`. If it loads with no warning, Samara has no HTTPS-First.

**Local Network Access (LNA): protection for localhost and the home network**
- Chrome 142 (28 Oct 2025) blocks or prompts when a public website tries to reach localhost or your LAN. https://developer.chrome.com/blog/local-network-access and https://www.dynamsoft.com/web-twain/docs/faq/chromium-142-local-network-access-issue.html
- Electron declined to wire LNA up "until it's stabilized". In June 2026 a VS Code developer wrote that LNA is "currently hard disabled in Electron". https://github.com/electron/electron/issues/48655
- **This matters directly for Samara.** Any website open in a Samara tab can send requests to the local AI-control door on 127.0.0.1. Nothing at the browser level stops it. The access key is the only defence. DNS rebinding and CSRF-style tricks are the threats to design against: check the `Host` and `Origin` headers, and never accept a key in a URL or query string.
- Electron's permission system makes this worse. By default Electron "will automatically approve all permission requests" unless you install a handler. https://www.electronjs.org/docs/latest/tutorial/security
- Since August 2026, handlers can also receive `local-network-access` and 25 other permission types that were previously undocumented. https://github.com/electron/electron/pull/53170

**Automatic, vendor-pushed security updates**
- Chrome has shipped a security update every week since Chrome 116. Google estimated fixes would arrive "3.5 days sooner on average". https://security.googleblog.com/2023/08/an-update-on-chrome-security-updates.html
- Firefox shipped fixes for the Pwn2Own Berlin 2025 exploits the same day. https://securityaffairs.com/178064/security/mozilla-fixed-zero-days-demonstrated-at-pwn2own-berlin-2025.html
- Samara has no auto-update. See section 2 for the measured lag.

**App-Bound Encryption for cookies and passwords (Windows)**
- Chrome 127 (July 2024) ties the cookie key to Chrome's own identity through a SYSTEM service. Other programs running as the same user, such as infostealers, can no longer just decrypt it with DPAPI. https://www.bleepingcomputer.com/news/security/google-chrome-adds-app-bound-encryption-to-block-infostealer-malware/
- **Electron's cookie encryption is off by default** (the `cookieEncryption` fuse defaults to Disabled). https://www.electronjs.org/docs/latest/tutorial/fuses
- I found no sign that Electron implements App-Bound Encryption [unverified].
- Samara syncs cookies and logins between two machines. An infostealer on either one gets both machines' sessions.

**Exploit mitigations in the main process**
- Electron's own build file sets `is_cfi = false` and `enable_cet_shadow_stack = false`. The file's comment explains why: Chromium "do[es] not run V8 in the browser process", while Electron does, because Node lives there. https://github.com/electron/electron/blob/main/build/args/all.gn
- Chrome enables CET hardware stack protection on Windows. https://security.googleblog.com/2021/05/enabling-hardware-enforced-stack.html
- The result: Electron's most privileged process runs a JIT engine plus Node, with fewer hardware mitigations than Chrome's browser process. This is structural. A small app cannot fix it.

**Password leak checks**
- Chrome Password Checkup: https://9to5google.com/2019/08/15/google-password-checkup-leak-detection-will-soon-be-built-into-chrome/
- Firefox breach alerts through Monitor / Have I Been Pwned: https://support.mozilla.org/en-US/kb/breach-alerts-privacy-panel
- Electron has nothing like this. Samara would have to build it, for example with the HIBP k-anonymity range API.

**Download protection**
- Chrome sends risky downloads to Safe Browsing (and Enhanced Protection can deep-scan them). Samara has none of this.
- Mark of the Web (the Windows tag that triggers SmartScreen) does appear to get applied by Electron's download path. A Claude Desktop (Electron) bug report shows every download getting a Zone.Identifier. https://claudeissues.com/issue/82743-bug-files-downloaded-via-claude-desktop-are-always-tagged-with-mark-of-the-web-z
- So Windows SmartScreen still checks executables you open. Verify this on Samara with one download [unverified for Samara].

**Certificate revocation**
- Chrome pushes CRLSets through its component updater.
- Firefox turned on CRLite for all desktop users in Firefox 137 and dropped OCSP for DV certificates in Firefox 142. https://hacks.mozilla.org/2025/08/crlite-fast-private-and-comprehensive-certificate-revocation-checking-in-firefox/
- Electron has no component updater for CRLSets. castLabs adds a `components` API, but only for Widevine. https://github.com/castlabs/electron-releases/issues/169
- **Samara probably has stale or no revocation checking [unverified].** Test with `https://revoked.badssl.com/`.

**Certificate Transparency enforcement**
- Chrome enforces CT using a log list it refreshes through the component updater.
- Firefox began enforcing CT on desktop in 135/136. https://wiki.mozilla.org/SecurityEngineering/Certificate_Transparency
- Electron links `//components/certificate_transparency`. An old Electron issue shows CT errors being raised. https://github.com/electron/electron/issues/11997
- I could not confirm whether Electron 44 keeps the log list fresh [unverified].
- Test with `https://no-sct.badssl.com/`. Expect "should fail".

**Fingerprinting defences**
- Brave randomises canvas and audio ("farbling"), with a different value per site and per session. https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/
- Safari 26 turns on Advanced Fingerprinting Protection for all browsing. https://9to5mac.com/2025/09/01/security-bite-my-favorite-privacy-features-in-ios-26/
- Firefox 145 roughly halves the number of trackable users [vendor], but only in Private Browsing and ETP Strict at launch. https://blog.mozilla.org/en/firefox/fingerprinting-protections/
- Firefox's full Resist Fingerprinting mode is opt-in. Tor and Mullvad ship it.
- Electron behaves like plain Chromium, so it has no fingerprinting defence. Ghostery blocks known fingerprinting scripts by list only.

**Bounce-tracking mitigation and third-party cookie blocking**
- Chrome deletes bounce-tracker state, but only for users who have blocked third-party cookies. https://privacysandbox.google.com/protections/bounce-tracking-mitigations
- Google dropped its plan to remove third-party cookies in 2025. https://jentis.com/en/?p=14436
- Electron allows third-party cookies by default, like Chrome. Samara would need to block them per session, for example by refusing third-party Set-Cookie in `webRequest` or through cookie settings [unverified for the exact API].

**Extension store review**
- This is a mixed blessing. See 1c.

### 1b. Layers Samara DOES inherit from Chromium

**Renderer sandbox and context isolation**
- These are on by default since Electron 20 and 12. https://www.electronjs.org/docs/latest/tutorial/security
- Samara also sets them explicitly on WebContentsView.

**Strict Site Isolation (site-per-process)**
- Electron's browser client returns `true` from `ShouldEnableStrictSiteIsolation()`. Its comment reads "Enable site isolation. It is off by default in Chromium <= 69." https://github.com/electron/electron/blob/main/shell/browser/electron_browser_client.cc
- Chrome has done this on desktop since Chrome 67. https://www.chromium.org/Home/chromium-security/site-isolation

**V8 sandbox / memory cage**
- Electron turned on sandboxed pointers in Electron 21, matching Chrome 103. https://www.electronjs.org/blog/v8-memory-cage
- Chrome added the V8 sandbox to its bug-bounty programme in 2024. https://www.securityweek.com/google-adds-v8-sandbox-to-chrome/

**GPU and network service processes**
- These come from Chromium's content layer, so Electron uses the same process model.

**Storage partitioning and DNS-over-HTTPS**
- Electron gets Chromium's state partitioning, which lives in content/blink. Chrome-level policy decisions on top of it are not included.
- DoH is available through `app.configureHostResolver`. It is not on by default. Electron issue #49225 reports a DoH bug in `resolveHost`. https://github.com/electron/electron/issues/49225

**Mark of the Web on downloads**
- Probably inherited (see the download item in 1a).

### 1c. Extension security: where Samara's choice is a real win

- Chrome Web Store review did not stop the RedDirection campaign. 18 extensions trusted by Google and Microsoft turned malicious through silent updates and reached 2.3 million users (Koi Security, July 2025). https://www.theregister.com/2025/07/08/browser_hijacking_campaign/ and https://cyberinsider.com/malicious-chrome-and-edge-extensions-infect-2-3-million-users/
- The Cyberhaven extension was hijacked through a phished developer account on 25 Dec 2024 and stole session cookies. https://techcrunch.com/2024/12/27/cyberhaven-says-it-was-hacked-to-publish-a-malicious-update-to-its-chrome-extension
- Samara loads no third-party extensions; Dark Reader and Ghostery are pinned npm code. That removes one of the most-abused attack routes of 2024-2025.
- **Caveat 1:** Electron's own extension APIs had a 2026 bug. CVE-2026-70602: extension tab and scripting APIs crossed session boundaries. https://vulert.com/vuln-db/CVE-2026-70602
- **Caveat 2:** If Samara ever loads Chrome extensions, that bug and the whole extension risk come back.

---

## 2. Electron's patch lag, and castLabs' lag on top of it

### Background

- Electron ships a new major version every 8 weeks, uses even-numbered Chromium versions, and supports the latest 3 majors. https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- So Electron stable usually runs an older Chromium than Chrome, and gets fixes as cherry-picked backports:
  - Electron 44.0.0 shipped on 25 Aug 2026 with Chromium 152.0.7977.54.
  - Chrome stable was already on 153 by 8 Sep 2026.
  - privacytests.org lists Chrome 155.0 in its 7 Oct 2026 update. https://privacytests.org/
- Electron's 2026 backport PRs list upstream commit hashes, not CVE numbers. Example: #53769, "cherry-pick 32 changes", merged 9 Sep 2026. https://github.com/electron/electron/pull/53769
- **So you cannot check from the release notes whether a given zero-day is fixed.** The Chromium version string is also misleading: 44.x reported "152.0.7977.76/.78" while carrying later backports. https://github.com/electron/electron/releases

### Known-exploited Chromium zero-days and when they reached upstream Electron and castLabs ECS [measured]

Data comes from `gh` queries of electron/electron PRs and releases and castlabs/electron-releases releases on 2026-10-14.

| CVE (exploited ITW) | Chrome fix | Upstream Electron release with fix | castLabs ECS release | Lag Electron / ECS |
|---|---|---|---|---|
| CVE-2025-2783 (Mojo sandbox escape) | 134.0.6998.177, 25 Mar 2025 | PRs #46303-5 merged 26-27 Mar → 35.1.2 / 34.4.1 / 33.4.8 on 27 Mar | 35.1.2+wvcus, 29 Mar | +2 d / +4 d |
| CVE-2025-4664 (Loader data leak) | 136.0.7103.113, 14 May 2025 | PRs #47173-6 merged 20-21 May → 35.5.0 on 28 May, 34.5.7 on 29 May | 35.5.0+wvcus, 30 May | +14 d / +16 d |
| CVE-2025-5419 (V8) | 137.0.7151.68, 2 Jun 2025 | PRs #47352-5 → 36.4.0 / 35.5.1 / 34.5.8 on 4 Jun | 36.4.0+wvcus, 8 Jun | +2 d / +6 d |
| CVE-2025-10585 (V8) | 140.0.7339.185, 17 Sep 2025 | V8 cherry-pick ec6c18478382 (#48338) → 38.1.2 / 37.5.1 / 36.9.1 on 17 Sep. CVE match inferred from timing. | No ECS until 38.2.0+wvcus on 3 Oct | 0 d / +16 d |
| CVE-2026-85046 (V8) | 152.0.7977.82, 3 Sep 2026 | 44.2.0 on 4 Sep carried 10 backports. **Could not confirm the fix is among them.** | ECS 44.1.0 on 3 Sep (too early); next ECS 44.5.1 on 3 Oct | ? / about +30 d |
| CVE-2026-87491 (V8) | 153.0.8010.36, about 8 Sep 2026 | Backport PR #53769 (9 Sep, includes M152 V8 fixes) → 44.4.0 on 15 Sep. CVE match unconfirmed. | 44.5.1+wvcus on 3 Oct | about +7 d? / about +25 d |

- The 2026 Chrome zero-day list and dates come from https://thehackernews.com/2026/09/chrome-v8-zero-day-exploited-in-wild.html and https://www.helpnetsecurity.com/2026/09/04/google-chrome-zero-day-cve-2026-85046/ [secondary].
- The listed 2026 zero-days are CVE-2026-2441, -3909, -3910, -5281, -11645, -85046 and -87491. That is 7 by THN's count; most outlets say 6 as of 4 Sep.
- 2025: BleepingComputer counted 8 by December 2025. https://www.bleepingcomputer.com/news/security/google-fixes-eighth-chrome-zero-day-exploited-in-attacks-in-2025/

### Takeaways

1. **Upstream Electron is usually fast for exploited bugs:** 0-2 days in three of the four measurable 2025 cases. One case took 14 days. (A separate 2025 case, CVE-2025-6554, gave no PR hit, so I could not measure it.)
2. **castLabs ECS used to follow within 1-4 days** of each upstream release (March-July 2025 data). **Since about August 2025, castLabs releases roughly once a month,** in the first week:
   - 2025: 4 Sep, 3-5 Oct, 4-7 Nov, 2-3 Dec
   - 2026: 8 Jan, 4-6 Feb, 4-6 Mar, 5 Apr, 7-10 May, 7 Jun, 2-4 Jul, 4-6 Aug, 31 Aug-3 Sep, 3-5 Oct

   So **yes, castLabs' cadence is now much slower.** A zero-day fixed by Chrome right after an ECS drop can wait about 25-30 days.
3. castLabs' README promises security updates only on a "BEST-EFFORT BASIS". https://github.com/castlabs/electron-releases
4. **Samara is already behind today.** It runs ECS 44.5.1 (upstream 30 Sep). Since then upstream Electron has shipped:
   - 44.7.0 (7 Oct): about 55 backported fixes in #54657 and #54666
   - 44.7.1 (13 Oct): Chromium 152.0.7977.149
   - 44.7.2 (14 Oct): 28 more fixes, including a Mojo/ipcz sender-trust fix in #54898

   None are in an ECS build yet. Expect the next ECS around early November, based on the pattern [inference].
5. Manual updates add lag on top of the castLabs lag. A real example from another app: a project pinned to Electron 43.1.0 fell 3 months and 14+ backport batches behind. https://github.com/builtbygio/chevron/issues/411
6. The wider ecosystem problem is real:
   - Ox Security found Cursor and Windsurf exposed to 94+ known Chromium bugs. https://www.bleepingcomputer.com/news/security/cursor-windsurf-ides-riddled-with-94-plus-n-day-chromium-vulnerabilities/
   - USENIX Security 2024 found many apps on old Electron versions. https://www.usenix.org/system/files/sec24summer-prepub-120-ali.pdf

---

## 3. Known security failures of small, custom, Electron and AI browsers

### Electron and niche browsers

- **Beaker Browser, CVE-2020-12079 (CVSS 10).** Beaker did not use context isolation, so prototype pollution of Electron's internal IPC gave a full sandbox escape and code execution. https://nvd.nist.gov/vuln/detail/CVE-2020-12079
  - Lesson for Samara: keep contextIsolation on everywhere, including internal pages.
- **Min browser, CVE-2024-25677 (8.8).** Local `file://` pages were not given unique origins, so they could read other local files. Fixed in 1.31.0. https://releasealert.dev/github/minbrowser/min/cves
  - Lesson: turn off the `grantFileProtocolExtraPrivileges` fuse if Samara never serves `file://` pages. https://www.electronjs.org/docs/latest/tutorial/fuses
- **Electron itself, 2026:**
  - CVE-2026-70607: `window.open()` features were applied without an allowlist. Exposed apps that do not use `setWindowOpenHandler`.
  - CVE-2026-70602: extension APIs crossed sessions.
  - https://www.mend.io/vulnerability-database/CVE-2026-70607/ [secondary]
- **Arc Boosts, CVE-2024-45489.** Misconfigured Firebase rules let anyone reassign a Boost's creatorID, which pushed attacker JavaScript into a victim's browser without them visiting anything. Fixed within about a day (25-26 Aug 2024). Arc later turned off JavaScript in synced Boosts and moved off Firebase. https://www.eva.ac/blog/arc/ and https://nvd.nist.gov/vuln/detail/CVE-2024-45489
  - **This is the closest analogue to Samara's sync.** A sync channel that can push data or code into the other machine is a remote-control channel. It needs auth and validation on both ends, even over Tailscale.
- **Opera "MyFlaw" (Jan 2024).** A forgotten Opera subdomain page with no CSP could reach a high-privilege native API (Opera My Flow) and run files on Windows and Mac. https://thehackernews.com/2024/01/opera-myflaw-bug-could-let-hackers-run.html
  - Lesson: internal privileged APIs exposed to web origins are dangerous. That describes Samara's AI door too.

### AI / agentic browsers

**Perplexity Comet**
- Brave showed (reported 25 Jul, disclosed 20 Aug 2025) that "Summarize this page" fed page text to the model mixed in with the user's request. A hidden Reddit comment got the agent to take the user's email, read a Gmail OTP and send it out. Brave said Perplexity's fix was incomplete. https://brave.com/blog/comet-prompt-injection/ and https://www.theregister.com/2025/08/20/perplexity_comet_browser_prompt_injection/
- Follow-up (21 Oct 2025): near-invisible text inside screenshots was read as instructions. https://brave.com/blog/unseeable-prompt-injections/
- CometJacking (LayerX): a crafted URL makes the agent pull Gmail and Calendar data and send it out base64-encoded. Perplexity answered "no security impact". https://thehackernews.com/2025/10/cometjacking-one-click-can-turn.html
- Guardio "Scamlexity": Comet bought from a fake Walmart store using autofilled card details, and typed bank credentials into a phishing page. https://thehackernews.com/2025/08/experts-find-ai-browsers-can-be-tricked.html

**OpenAI ChatGPT Atlas**
- LayerX found a CSRF that writes instructions into ChatGPT's persistent memory, so they carry across devices. https://thehackernews.com/2025/10/new-chatgpt-atlas-browser-exploit-lets.html
- NeuralTrust: a prompt disguised as a URL in the omnibox gets run as a trusted command. Same source.
- LayerX also measured anti-phishing: Atlas blocked 5.8% of 100+ live attacks, against Chrome 47% and Edge 53% [secondary, vendor test].
- OpenAI's response (22 Dec 2025) is RL-trained automated red-teaming plus adversarial training [vendor]. https://openai.com/index/hardening-atlas-against-prompt-injection

**Opera Neon**
- Hidden HTML made the assistant send the user's email address to a third party. Reported 14 Oct 2025 and fixed the same day. Opera rated it low-risk. https://brave.com/blog/prompt-injection-flaw-opera-neon/

**Dia (The Browser Company)**
- Publishes layered controls: it blocks links the model generates (a common exfiltration route) and requires review before actions [vendor]. https://diabrowser.com/security
- One High (7.5) bulletin, fixed in v1.6. https://diabrowser.com/security/bulletins

**Brave Leo agentic mode (Dec 2025, opt-in Nightly)**
- Runs in a separate profile with no main-profile cookies.
- Blocks non-HTTPS pages, Safe-Browsing-flagged sites and internal pages.
- A second "alignment checker" model never sees raw page content.
- Brave itself says these "do not eliminate risks such as prompt injection" [vendor]. https://www.privacyguides.org/news/2025/12/12/brave-adds-experimental-agentic-ai-browsing-feature/

**Claude for Chrome / Claude in Chrome**
- Pilot (Aug 2025): attack success 23.6% with no mitigations, 11.2% with them [vendor]. Simon Willison called 11.2% still "catastrophic". https://www.anthropic.com/news/claude-for-chrome and https://simonwillison.net/2025/Aug/26/piloting-claude-for-chrome/
- GA post (26 Aug 2026), against professional red-team attacks [vendor]:
  - No added safeguards: Opus 4.5 at 17.6%, Opus 5 at 3.8%.
  - With probes plus the action classifier: newer models at 0%, "Fable 5" at 0.3%.
  - Defences: an attack-library training set, injection probes on tool results, and a classifier that blocks off-task actions.
  - https://claude.com/blog/claude-in-chrome-generally-available
- Separate model benchmark (Gray Swan, Nov 2025): a single strong injection beat Opus 4.5 4.7% of the time, rising to 63% with 100 attempts. https://simonwillison.net/2025/Nov/24/claude-opus/

**What this means for Samara's AI door**
- Every one of these attacks applies to Samara if Claude or Aang reads web content in a logged-in session.
- The proven mitigations are:
  1. Run the agent in a **separate session/partition with no real cookies** (Brave's approach).
  2. **Block exfiltration routes:** no model-generated links, no auto-navigation to new domains (Dia's approach).
  3. **Human confirmation for anything that sends, buys, posts or logs in.**
  4. Treat all page text, including OCR'd screenshots, as untrusted data.
  5. Keep the door's key out of any page-reachable context.

---

## 4. Independent rankings, 2025-2026

### AV-Comparatives anti-phishing (250 live phishing URLs per round, browsers tested alone) [measured from the PDFs]

| Browser | 2025 Q1 | Q2 | Q3 | Q4 (Nov) | 2025 total | Mar 2026 |
|---|---|---|---|---|---|---|
| Avast / Norton Secure Browser | 94% | 91% | 84% | 85% | 89% | 89% |
| Microsoft Edge (SmartScreen) | 73% | 71% | 68% | 65% | 69% | 78% |
| Mozilla Firefox | 70% | 72% | 76% | 74% | 73% | 76% |
| Google Chrome (standard Safe Browsing) | 70% | 63% | 50% | 41% | 56% | 77% |
| Opera | 45% | 53% | 72% | 74% | 61% | 74% |

- Every browser had 0 false alarms.
- Sources: https://www.av-comparatives.org/wp-content/uploads/2025/11/phishing_comp_Q4-2025.pdf and https://www.av-comparatives.org/wp-content/uploads/2026/04/phishing_comp_Q2-2026.pdf
- **What this tells us:**
  - Even Safe Browsing misses 20-60% of fresh phishing.
  - Paid-AV-backed browsers do best.
  - Brave and Safari were not tested.
  - A browser with only community blocklists (Samara) has not been tested. It would likely do worse than Safe Browsing on brand-new phishing [inference], because lists like OpenPhish and Phishing.Database update slower than Google's real-time checks.

### privacytests.org (desktop, default settings, updated 2026-10-07) [measured]

Pass counts per section, parsed from the site HTML. https://privacytests.org/

| Section | Brave | Chrome | Edge | Firefox | Safari | LibreWolf | Mullvad | Tor | Ungoogled |
|---|---|---|---|---|---|---|---|---|---|
| State partitioning (27) | 27 | 17 | 17 | 27 | 22 | 26 | 25 | 23 | 20 |
| Tracking cookie protection (19) | 19 | 0 | 13 | 19 | 19 | 19 | 19 | 19 | 19 |
| Tracker content blocking (19) | 19 | 4 | 6 | 5 | 0 | 19 | 19 | 3 | 3 |
| Tracking query parameters (23) | 23 | 0 | 0 | 0 | 0 | 23 | 23 | 18 | 0 |
| Fingerprinting resistance | pass | fail | fail | fail | pass | pass | pass | pass | fail |
| DNS privacy (11) | 2 | 2 | 2 | 3 | 3 | 3 | 11 | 11 | 0 |
| HTTPS (5) | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 | 4 |

- Caveat 1: the site's founder works at Brave, but runs the site independently. https://privacytests.org/about
- Caveat 2: "unsupported" counts as not passed in my tally.
- **Samara would likely score close to the "Ungoogled"/Chrome column [inference]** on partitioning, cookies and fingerprinting. It would score better on tracker blocking (Ghostery) only for list-covered trackers.

### Other rankings

- I found no NSS Labs-style comparative test of browser exploit resistance for 2025-2026. NSS Labs closed in 2020.
- Pwn2Own results show how fast each vendor patches, not which browser is more secure.

---

## 5. Honest verdict

### Can a small Electron browser credibly claim "more secure than Chrome/Firefox/Brave/Safari"?

**No, not as a general claim.** The engine is Chromium, but older and patched later. Samara loses the browser-layer protections Google, Mozilla, Apple and Brave add on top:
- Safe Browsing
- HTTPS-First
- LNA
- App-Bound Encryption
- CRLSet/CRLite revocation
- password leak checks
- fingerprinting defences

It also adds a Node-powered privileged main process with CFI and CET turned off.

The big vendors also run bug bounties, 24/7 security teams, and fuzzing at Google/Mozilla scale. A one-person project cannot match that.

### Where Samara can genuinely be better (narrow, defensible claims)

1. **No third-party extensions.** This removes the RedDirection/Cyberhaven class of attack completely.
2. **Strict permissions.** Deny-by-default permission handlers can be stricter than any big browser's defaults, as long as they are actually written. Electron's default is allow-all.
3. **Built-in tracker blocking.** Ghostery out of the box beats Chrome, Edge, Firefox and Safari on tracker-blocking tests. Brave already does the same.
4. **Less attack surface by design.** Fewer features, no sync to a vendor cloud, no vendor telemetry, no ads and no accounts.
5. **Local-only AI, if built that way.** An agent with no cloud memory (unlike Atlas's CSRF-poisonable memory) and a separate cookie-less session would be a stronger design than Comet's was in 2025.

### Where it is structurally weaker, and what closing each gap would take

| Gap | Fix |
|---|---|
| Patch lag (castLabs now monthly) | Watch upstream Electron security releases and Chrome "exploit exists in the wild" notices. When one appears, rebuild with the newest ECS, or switch to upstream Electron when DRM isn't needed. Better: lobby castLabs or check their cadence monthly. Consider an auto-update path you control. |
| No Safe Browsing | Use Google Web Risk (commercial) or Safe Browsing v4 Update API (non-commercial only; must refresh within 30 minutes). https://developers.google.com/safe-browsing/v4/usage-limits. Keep community lists as an extra layer, not the only one. |
| No LNA / localhost exposure | Door accepts only a secret header, never a query param; checks `Host` = 127.0.0.1 and an allowed `Origin`; rejects all browser-originated requests. Optionally block page requests to loopback/RFC1918 in `session.webRequest`. |
| Permission default = allow | `setPermissionRequestHandler` and `setPermissionCheckHandler` denying all except an explicit list, per session. |
| No HTTPS-First | Upgrade http→https in `webRequest.onBeforeRequest`, with an interstitial on failure. |
| Cookie/login theft and sync | Turn on the `cookieEncryption` fuse. Store synced secrets in OS keychain / safeStorage. Sync must be authenticated end-to-end, not "trusted because Tailscale". |
| Revocation / CT | Test with badssl.com. If missing, add a cert verification callback with your own checks, or accept and document the gap. |
| Fuses left at Electron defaults | Turn off `runAsNode`, `nodeOptions`, `nodeCliInspect` and `grantFileProtocolExtraPrivileges`. Turn on `embeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar`. |
| AI prompt injection | Separate partition for agent tabs. Confirmation gates on send/buy/login. No agent-generated outbound links. Treat page text and OCR as untrusted. |
| No fingerprinting / bounce defences | Block third-party cookies per session. Accept that fingerprinting parity with Brave/Safari isn't realistic. |

---

## 10-line plain-English verdict

1. Samara cannot honestly claim to be "more secure than Chrome, Firefox, Brave or Safari". It is the same Chromium engine, just older and patched later.
2. Since late 2025 castLabs ships about once a month, so a Chrome zero-day can sit unpatched in Samara for 3-4 weeks. Chrome takes days.
3. Samara is already behind today: about 80 security fixes landed upstream after the 44.5.1 build it runs.
4. It has no Google Safe Browsing. Free blocklists are untested and likely catch less fresh phishing, and even Chrome only blocked 41-77% in AV-Comparatives tests.
5. Electron's defaults are weak: every permission is allowed, cookie encryption is off, and localhost protection is switched off. That last one matters for Aang's door.
6. Samara is genuinely better in a few narrow ways: no extension store (a top attack route in 2024-25), built-in tracker blocking, and no vendor telemetry.
7. The AI-driving feature is the biggest new risk. Every AI browser (Comet, Atlas, Opera Neon) was tricked by hidden text on web pages.
8. The fixes that work: give the AI its own logged-out session, require your OK before it sends, buys or logs in, and lock the local door tight.
9. Cookie and login sync means a virus on either computer steals both, so encrypt it and authenticate it end to end.
10. Fair claim: "a private, lean browser with sensible hardening". Not "safer than the big ones". Keep a mainstream browser for banking.
