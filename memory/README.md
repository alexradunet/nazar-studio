# Nazar memory skeleton

This public repository keeps a repo-local memory skeleton plus public AI/infrastructure durable pages under `memory/pages/ai/`.

Real personal memory should live in a private portable Obsidian vault, not in this public checkout. Preferred layout:

```txt
NazarVault/
  00_Inbox/
  01_Projects/
  02_Areas/
  03_Resources/
  04_Archive/
  05_Nazar/
    llm-wiki/{raw,wiki}/
    runtime/{rollups,state,journal,sources,indexes,archive}/
    ai-workbench/{proposals,drafts,scratch}/
    operator-log/
```

Configure it with one portable root:

```sh
NAZAR_HOME="$HOME/NazarVault"
```

Derived defaults:

```sh
PI_MEMORY_ROOT="$NAZAR_HOME/05_Nazar/runtime"
PI_MEMORY_PAGES_DIR="$NAZAR_HOME"
PI_AI_MEMORY_DIR="$NAZAR_HOME/05_Nazar/llm-wiki/wiki"
PI_HUMAN_MEMORY_DIR="$NAZAR_HOME"
```

Do not commit private journals, generated rollups, source reports, personal pages, OAuth material, WhatsApp auth state, local voice models, or secrets.
