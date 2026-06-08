---
name: doctor
description: "Verify Nazar works end to end. Use when asked to check, validate, diagnose, or health-check Nazar — or after an update/reinstall, to confirm the stack (Node, package, local model, memory, web search, UI) is healthy."
---

# Self-check (doctor)

How to verify Nazar works **end to end** as a Pi package (`pi-nazar-studio`).

## 1. Environment

- `node --version` → must be **23.4+** (Node 24 LTS recommended); the `node:sqlite` FTS5 memory
  index needs it.
- `pi list` → should include `npm:pi-nazar-studio`. If missing: `pi update npm:pi-nazar-studio`, then `/reload`.

## 2. Local model (`:8082`)

Inside the terminal:

```txt
/local-llm status
/local-llm start
/local-llm doctor
```

Or check directly: `curl -s http://127.0.0.1:8082/health`. First start downloads the runtime + GGUF
model; watch `~/.local/share/nazar/logs/local-llm.log`.

## 3. Memory + tools

- Tools exist: `memory_write`, `memory_search`, `memory_get`, `memory_duplicates`; life-tracking:
  `journal_add`, `diet_add`, `sport_add`.
- Recall works: `memory_search` on a known term returns hits. If empty, confirm Node 23.4+ and (from
  a source checkout) rebuild the index: `npm run reindex`.

## 4. UI + model

- Nazar theme and avatars load (run `/reload` if not).
- Terminal experience check: truecolor ANSI terminal and terminal font
  `Iosevka Term` (https://github.com/be5invis/Iosevka) preferred, especially for `high` / octant avatars.
- Font helper: `/nazar-terminal-font status` reports terminal/font/octant readiness; `/nazar-terminal-font configure` can safely update Kitty after user approval.
- If avatars look broken in `high`, run `/skill:terminal-font` and keep `/nazar-ui medium` until the octant glyph test is clean. From a source checkout, the exact notice logic is covered by `npm test -- terminal-experience`.
- Footer model matches the actual terminal model; `/model` switches back to
  `llamafile / lfm2.5-8b-a1b` for local/private.

## 5. Web search

- `open-websearch` exists on `PATH`.
- Daemon health is optional: `curl --noproxy '*' -fsS http://127.0.0.1:3210/health`.
- One-shot retrieval works without a daemon:

```bash
open-websearch search "Nazar pi local first memory appliance" --limit 3 --engine startpage --json
```

Success means the command returns usable JSON results. If the daemon is unavailable but one-shot search
works, report web search as healthy with no long-lived daemon running.

## 6. Source checkout (maintainers)

```bash
npm run typecheck && npm test && npm run smoke
```

## 7. Stale legacy state

If a previous legacy install lingers:

```bash
systemctl --user disable --now nazar-agent 2>/dev/null || true
rm -f ~/.config/systemd/user/nazar-agent.service
```

## 8. Report

Summarise: what's healthy, what's degraded and why, and the single next action.
