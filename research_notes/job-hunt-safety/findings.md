# Job scans, LinkedIn/Indeed rules and bot detection (2026-10-14)

Not legal advice. His stance: no auto-apply, every send/apply on a held lever, just using his tools to get hired.

## The rules
- LinkedIn User Agreement 8.2 bans "software, devices, scripts, robots... (such as crawlers, browser plugins and add-ons)" to scrape, and "bots or other unauthorized automated methods to access the Services" ([User Agreement](https://www.linkedin.com/legal/user-agreement)); tools risk restriction or shutdown ([Help](https://www.linkedin.com/help/linkedin/answer/a1341387), [restricted](https://www.linkedin.com/help/linkedin/answer/a1340522)).
- hiQ v. LinkedIn: scraping public pages is not hacking, but LinkedIn won on breach of contract; hiQ paid $500k ([Proskauer](https://www.proskauer.com/blog/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case)). Proxycurl sued and shut down in 2025 ([Nubela](https://nubela.co/blog/goodbye-proxycurl/)).
- Indeed D.21 bans "any automated system (bots, scrapers, spiders, AI or Agentic AI)" and automated applications; D.22.4 allows a "Permitted AI Connector" Indeed approves ([Indeed Terms](https://www.indeed.com/legal)). He already has Indeed's and ZipRecruiter's official connectors in Claude.

## Detection that applies to Aang's browser
- LinkedIn's machine learning on behaviour (bursts, regular timing, volume) is the biggest real risk ([LinkedIn Engineering](https://engineering.linkedin.com/blog/2018/09/automated-fake-account-detection-at-linkedin)).
- LinkedIn scans for 6,000+ Chrome extensions and collects device details ([BleepingComputer](https://bleepingcomputer.com/news/security/linkedin-secretly-scans-for-6-000-plus-chrome-extensions-collects-data)): Aang's browser has no job extensions, but a hidden window's device details are unusual.
- Electron's user agent says "Electron" ([is-electron](https://tessl.io/registry/tessl/npm-is-electron)); faking only that can look worse.
- No webdriver/DevTools flags when driven through Electron's own APIs (inference, untested).
- Indeed sits behind Cloudflare; Electron is real Chromium and his Mac is on a home IP: both pass. Shadow is a data-centre machine: never scan LinkedIn from it, never both machines at once.

## Tools
AIHawk (auto Easy Apply): its developer's LinkedIn was restricted. JobSpy: logged-out search, blocked around page 10 per IP. linkedin-api: private API, warns against personal accounts. browser-use/Skyvern: anti-bot only in paid clouds. Simplify: fills forms, you submit.

## Safest design, ranked
1. LinkedIn job alert emails (up to 20, [Help](https://www.linkedin.com/help/linkedin/answer/a511279)) read by the email assistant: main source.
2. Official connectors (Indeed, ZipRecruiter in Claude).
3. Aang's browser reads LinkedIn search pages only when he asks, at human pace (about 1 page per 20 to 90 s, 20 to 40 pages max, 1 or 2 scans a day: judgement, not published), on the Mac, stopping on any challenge.
4. Every apply/message/login is his.
5. Avoid scheduled hidden scans of LinkedIn on his account. Never: auto-apply, mass messages, profile crawling, captcha solving, faked fingerprints, proxies.
