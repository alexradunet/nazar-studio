# Nazar memory index

This public repository includes AI/infrastructure durable memory pages only. Human/private memory lives outside this repository in a private portable Obsidian vault (`NAZAR_HOME`).

## AI/infrastructure pages

- [Current project state](ai/current-project-state.md)
- [Memory system](ai/memory-system.md)
- [Nazar setup](ai/setup.md)
- [Local voice and TTS](ai/voice.md)
- [Windows setup](ai/windows.md)
- [Spotify integration](ai/spotify.md)
- [WhatsApp integration](ai/whatsapp.md)
- [GitHub CLI and management skill](ai/github.md)

## Private vault layout

Preferred private layout:

```txt
NazarVault/
  00_Inbox/
  01_Projects/
  02_Areas/
  03_Resources/
  04_Archive/
  05_Nazar/
```

`05_Nazar/llm-wiki/raw` holds immutable source snapshots; `05_Nazar/llm-wiki/wiki` holds AI-maintained compiled wiki pages; `05_Nazar/runtime` holds generated rollups, state, journals, sources, and indexes.

Do not commit human/private memory here. Use `NAZAR_HOME` or explicit `PI_HUMAN_MEMORY_DIR` for personal pages, journals, rollups, and source material.
