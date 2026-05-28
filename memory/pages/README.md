# `memory/pages/`

Durable public memory pages for the Nazar public repository.

This repo intentionally tracks AI/infrastructure pages in `ai/` and ignores human/private pages in `personal/`. Real personal memory should live in a private Obsidian vault configured with `NAZAR_HOME`:

```sh
NAZAR_HOME="$HOME/NazarVault"
PI_MEMORY_PAGES_DIR="$NAZAR_HOME"
PI_AI_MEMORY_DIR="$NAZAR_HOME/05_Nazar/llm-wiki/wiki"
PI_HUMAN_MEMORY_DIR="$NAZAR_HOME"
```

In vault mode, QMD uses scoped collections over the numbered folders (`00_Inbox`, `01_Projects`, `02_Areas`, `03_Resources`, `04_Archive`) plus `05_Nazar/llm-wiki/wiki`. Default search excludes `04_Archive`; use archive/all scope when cold memory is explicitly needed.
