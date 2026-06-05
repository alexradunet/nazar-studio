<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Troubleshooting Nazar

Nazar is a self-contained Pi package (`pi-nazar-studio`). There is no core HTTP gateway, no `nazar` CLI,
and no `nazar-agent` service. The live path is:

```text
pi terminal → pi-nazar-studio extensions/skills/theme/persona → local model llamafile (:8082)
```

## 0 · Is it installed?

```bash
pi list          # should include npm:pi-nazar-studio
node --version   # must be 23.4+ (24 LTS recommended) for node:sqlite FTS5
```

In the terminal, `/skill:doctor` runs the doctor playbook.

## 1 · `pi` command not found

Install Pi itself (Nazar rides on top of it):

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

## 2 · Pi did not load Nazar resources

Symptoms: no Nazar theme/UI, memory tools missing, `/skill:doctor` missing.

```bash
pi update npm:pi-nazar-studio
```

Then run `/reload` in the terminal. To trial a local checkout instead: `pi -e .` from the repo root.

## 3 · Local model not answering

```bash
curl -s http://127.0.0.1:8082/health
```

If refused/down, inspect the Pi-managed runtime from the terminal:

```txt
/local-llm status
/local-llm start
/local-llm doctor
```

First start downloads the runtime + GGUF and can take a while; watch
`~/.local/share/nazar/logs/local-llm.log`.

## 4 · Terminal shows a frontier model

That means this Pi session was manually switched. Check or switch with:

```txt
/model
```

Choose `llamafile / lfm2.5-8b-a1b` for local/private. Frontier use is opt-in.

## 5 · Memory recall is empty

The memory index is `node:sqlite` FTS5, which needs **Node 23.4+**. Confirm `node --version`, then
rebuild the index from the Markdown vault (from a source checkout):

```bash
npm run reindex
```

## 6 · Changes do not appear after editing a source checkout

```bash
npm test
pi -e .          # load the working tree for one run
```

Or publish a release and `pi update npm:pi-nazar-studio`, then `/reload`. See
[`SELF_MAINTENANCE.md`](./SELF_MAINTENANCE.md).

## 7 · Old gateway/service or Bun install still lingering

The package no longer ships them. Remove stale host state once:

```bash
systemctl --user disable --now nazar-agent 2>/dev/null || true
rm -f ~/.config/systemd/user/nazar-agent.service
systemctl --user daemon-reload 2>/dev/null || true
# optional: remove a previous clone-based install
sudo rm -f /usr/local/bin/pi   # only if it pointed at the old bin/pi wrapper
```

## Reference commands

| Task | Command |
|---|---|
| install / update | `pi install npm:pi-nazar-studio` · `pi update npm:pi-nazar-studio` |
| open terminal | `pi` |
| reload Pi resources | `/reload` inside terminal |
| local model health | `curl -s http://127.0.0.1:8082/health` |
| local model logs | `/local-llm status` / `/local-llm doctor`; file at `~/.local/share/nazar/logs/local-llm.log` |
| rebuild memory index | `npm run reindex` (source checkout) |
| run tests | `npm test` (source checkout) |
