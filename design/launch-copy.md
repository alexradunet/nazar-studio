# Nazar — Launch Copy

Companion-first. Plain-spoken. Never hype. Source of truth: `identity.md`.

---

## Show HN

**Title:** Show HN: Nazar – a self-hosted AI companion that lives on your box and grows with you

**Body:**

Hey HN,

I've been building Nazar — a personal AI companion you run on your own hardware.

The idea: instead of a cloud service that knows you, you have a local agent that actually
*grows* with you. Every new skill you teach it (via a git-gated suggest→approve loop) becomes
a "new eye of the nazar" — a new domain it watches. Sounds whimsical; the mechanics are
boring in the best way: a Pi terminal session, a local llamafile model (LFM2.5 by default),
Markdown memory files indexed by node:sqlite FTS5, and Pi-native skill files under skills/.

What it gives you today:
- A terminal companion installed as one Pi package on any Linux box
- Local-first: the local model is the default; frontier models are manual opt-in
- Durable Markdown memory you can grep, edit, and version in git
- Life-tracking (journal, diet, sport) through plain vault tools
- Git-gated self-evolution: Nazar can propose and add skills; you approve the PR

No container, no GPU required, no cloud account. One command: `pi install npm:pi-nazar-studio`.

Named after the *nazar* — the watchful blue eye that wards the evil eye (deochi). It grows a new
head for every skill. The design system is called *Basm* (fairy tale). Yes, I'm Romanian.

Repo: https://github.com/alexradunet/nazar-studio
Feedback welcome — especially on the git-gated self-evolution flow, which is the most
interesting (and most fragile) part.

---

## Mastodon / Fediverse (~500 chars)

Shipping Nazar: a self-hosted personal AI companion that runs on your own box.

It remembers what matters in plain Markdown you own, grows new skills over time (approved by
you in git), and answers from a local model by default — your data stays yours.

Named for the *nazar*, the watchful blue eye that wards the evil eye (deochi). Each skill it learns
is a new eye. The design system is called Basm (fairy tale).

AGPL-3.0, one install script, no GPU required.

https://github.com/alexradunet/nazar-studio

#selfhosted #localAI #FOSS #AI

---

## LinkedIn (~250 words)

I've been working on something quietly for a while — excited to share it publicly.

**Nazar** is a self-hosted personal AI companion: an always-on assistant that runs on your
own hardware, remembers what matters in a Markdown vault you own, and grows smarter over time
as you teach it new skills.

A few things that make it different:

**Local by default.** It answers from a local model (llamafile, LFM2.5) so your personal
data never leaves your box unless you deliberately switch to a frontier model for a specific
task. The privacy guarantee is structural — not a setting.

**Grows with you.** When Nazar notices a gap in what it knows, it can propose a new skill.
You review the change in git and approve it. That's it — no silent self-modification. Each
approved skill is described as "a new eye of the nazar" — a new domain the one companion
now watches.

**Plain files you own.** Memory is Markdown. Skills are Markdown. The repo is the system.
You can grep it, version it, and move it.

It's AGPL-3.0, no GPU required, one install script on any Linux box.

The name comes from the *nazar* — the watchful blue eye that wards the evil eye (deochi). The
design system is called *Basm* (fairy tale in Romanian). Built in Brașov.

Would love feedback from anyone running local models or thinking about personal AI
infrastructure — open to questions in the comments.

https://github.com/alexradunet/nazar-studio

---

## GitHub repo short description (≤ 160 chars)

Your personal wise companion — a self-hosted AI that remembers, grows, and keeps your data yours. Built on Pi + Node + llamafile. AGPL-3.0.

---

## GitHub repo topics (tag list)

ai, personal-assistant, self-hosted, local-ai, llamafile, markdown, privacy, foss,
node, typescript, pi-agent, pi-package, life-os, romanian, open-source

---

## One-tweet / 280-char version

Nazar: a self-hosted personal AI companion that runs on your own box.

Remembers what matters in plain Markdown. Learns new skills over time — approved by you in
git. Local model by default.

Named for the watchful blue eye that wards the evil eye (deochi).

AGPL · no GPU required · the repo is the system
github.com/alexradunet/nazar-studio
