# Samara security: ready-made pieces we can borrow

Researched 2026-10-14. Nothing was installed or downloaded. Stars and dates come from the GitHub API on that day.
Samara baseline: castLabs Electron 44.5.1+wvcus (Chromium 152), WebContentsView tabs with sandbox and contextIsolation, @ghostery/adblocker-electron, Dark Reader, own phishing lists (Phishing.Database, URLhaus, OpenPhish, refreshed daily), runs from source (no asar), Windows and Intel Mac, sync over Tailscale, AI agents in hidden tabs.

Scoring: **ROI = security gain / (speed cost + effort)**, each rated 1 to 5. "Zero latency" means nothing is added to the critical path of a page load.

---

## 0. The biggest finding: Samara is weeks behind on Chromium security fixes

| | Electron upstream (44.x) | castLabs (44.x) |
|---|---|---|
| Stable releases 2026-08-25 to 2026-10-14 | 17 (44.0.0 to 44.7.2) | 2 (44.1.0, 44.5.1) |
| Cadence | about weekly, often 2 or 3 a week | about monthly, in batches (Aug 4, Sep 1-3, Oct 3-5) |
| Lag behind the upstream tag it follows | n/a | 3-4 days (44.5.1: upstream 09-30, castLabs 10-03) |

- Today upstream has **44.7.2** (2026-10-14). Its notes say "Backported fixes from upstream ANGLE, Chromium, PDFium and V8". 44.7.1 moved Chromium to 152.0.7977.149. Samara does not have either.
- Because castLabs ships monthly, Samara is usually **1 to 5 weeks** behind on V8 and Blink security fixes. Normal page loads in Chromium go through exactly that code.
- castLabs is required for Widevine, which his DRM video needs, so swapping to stock Electron costs DRM. Options:
  1. **Automatic watch (do this):** poll `https://github.com/castlabs/electron-releases/releases.atom` and `https://github.com/electron/electron/releases.atom` from the existing daily blocklist job. Compare against `process.versions.electron` and `process.versions.chrome`. Show a banner as soon as castLabs has a newer patch on the same major. Also poll `gh api repos/electron/electron/security-advisories`. Five advisories were published Jul-Aug 2026, and two of them affect sandboxed popups, which matters for a browser.
  2. Watch the Chrome Releases blog (`chromereleases.googleblog.com`, Atom feed) for "exploit ... exists in the wild". When that phrase appears and castLabs has not shipped, Samara can show "engine has a known exploited bug, avoid unknown sites" and stop agents from browsing until it is patched.
  3. Upgrade the same day castLabs ships. It is `npm i electron@npm:@castlabs/electron-releases@<tag>` plus a restart, and he runs from source anyway.
- Cost: zero page-load cost, about 1 hour of work. **ROI: very high.**

---

## 1. Phishing and malware URL protection (Safe Browsing equivalents)

| Option | URL | License / terms | Status (2026-10) | How it plugs in | Speed cost | Notes |
|---|---|---|---|---|---|---|
| **Google Safe Browsing v5, Local List Mode** | developers.google.com/safe-browsing/reference | Free, **non-commercial only**, needs API key, warnings must credit Google | Current API. Methods `hashLists.batchGet`, `hashList.get`, `hashes.search`. v4 is still documented and has a migration guide | Keep 4-byte SHA-256 prefixes in memory (a Set or sorted Uint32Array). Check each top-level navigation in `onBeforeRequest`. Only a prefix hit calls `hashes.search` for full hashes | **Zero for almost every URL.** About 1 RTT only on a prefix hit, which is rare | This is the same data Chrome uses, so it has the best coverage by far. **No maintained npm library implements the local DB** (searched npm and GitHub). We have to write about 300-500 lines: URL canonicalisation, host-suffix/path-prefix expressions, list updates. `googleapis` npm has the v5 REST client only. `google/safebrowsing` (Go, Apache-2.0, 502 stars) is a v4 reference with `sbserver`, but it has had **no commits since 2019**. Read it for the canonicalisation rules and do not run it |
| Safe Browsing v5 Real-Time / No-Storage mode | same | same | current | One call per URL | **Adds latency** to every navigation and sends hash prefixes per URL | Do not use. It breaks the "no slower" rule |
| **malware-filter phishing-filter + urlhaus-filter** (curbengh) | gitlab.com/malware-filter | CC0 / MIT lists, sources keep their own terms | Live: `phishing-filter-ag.txt` was updated 2026-10-14 12:02Z and **refreshes every 12 h**. Sources: OpenPhish, PhishTank, IPThreat, URLhaus | Add the **AdGuard-syntax URLs straight to the Ghostery engine** (`fromLists`) | Zero (same engine, same lookup) | Replaces much of Samara's own blocklist code with an already-deduplicated feed. PhishTank and IPThreat are new sources for Samara |
| uBO `badware.txt` | already in Ghostery's prebuilt `adsLists` | GPL-3.0 | active | Check Samara uses a prebuilt preset that includes it | zero | Scam and badware domains. Free win if missing |
| Hagezi DNS blocklists (TIF = threat intel feeds) | github.com/hagezi/dns-blocklists | GPL-3.0 | 27.4k stars, releases daily | Adblock-syntax variants load into Ghostery, or use them through a DNS resolver | zero in the engine | TIF is large (hundreds of thousands of domains), so test memory. "TIF mini" is the light option |
| Quad9 / Cloudflare 1.1.1.2 / NextDNS (DoH) | see section 5 | free | active | `app.configureHostResolver` | ~0 (one DoH connection is reused) | A second net that also catches non-browser lookups by Chromium. Coverage is domain-only |
| Spamhaus DBL via DNS | spamhaus.org | commercial use needs a paid feed. Public resolvers are blocked | n/a | DNS query per domain | adds a lookup | **Skip**: Spamhaus refuses queries from public resolvers and it adds latency |
| Microsoft SmartScreen | n/a | no public URL-check API | n/a | Only applies through Mark-of-the-Web on downloaded files (section 7) | zero | You get SmartScreen for **downloads** for free by setting MOTW correctly |
| PhishTank direct | phishtank.org | free | Registration has been closed for years. Use it through malware-filter | — | — | Use it via malware-filter |

**Recommendation:** (a) Add malware-filter's phishing and URLhaus AdGuard lists to the Ghostery engine today. (b) Build Safe Browsing v5 Local List Mode as a weekend project. That closes the coverage gap with Chrome at zero normal latency. On a hit, show an interstitial page that credits Google.

---

## 2. HTTPS upgrade, HSTS preload, HTTPS-only

- **HSTS preload list:** it lives in Chromium `//net` (`transport_security_state_static`), so **Electron already enforces it**. The only cost is staying patched (section 0).
- **Chrome's HTTPS-Upgrades / HTTPS-First mode** lives in `//chrome` (navigation throttle plus prefs). Searching the electron/electron source for `HttpsUpgrades` finds nothing, so **Electron does not ship it.** No command-line switch turns it on.
- **Borrow instead:** implement it ourselves with existing hooks.
  - In the existing `session.webRequest.onBeforeRequest` (Ghostery already hooks this, so there is no extra IPC hop if we chain into the same handler), redirect `http://` main-frame and sub-frame requests to `https://`.
  - On `did-fail-load` with an SSL or connection error for an upgraded URL, show a "this site has no HTTPS, continue?" page. Remember the choice per host.
  - Skip the upgrade for: `localhost`, `*.ts.net` and Tailscale 100.x addresses, RFC1918 ranges, and hosts in **Brave's `https-upgrade-exceptions-list.txt`** (github.com/brave/adblock-lists, MPL-2.0, pushed 2026-10-14).
- **Mixed content auto-upgrade** of images, audio and video is in Blink and already on.
- EFF **HTTPS Everywhere** is deprecated (since 2022) because browsers now ship native HTTPS-first. Do not use its rulesets.
- Cost: zero on HTTPS sites. An HTTP-only site costs one failed TLS attempt. **ROI: high.**

---

## 3. Electron hardening tooling

| Item | URL / license | Status | What to do for Samara | Speed cost |
|---|---|---|---|---|
| **@electron/fuses** | github.com/electron/fuses, MIT | v2.1.3 (2026-06-29), active | Flip **`runAsNode`=off, `nodeOptions`=off, `nodeCliInspect`=off, `grantFileProtocolExtraPrivileges`=off** (if no page loads from `file://`). **`cookieEncryption`=on** only for a fresh profile, because it is one-way and needs code signing on macOS. Leave `wasmTrapHandlers` on, since off is slower. `embeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar` **do not fit "runs from source"** | zero (loadBrowserProcessSpecificV8Snapshot adds startup time, so skip it) |
| Caveat for "runs from source" | — | — | Fuses patch the Electron binary inside `node_modules`, so `npm install` resets them. Add a `postinstall` script that re-flips them. Fuses stop the common attack of using Samara's Electron binary as a node.exe through `ELECTRON_RUN_AS_NODE`. They do not protect the editable JS source | — |
| **Electronegativity** (Doyensec) | github.com/doyensec/electronegativity, Apache-2.0, 1,053 stars | **Not maintained.** Last release v1.10.0 (2022-12). README says "no longer actively maintaining". Paid successor: ElectroNG | Still worth **one manual run** (`npx @doyensec/electronegativity -i <src>`) as a checklist. It knows nothing about WebContentsView or newer APIs | none (offline audit) |
| Electron security checklist (electronjs.org/docs/latest/tutorial/security) | MIT | current | Check: `setWindowOpenHandler` deny by default; `will-navigate` / `will-frame-navigate` guards on UI windows; **`setPermissionRequestHandler` + `setPermissionCheckHandler` + `setDevicePermissionHandler`** on every session (default Electron grants everything, including notifications, HID, serial, USB, clipboard); validate `event.senderFrame` in every IPC handler; `shell.openExternal` only for http/https/mailto; serve internal pages over a custom `protocol.handle` scheme instead of `file://`; CSP on Samara's own UI pages; no `nodeIntegrationInSubFrames` | zero |
| CSP helpers | `session.webRequest.onHeadersReceived` for own pages, or a `<meta>` CSP | — | Strict CSP (`default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'`) on the chrome UI and new-tab page only. Never inject CSP into web pages | zero |
| Code signing | Windows: Azure Trusted Signing (about $10/mo) or self-signed for personal use. macOS: Apple Developer ID ($99/yr) | — | Since it runs from source, signing matters little except for macOS `cookieEncryption`, Keychain access groups and passkeys (`configureWebAuthn` needs a keychain access group, so a signed app) | — |
| **Patch the 2026 advisories** | GHSA-gr2m-v5gq-v685, -hq2x-r82h-9wj4 (popups lose sandbox), -j84w-jfhq-vhvj (protocol handler cross-origin reads), -9qh4-3jw8-366w (`<webview>` node in workers) | Published 2026-08-29 | Check that 44.5.1 includes the fixes (it should, since they predate 44.1). Also set `sandbox: true` on popups made via `setWindowOpenHandler` → `overrideBrowserWindowOptions` | zero |

---

## 4. Fingerprinting and tracking protection

| Piece | Source / license | How to use in Electron | Speed cost | Verdict |
|---|---|---|---|---|
| **Ghostery prebuilt lists** | `@ghostery/adblocker` MPL-2.0, v2.20.1 (2026-10-09), 1,014 stars, very active | `ElectronBlocker.fromPrebuiltFull()` = EasyList + Peter Lowe + uBO filters (2020-2024, badware, quick-fixes, resource-abuse, unbreak) + **EasyPrivacy + uBO privacy** + EasyList Cookie + uBO annoyances. `fromPrebuiltAdsOnly` **leaves out EasyPrivacy**, so check which preset Samara uses | Engine is serialised, lookups are microseconds | Make sure it is "Full" or at least "AdsAndTracking" |
| **`$removeparam`** (URL tracking-parameter stripping) | Supported in Ghostery since PR #4528. A merge bug was fixed in #5623 | Add **AdGuard URL Tracking Protection filter** (filter 17, `https://filters.adtidy.org/extension/ublock/filters/17.txt`) and/or uBO `privacy-removeparam`. This does the same job as ClearURLs inside the existing engine | zero extra | **Prefer this to the ClearURLs addon code** |
| ClearURLs rules | github.com/ClearURLs/Rules `data.min.json`, LGPL-3.0, 253 stars, last push 2026-03 | Could be applied in `onBeforeRequest`, but it is slowing down. Only use it if `$removeparam` lists miss something | tiny | Backup option |
| **Brave debounce + query-filter + clean-urls** | github.com/brave/adblock-lists/brave-lists: `debounce.json`, `query-filter.json`, `clean-urls.json`, MPL-2.0, updated daily | Debounce = skip bounce-tracking redirectors (e.g. `l.facebook.com/l.php?u=` → go straight to `u`). Apply on main-frame navigations in `onBeforeRequest` | tiny; saves a round trip on bounce links | Good borrow |
| **Third-party cookie blocking** | Chromium network switch **`test-third-party-cookie-phaseout`** (defined in `services/network/public/cpp/network_switches.h`, with feature overrides in `content/`), so it is reachable from Electron | `app.commandLine.appendSwitch('test-third-party-cookie-phaseout')` before `ready`. **Unverified in Electron 44, so test it**: an iframe on a cross-site page should get no cookies. Fallback: strip `Cookie` / `Set-Cookie` on third-party subresources in `onBeforeSendHeaders` / `onHeadersReceived` | zero (switch) / tiny (handler) | Breaks some SSO (Google sign-in iframes, Okta). Keep a per-site allow list. Storage partitioning (`ThirdPartyStoragePartitioning`) is **on by default** since Chromium 115, so leave it alone |
| **Referrer** | — | Chromium default `strict-origin-when-cross-origin` is fine. Optionally trim cross-site `Referer` to the origin (Brave does this) in `onBeforeSendHeaders` | tiny | Low gain |
| **User-Agent + Client Hints** | Electron API | Default UA contains **`Samara/x.y Electron/44.5.1`**, which is a unique fingerprint and **tells attackers the exact outdated engine**. Use `session.setUserAgent()` with the matching plain Chrome UA, and make sure `Sec-CH-UA` brands do not say "Electron" (override in `onBeforeSendHeaders` if needed) | zero | **High ROI** |
| **WebRTC IP leak** | `webContents.setWebRTCIPHandlingPolicy()` | **`default_public_interface_only`** on every tab keeps calls working and hides LAN and Tailscale IPs. `disable_non_proxied_udp` breaks normal calls. **He runs interviews and calls in the browser, so do not use it** | zero | Do it |
| Brave-style farbling (canvas/audio/WebGL noise) | brave-core (MPL-2.0) does it with **C++ Blink patches**. No JS library does it properly | A main-world preload could add canvas noise, but it is detectable, partial, and breaks sites | small | **Skip**. Low gain without engine patches |
| `--no-pings` | content switch | `appendSwitch('no-pings')` turns off `<a ping>` hyperlink auditing | zero | Free |

---

## 5. DNS over HTTPS

- API: `app.configureHostResolver({ secureDnsMode: 'secure' | 'automatic', secureDnsServers: [...] })` (Electron docs). The built-in resolver is enabled by default on macOS and **off by default on Windows**, so set `enableBuiltInResolver: true` there.
- Malware-blocking DoH templates:
  - **Quad9** `https://dns.quad9.net/dns-query`: blocks malware and phishing, nonprofit, no logging of IPs. **Best default**
  - Cloudflare `https://security.cloudflare-dns.com/dns-query` (the DoH twin of 1.1.1.2): malware blocking
  - NextDNS `https://dns.nextdns.io/<config-id>`: custom lists (Hagezi TIF etc.), free tier 300k queries/month
- **Tailscale caveat (important):** `secure` mode sends every lookup to public DoH, so **MagicDNS names (`*.ts.net`, `100.100.100.100`) stop resolving inside Chromium**. Either use `automatic` mode, sync by Tailscale IP, or do sync from Node (`net`/`https` in main, which uses the OS resolver and is unaffected). Check how Samara's sync connects before switching to `secure`.
- Speed: one long-lived HTTP/2 connection. After warm-up it is about the same as the OS resolver, and HTTPS DNS records (`enableAdditionalDnsQueryTypes`) can save a round trip. **ROI: high, 10 minutes of work.**

---

## 6. Passwords and credentials

| Piece | Source / license | Use | Cost |
|---|---|---|---|
| **HIBP Pwned Passwords range API** | `https://api.pwnedpasswords.com/range/{first5 SHA-1}`, free, no key, k-anonymity, send `Add-Padding: true` | Check on save and in a weekly audit of the synced password store. Never on page load | Off the page-load path |
| **Electron `safeStorage`** | built-in (DPAPI on Windows, Keychain on macOS) | Encrypt the synced password and cookie stores at rest. Also encrypt the Tailscale sync payload with a key that never sits in plaintext on disk | ~0 |
| **Passkeys** | Windows: Chromium calls `webauthn.dll`, so Windows Hello and phone passkeys work in Electron through `navigator.credentials` (test with `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`). macOS: **`app.configureWebAuthn({ touchID: ... })`** (added around Electron 41) with a keychain access group, which **needs a signed app**. Credentials are device-bound and not iCloud-synced | Lets him drop passwords on sites that support it | 0 |
| **Keeping secrets away from AI agents** | design, see section 9 | Agents get their **own `session` partition** (`persist:agent`) with **no synced cookies, no password autofill, no saved logins**. Login-required tasks go through a "hand off to Josh" step. Strip `Authorization` and cookies on egress from agent tabs to any host not on that task's allow list | 0 |

---

## 7. Download safety

- **Mark-of-the-Web (Windows):** Chromium only writes `Zone.Identifier` when the embedder supplies a quarantine service (`GetQuarantineConnectionCallback`). The electron/electron source has **no match** for that hook or for "quarantine" in download code, so **Electron most likely does NOT set MOTW**. **Verify:** download any file in Samara, then run `Get-Item <file> -Stream Zone.Identifier`.
  - If it is missing, add a `will-download` → `item.once('done')` handler that writes the stream: `fs.writeFileSync(path + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=<origin>\r\nHostUrl=<origin>\r\n')` (origin only, never full URLs).
  - This **switches on SmartScreen app reputation, Office Protected View and Defender's MOTW rules for free.**
- **macOS:** set `com.apple.quarantine` on finished downloads: `xattr -w com.apple.quarantine "0081;<hex unix time>;Samara;" <file>` via `execFile`, or a tiny native call. That makes Gatekeeper and XProtect check the file on first open. Same verification first, with `xattr -l <file>`.
- **Dangerous-extension list:** borrow Chromium's own `download_file_types.asciiproto` (components/safe_browsing/content/resources, BSD-3). Use it to warn on or require a click for `.exe .msi .scr .js .vbs .hta .lnk .iso .img .vhd .appref-ms .msix .ps1 .bat .cmd .jar .dmg .pkg .app`, and so on. Block automatic downloads (no user gesture) of these types.
- **Local scanning:** Windows Defender real-time protection **already scans on file write**, so an explicit `MpCmdRun.exe -Scan -ScanType 3 -File <path> -DisableRemediation` is mostly redundant. Optional for archives. AMSI is for script content in-process and does not fit downloads. On macOS XProtect only acts through quarantine, so the xattr is the whole job.
- Cost: zero during page load (all post-download). **ROI: high.**

---

## 8. Keeping Chromium patched

See section 0. Feeds to watch:
- `https://github.com/castlabs/electron-releases/releases.atom` (castLabs, MIT, 293 stars, latest v44.5.1+wvcus 2026-10-03, v45 alpha line active)
- `https://github.com/electron/electron/releases.atom` (latest v44.7.2, 2026-10-14)
- `GET https://api.github.com/repos/electron/electron/security-advisories`
- Chrome Releases blog Atom feed, to catch "in the wild" zero-days

castLabs follows a chosen upstream release in **3-4 days** but **only about monthly**, skipping the patch releases in between. Nothing published shows castLabs doing emergency out-of-band zero-day releases. Their release notes do not say either way, so treat that as unknown.

---

## 9. AI-agent safety

| Component | URL / license | Status 2026-10 | Local / speed | Indirect-injection quality | Verdict |
|---|---|---|---|---|---|
| **Architecture first: CaMeL** (Google DeepMind) | github.com/google-research/camel-prompt-injection, Apache-2.0, 406 stars | Research code, **last push 2025-06**, not maintained | n/a | Design idea: a privileged planner never sees untrusted page text. A quarantined LLM extracts data into typed values, and policies check data flow before tool calls | **Borrow the design, not the code** |
| **Agent session isolation + egress allow list** | Electron `session.fromPartition` + `webRequest` | built-in | zero | Stops the biggest harm (credential theft or data exfiltration) whatever the classifier misses | **Do first** |
| ProtectAI `deberta-v3-base-prompt-injection-v2` | Hugging Face, Apache-2.0 | stable | about 50-80 ms CPU, about 1 GB RAM | **Weak on indirect**: about 43-49% caught on planted emails at 2-5% false positives (independent test, 2026-09) | Cheap first filter only |
| Meta **Llama Prompt Guard 2** 22M / 86M | Hugging Face, **Llama 4 Community License** (gated, OK for personal use) | 2025 | 22M = DeBERTa-xsmall, a few ms on CPU via onnxruntime-node or transformers.js | 78.8% PINT (86M), but **5 of 39** planted indirect attacks caught in one test | Fast, but too weak on indirect to rely on |
| **StackOne Defender** (`@stackone/defender`, npm) | stackone.com, said to be Apache-2.0 (check the LICENSE) | 2026, active | **Node-native**, 22 MB model, about 4 ms CPU plus about 1 ms regex tier. Built to scan **tool outputs** | Vendor claims 88.7-95.9%. Not independently checked | **Best fit to trial**: same language as Samara, built for tool results |
| Qualifire **Sentinel v2** (ModernBERT-large, 0.4B) | Hugging Face, license "other", gated | 2025 | about 395M params, tens of ms on GPU | Better than DeBERTa in independent comparisons | Option if Qwen GPU time is free |
| Local LLM judge (his Qwen) | — | — | about 1-2 s per check | In the same benchmark, 4-9B local models caught 68-81% | Use only on **risky steps** (before a form submit or send), never per page |
| LLM Guard (ProtectAI) | MIT, 3.2k stars | **Archived 2026-07** | — | — | Do not adopt |
| Rebuff (ProtectAI) | Apache-2.0 | **Archived 2024** | — | — | Do not adopt |
| NVIDIA NeMo Guardrails | 7.3k stars, v0.24.1 (2026-09-16), active | Python service, heavy | adds a hop | rails framework | Overkill for Samara |
| Lakera Guard | SaaS | — | network call per check | strong | Cloud, adds latency, sends content out. Skip |
| **Snyk Agent Scan** (was Invariant **mcp-scan**) | github.com/snyk/agent-scan, Apache-2.0, 3.1k stars, v0.6.8 (2026-09-29) | active | offline? **No**: sends tool names, descriptions and skill text to Snyk's API, needs `SNYK_TOKEN` | Scans MCP servers and skills for tool poisoning | Fine as an occasional manual audit of his MCP configs. Not in the browser path |

Rules worth copying from the benchmarks: classifiers miss about half of indirect injections, so **put a human approval on every send, buy, submit, login and download** that an agent triggers. Keep agent tabs in an allow-listed, logged-out partition. Treat page text as data and wrap it in delimiters before it reaches the model.

---

## 10. Borrowable from privacy browsers

| From | Borrowable? | What |
|---|---|---|
| **Brave** (brave/adblock-lists, MPL-2.0) | **Yes, as data** | `debounce.json`, `query-filter.json`, `clean-urls.json`, `https-upgrade-exceptions-list.txt`, `brave-firstparty-cname.txt` (CNAME-cloaked trackers), `brave-social.txt`. All load into Ghostery or a small `onBeforeRequest` step |
| Brave farbling, Cromite (GPL-3.0, 8.4k stars, v153 2026-09-15), ungoogled-chromium (BSD-3, 28k stars, 155.0.8059.39-1 2026-10-08), Thorium | **No**: these are C++ patches to Chromium. Electron would need a custom Chromium build, which is not realistic | Read Cromite's patch list for ideas only. Most of ungoogled-chromium's work removes Google services that Electron never had |
| Mullvad Browser / Tor (letterboxing, uniform fingerprint) | No (Gecko) | The idea of a uniform fingerprint only works across a crowd. A single-user browser cannot benefit |
| LibreWolf / arkenfox (MIT, 12.9k stars) | Ideas only | Its checklist maps onto Chromium switches: `no-pings`, WebRTC policy, DoH, 3P cookies, referrer trimming |
| Chromium switches safe in Electron | Yes | `no-pings`; `test-third-party-cookie-phaseout` (test first). **Avoid** `disable-reading-from-canvas` and `disable-webgl`, which break sites |

---

## Ranked by ROI (security gain / (speed cost + effort))

| # | Item | Gain | Speed cost | Effort | Notes |
|---|---|---|---|---|---|
| 1 | Engine-update watcher + same-day castLabs bumps | 5 | 0 | 1 | Samara is 1-5 weeks behind on V8/Chromium fixes |
| 2 | Agent tabs in a separate logged-out session with egress allow list + human approval on sends | 5 | 0 | 2 | Biggest real-world risk |
| 3 | Plain Chrome User-Agent (hide "Electron/44.5.1") | 3 | 0 | 1 | |
| 4 | DoH to Quad9 via configureHostResolver | 3 | 0 | 1 | Mind Tailscale MagicDNS |
| 5 | malware-filter phishing + URLhaus lists into Ghostery | 3 | 0 | 1 | Every 12 h, adds PhishTank |
| 6 | Permission handlers on every session + fuses (runAsNode/nodeOptions/inspect off) | 4 | 0 | 2 | |
| 7 | MOTW / quarantine on downloads + dangerous-type gate | 4 | 0 | 2 | Unlocks SmartScreen/Gatekeeper |
| 8 | WebRTC `default_public_interface_only` + `no-pings` | 2 | 0 | 1 | |
| 9 | Ghostery Full preset + AdGuard URL-tracking (`$removeparam`) + Brave debounce | 3 | 0 | 2 | |
| 10 | Own HTTPS-upgrade with fallback | 3 | ~0 | 2 | |
| 11 | Safe Browsing v5 Local List Mode | 5 | 0 | 4 | Best coverage, have to write it |
| 12 | StackOne Defender on agent tool output + local Qwen check before risky steps | 3 | 0 for browsing | 3 | Classifiers alone miss about half |
| — | Third-party cookie switch (test), HIBP checks, safeStorage, passkeys, Electronegativity one-off run | 2-3 | 0 | 1-2 | Next tier |
| — | Skip: farbling, real-time Safe Browsing, Spamhaus DNS, LLM Guard, Rebuff, NeMo, Lakera, custom Chromium | | | | |

## Top 12 in plain English

1. Watch for castLabs/Electron engine updates every day and upgrade the same day. Samara is usually 1-5 weeks behind on Chrome security fixes (it is on 44.5.1; upstream has 44.7.2 today).
2. Run AI agents in their own logged-out session that can only reach allowed sites, and make every send, buy or login wait for Josh's OK.
3. Stop telling every website "Samara, Electron 44.5.1". Send a normal Chrome user-agent instead.
4. Turn on encrypted DNS through Quad9 (it blocks known malware domains), checking that Tailscale names still resolve.
5. Load the malware-filter phishing and URLhaus lists (updated every 12 hours, adds PhishTank) into the ad blocker Samara already has.
6. Lock down permissions (camera, mic, USB, notifications) on every tab session and flip the Electron fuses that block "use Samara as Node".
7. Mark downloaded files as "from the internet" so Windows SmartScreen and Mac Gatekeeper check them, and ask before risky file types.
8. Hide local and Tailscale IPs from WebRTC with default_public_interface_only (calls still work), and turn off link-click pings.
9. Use Ghostery's full list set plus AdGuard's tracking-parameter filter and Brave's bounce-link skipper.
10. Upgrade http links to https on their own, with a "this site has no HTTPS" fallback page.
11. Build Google Safe Browsing v5 local-list checking: Chrome-level phishing coverage with no delay on normal pages.
12. Scan what agents read with StackOne Defender (fast, runs in Node), and ask Qwen to double-check only right before risky agent actions.
