// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { dataDir, packageRoot } from "../paths.ts";
import { vaultPath } from "../vault.ts";

export interface BalaurSkill {
  name: string;
  description: string;
  path: string;
  content: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return { meta, content: raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim() };
}

function parseSkill(path: string, options: { requireVaultKind?: boolean } = {}): BalaurSkill | null {
  const raw = readFileSync(path, "utf8");
  const { meta, content } = parseFrontmatter(raw);
  if (options.requireVaultKind && meta.kind !== "skill") return null;
  const name = meta.name || meta.title || basename(dirname(path));
  if (!name || !content) return null;
  return { name, description: meta.description || meta.whenToUse || "", path, content };
}

function walkMarkdown(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walkMarkdown(path, out);
    else if (name === "SKILL.md" || name.endsWith(".md")) out.push(path);
  }
}

export function discoverSkills(): BalaurSkill[] {
  const packageFiles: string[] = [];
  const userSkillFiles: string[] = [];
  const vaultFiles: string[] = [];
  walkMarkdown(join(packageRoot(), "skills"), packageFiles);
  walkMarkdown(join(dataDir(), "skills"), userSkillFiles);
  walkMarkdown(vaultPath(), vaultFiles);

  const byName = new Map<string, BalaurSkill>();
  for (const file of packageFiles) {
    const skill = parseSkill(file);
    if (skill) byName.set(skill.name, skill);
  }
  for (const file of userSkillFiles) {
    const skill = parseSkill(file);
    if (skill) byName.set(skill.name, skill);
  }
  for (const file of vaultFiles) {
    const skill = parseSkill(file, { requireVaultKind: true });
    if (skill) byName.set(skill.name, skill);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function skillIndexBlock(skills = discoverSkills()): string {
  if (!skills.length) return "";
  const lines = skills.map((s) => `- /skill:${s.name} — ${s.description || "No description."}`).join("\n");
  return `\n\nAvailable Balaur skills:\n${lines}\nUse /skill:name when the user explicitly asks for a skill, or when a listed skill clearly applies.`;
}

export function expandSkillCommand(text: string, skills = discoverSkills()): string {
  const match = text.match(/^\/skill:([a-zA-Z0-9_-]+)\b\s*([\s\S]*)$/);
  if (!match) return text;
  const skill = skills.find((s) => s.name === match[1]);
  if (!skill) return `No skill named "${match[1]}". Available skills: ${skills.map((s) => s.name).join(", ") || "none"}.`;
  const rest = match[2].trim();
  return `Use this Balaur skill for the next response.\n\n# Skill: ${skill.name}\n\n${skill.content}\n\nUser request:\n${rest || "Apply the skill."}`;
}
