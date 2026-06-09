// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * vault.ts — Nazar Pi extension: tools to write the Markdown vault.
 *
 * Loaded through the local Pi package. Tool API per https://pi.dev/docs/latest/extensions
 * (default-export factory receiving ExtensionAPI; pi.registerTool with TypeBox params
 * and an async execute()).
 *
 *   journal/YYYY/MM/YYYY-MM-DD.md — frontmatter: date, type; body: timestamped lines
 *   diet/...  sport/...           — same shape
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox"; // TypeBox v1 — same package/version pi-coding-agent depends on
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vaultRoot } from "../lib/memory.ts";

// One vault root for Nazar (facts + life-tracking) — outside the repo. See vaultRoot().
const VAULT = vaultRoot();

async function appendEntry(kind: string, text: string): Promise<string> {
  const [y, m, d] = new Date().toISOString().slice(0, 10).split("-");
  const path = join(VAULT, kind, y, m, `${y}-${m}-${d}.md`);
  await mkdir(dirname(path), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {
    existing = `---\ndate: ${y}-${m}-${d}\ntype: ${kind}\n---\n`;
  }
  await writeFile(path, `${existing}\n- ${new Date().toISOString()} ${text}\n`);
  return path;
}

export default function (pi: ExtensionAPI) {
  for (const kind of ["journal", "diet", "sport"]) {
    pi.registerTool({
      name: `${kind}_add`,
      label: `${kind} add`,
      description: `Append a ${kind} entry to the owner's Markdown vault.`,
      parameters: Type.Object({ text: Type.String() }),
      async execute(_toolCallId: string, params: { text: string }) {
        const path = await appendEntry(kind, params.text);
        return { content: [{ type: "text", text: `Saved to ${path}` }], details: {} };
      },
    });
  }
}
