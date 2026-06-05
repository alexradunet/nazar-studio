---
name: doctor
description: "Verify Nazar works end to end. Use when asked to check, validate, diagnose, or health-check Nazar — or after an update/reinstall, to confirm the stack (Node, package, local model, memory, UI) is healthy."
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
- Footer model matches the actual terminal model; `/model` switches back to
  `llamafile / qwen3-14b-q4` for local/private.

## 5. Source checkout (maintainers)

```bash
npm run typecheck && npm test && npm run smoke
```

## 6. Stale legacy state

If a previous clone/Bun install lingers:

```bash
systemctl --user disable --now nazar-agent 2>/dev/null || true
rm -f ~/.config/systemd/user/nazar-agent.service
```

## 7. Report

Summarise: what's healthy, what's degraded and why, and the single next action.
