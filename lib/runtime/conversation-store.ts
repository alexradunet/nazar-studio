// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "../paths.ts";

export interface ConversationBranch {
  id: string;
  title: string;
  createdAt: string;
  status: "open" | "merged";
  path: string;
}

export interface BranchMergeInput {
  branch: ConversationBranch;
  summary: string;
}

export function masterConversationPath(): string {
  return join(dataDir(), "conversation", "master.jsonl");
}

export function branchesDir(): string {
  return join(dataDir(), "conversation", "branches");
}

export function loadConversation(path: string, limit = 80): AgentMessage[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const out: AgentMessage[] = [];
  for (const line of lines.slice(-Math.max(1, limit))) {
    try {
      out.push(JSON.parse(line) as AgentMessage);
    } catch {
      // Append-only logs should survive a single corrupt line.
    }
  }
  return out;
}

export function appendConversationMessage(path: string, message: AgentMessage): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(message)}\n`, { mode: 0o600 });
}

export function loadMasterMessages(limit = 80): AgentMessage[] {
  return loadConversation(masterConversationPath(), limit);
}

export function appendMasterMessage(message: AgentMessage): void {
  appendConversationMessage(masterConversationPath(), message);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "branch";
}

export function createBranch(title: string): ConversationBranch {
  const now = new Date().toISOString();
  const id = `${now.replace(/[:.]/g, "-")}-${slugify(title)}`;
  const path = join(branchesDir(), `${id}.jsonl`);
  const branch: ConversationBranch = { id, title: title.trim() || "Untitled branch", createdAt: now, status: "open", path };
  mkdirSync(branchesDir(), { recursive: true });
  writeFileSync(`${path}.meta.json`, `${JSON.stringify(branch, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(path, "", { flag: "a", mode: 0o600 });
  return branch;
}

export function loadBranch(id: string): ConversationBranch | null {
  const path = join(branchesDir(), `${id}.jsonl`);
  const metaPath = `${path}.meta.json`;
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as ConversationBranch;
  } catch {
    return null;
  }
}

export function appendBranchMessage(branch: ConversationBranch, message: AgentMessage): void {
  appendConversationMessage(branch.path, message);
}

export function mergeBranchSummary(input: BranchMergeInput): AgentMessage {
  const now = new Date().toISOString();
  const message: AgentMessage = {
    role: "user",
    content: `Merged sub-conversation: ${input.branch.title}\n\n${input.summary.trim()}`,
    timestamp: Date.parse(now),
  };
  appendMasterMessage(message);
  const next = { ...input.branch, status: "merged" as const };
  writeFileSync(`${input.branch.path}.meta.json`, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return message;
}
