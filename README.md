# aang 🐉

lil pixel companion who lives on my desktop.

🚧 still building. rough edges are mine 🙂


**what he does**
- chats w/ me in a speech bubble. first words show up in about half a second
- keeps my reminders, even after a restart
- watches my claude code sessions & pokes me when one's stuck or waiting on me
- knows the time and the weather. will tell you straight up he can't see himself lol
- runs quiet next to a game without eating my whole computer

**samara, his browser 🌐**
aang got his own browser so claude can do web stuff for me without touching my real one.
- claude gets its own tabs, grouped in my tab list, w/ a big STOP key
- claude shows me its plan before it starts, and i can untick a site or tell it what to change
- per-site rules from a little shield button. bank & money sites are just never opened
- syncs between my mac and my other machine
- every big version is named after a character. we're on gojo right now ^_^


**what i did**
i planned it, designed how he looks & talks, set the rules for when he speaks up, and tested every piece before moving on. nothing moved forward until it passed a real test. ai tools wrote the code, i was the very picky boss 🙂

**built with** claude agent sdk, typescript, electron, c#


*full build plan & every decision live in `docs/`. the original technical notes are below.*

---

## under the hood

The new standalone Aang desktop companion. Start with docs/PLAN.md; every decision and its evidence is in docs/DECISIONS.md.
