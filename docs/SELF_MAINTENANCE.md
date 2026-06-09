<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Self-maintenance: how Nazar edits and ships itself

Nazar is a **self-contained Pi package** (`pi-nazar-studio`). Users install it with
`pi install npm:pi-nazar-studio`; the live surface is the `pi` terminal. There is no `nazar-agent`
gateway, no Bun, no `bin/pi` wrapper, and no `seed-pi-config.sh`. The maintenance loop runs on a
`git clone` of this repo:

```
edit  →  npm run typecheck && npm test  →  git commit  →  git push  →  tag a release  →  pi update
```

## The loop

```bash
git clone https://github.com/alexradunet/nazar-studio.git
cd nazar
npm install

# 1. edit files
# 2. check (mandatory before push)
npm run typecheck && npm test
# 3. commit + push
git add -A && git commit -m "…" && git push
```

To try changes immediately without publishing, load the working tree into Pi for one run:

```bash
pi -e .
```

Then `/reload` in any running session.

## Shipping a release

```bash
# bump "version" in package.json, then:
git tag v0.1.1 && git push --tags
```

The `release` workflow publishes to npm (gated by `prepublishOnly`: typecheck + tests). Users get it
with `pi update npm:pi-nazar-studio`, then `/reload`.

One-time setup: create an npm automation token for `pi-nazar-studio` and add it as the repo secret
`NPM_TOKEN` (Settings → Secrets → Actions).

## How it's wired

- **Package manifest** — `package.json`'s `pi` block declares `extensions/`, `skills/`, `themes/`.
  Pi auto-loads them on install.
- **Self-registration** — `extensions/local-llm.ts` registers the `llamafile` provider via
  `pi.registerProvider`; `extensions/personality.ts` injects `SYSTEM.md` + `AGENTS.md` at
  `before_agent_start`. No global Pi config is modified.
- **Memory index** — `lib/memory.ts` uses the built-in `node:sqlite` FTS5; `npm run reindex`
  rebuilds it from the Markdown vault.
- **Checks** — `npm test` (vitest: memory, terminal UI, skill gate) and `npm run typecheck`.

## Safety notes

- Never push red — run `npm test` first; `git revert` is the undo.
- Nazar runs as **you** on the host in the terminal. Privacy is structural on the local model; a
  frontier model is a deliberate manual `/model` switch.
- Do not resurrect Bun, the gateway/service, the `bin/pi` wrapper, or `seed-pi-config.sh`. Future
  channels belong as Pi extensions attached to a long-lived terminal/tmux session.

## Troubleshooting

| Symptom | Check / fix |
|---|---|
| reload did not pick up changes | `pi list` shows `npm:pi-nazar-studio`; run `pi update npm:pi-nazar-studio`, then `/reload` |
| tests fail | fix before pushing — never publish red |
| local model down | `curl http://127.0.0.1:8082/health`; then run `/local-llm doctor` |
| memory recall empty | ensure Node 23.4+; run `npm run reindex` |

Related: skill-level self-evolution (proposing new *skills* with review) — see
[`SELF_EVOLUTION.md`](./SELF_EVOLUTION.md).
