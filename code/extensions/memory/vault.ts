import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { MemoryPaths } from "./paths.ts";

export const VAULT_MEMORY_DIRS = ["00_Inbox", "01_Projects", "02_Areas", "03_Resources", "04_Archive", "05_Nazar"];

export function ensureVaultScaffold(paths: MemoryPaths): void {
  if (!paths.VAULT_DIR) return;
  for (const name of VAULT_MEMORY_DIRS) mkdirSync(join(paths.VAULT_DIR, name), { recursive: true });
  for (const path of [
    paths.LLM_WIKI_RAW_DIR,
    paths.LLM_WIKI_PAGES_DIR,
  ]) mkdirSync(path, { recursive: true });

  const vaultAgents = join(paths.NAZAR_DIR, "AGENTS.md");
  if (!existsSync(vaultAgents)) {
    writeFileSync(vaultAgents, `# Nazar vault operator rules\n\n- \`00_Inbox/\` is shared capture. Human and AI may append quick notes; process later.\n- \`01_Projects/\`, \`02_Areas/\`, and \`03_Resources/\` are human-owned. AI should propose edits unless explicitly asked to update them.\n- \`04_Archive/\` is cold storage and excluded from default memory search unless explicitly requested.\n- \`05_Nazar/\` is the AI/system control plane. Runtime state, rollups, llm-wiki outputs, and pinned memory live here.\n- Keep secrets, auth tokens, private keys, and machine-specific credentials out of markdown memory.\n`, "utf8");
  }

  const wikiAgents = join(paths.LLM_WIKI_DIR, "AGENTS.md");
  if (!existsSync(wikiAgents)) {
    writeFileSync(wikiAgents, `# LLM wiki rules\n\n- \`raw/\` contains immutable source snapshots. Do not edit a raw source after ingest; add a corrected source instead.\n- \`wiki/\` contains AI-maintained compiled knowledge pages. Keep pages concise, cross-linked, and citation-friendly.\n- Maintain \`wiki/index.md\` as a content catalog and \`wiki/log.md\` as an append-only operation log.\n- Prefer ingesting from reviewed inbox items or explicit human-provided sources.\n- When a source contradicts existing wiki claims, update the relevant page and note the contradiction rather than silently overwriting history.\n`, "utf8");
  }

  const wikiIndex = join(paths.LLM_WIKI_PAGES_DIR, "index.md");
  if (!existsSync(wikiIndex)) writeFileSync(wikiIndex, "# LLM wiki index\n\n", "utf8");
  const wikiLog = join(paths.LLM_WIKI_PAGES_DIR, "log.md");
  if (!existsSync(wikiLog)) writeFileSync(wikiLog, "# LLM wiki log\n\n", "utf8");
}
