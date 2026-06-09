// SPDX-License-Identifier: AGPL-3.0-or-later
// Tool taxonomy + name/intent → sprite mapping for Nazar's tool avatars.
// `toolKind()` matches a tool name (and optional hint text) to one of the
// canonical tool kinds; `KIND_TO_EYE` then maps each kind to the deduped "eye"
// sprite Nazar shows while running it.

export const TOOL_KINDS = [
  // core file/code operations
  "scroll",
  "needle",
  "quill",
  "anvil",
  "lens",
  "folder",
  "keeper",
  "warden",
  "seer",
  "new-head",
  "hammer",
  // domain / life-tracking tools
  "journal",
  "dumbbell",
  "running",
  "plate-fork",
  "heart-pulse",
  "moon-stars",
  "calendar",
  "envelope",
  "map-pin",
  "coin-stack",
  "music-note",
  "camera",
  "pill-potion",
  "brain",
  "compass",
  "seedling",
  "hourglass",
  "key",
  "bell",
  // dev / engineering
  "terminal",
  "code",
  "git-branch",
  "git-merge",
  "database",
  "cloud",
  "browser",
  "container",
  "chat",
  "gamepad",
  "rocket",
  "gear",
  // objects / status / actions
  "lightbulb",
  "trophy",
  "target",
  "flask",
  "atom",
  "bug",
  "lock",
  "star",
  "flag",
  "gift",
  "cart",
  "paint-brush",
  "wrench",
  "bookmark",
  // 30-tool library additions (2026-06-08): dedicated dev / life / calls / apps tools
  "api",
  "package",
  "tasks",
  "habit",
  "weight",
  "water",
  "mood",
  "phone",
  "video",
  "contacts",
  "mic",
  "share",
  "drive",
  "card",
  "media",
  "docs",
] as const;

export type ToolAvatarKind = typeof TOOL_KINDS[number];
// The distinct "eye" sprites Nazar can show. Many tool kinds share one eye, so
// the tool sheets are deduped to these ~22 files (loaded once, keyed by path).
export type EyeKind =
  | "read" | "write" | "edit" | "search" | "bash" | "files" | "grep" | "browser"
  | "memory" | "skill" | "health" | "journal" | "gym" | "calendar" | "mail" | "music" | "time"
  | "terminal" | "rocket" | "gear" | "idle"
  | "money" | "sports" | "diet" | "sleep" | "mind"
  // 30-tool library (2026-06-08)
  | "git" | "merge" | "database" | "cloud" | "container" | "bug" | "api" | "code" | "lock" | "package"
  | "tasks" | "habit" | "weight" | "water" | "meds" | "mood" | "goal" | "cart"
  | "phone" | "video" | "chat" | "contacts" | "mic" | "bell"
  | "share" | "drive" | "card" | "map" | "media" | "docs";
// Tool kind -> the eye Nazar shows while running it (idle cosmos is the fallback).
export const KIND_TO_EYE: Record<ToolAvatarKind, EyeKind> = {
  scroll: "read", needle: "edit", quill: "write", anvil: "bash", lens: "grep",
  folder: "files", keeper: "memory", warden: "health", seer: "search", "new-head": "skill", hammer: "gear",
  journal: "journal", dumbbell: "gym", running: "sports", "plate-fork": "diet", "heart-pulse": "health",
  "moon-stars": "sleep", calendar: "calendar", envelope: "mail", "map-pin": "map",
  "coin-stack": "money", "music-note": "music", camera: "idle", "pill-potion": "meds",
  brain: "mind", compass: "browser", seedling: "idle", hourglass: "time", key: "idle", bell: "bell",
  terminal: "terminal", code: "code", "git-branch": "git", "git-merge": "merge",
  database: "database", cloud: "cloud", browser: "browser", container: "container", chat: "chat",
  gamepad: "idle", rocket: "rocket", gear: "gear",
  lightbulb: "skill", trophy: "idle", target: "goal", flask: "skill", atom: "skill", bug: "bug",
  lock: "lock", star: "skill", flag: "idle", gift: "idle", cart: "cart",
  "paint-brush": "write", wrench: "gear", bookmark: "read",
  // 30-tool library additions -> dedicated eyes
  api: "api", package: "package",
  tasks: "tasks", habit: "habit", weight: "weight", water: "water", mood: "mood",
  phone: "phone", video: "video", contacts: "contacts", mic: "mic",
  share: "share", drive: "drive", card: "card", media: "media", docs: "docs",
};

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function toolKind(toolName: string, hintText = ""): ToolAvatarKind {
  const text = `${toolName} ${hintText}`.toLowerCase();

  // Dev / engineering tools — specific terms first so they win over the
  // broader life-tracking keywords below (e.g. "git log" → git, not journal).
  if (hasAny(text, ["terminal", "console", "repl", "tty"])) return "terminal";
  if (hasAny(text, ["rebase", "git merge", "pull request", "pull_request"])) return "git-merge";
  if (hasAny(text, ["git ", "git_", "commit", "checkout", "git-branch"])) return "git-branch";
  if (hasAny(text, ["database", "sql", "postgres", "mysql", "sqlite", "mongo"])) return "database";
  if (hasAny(text, ["docker", "container", "kubernetes", "k8s", "podman"])) return "container";
  if (hasAny(text, ["browser", "playwright", "puppeteer", "headless", "navigate to"])) return "browser";
  if (hasAny(text, ["vscode", "editor", "syntax", "lint"])) return "code";
  if (hasAny(text, ["aws", "gcp", "azure", "lambda", "cloudformation"])) return "cloud";
  if (hasAny(text, ["endpoint", "graphql", "webhook", "rest api", "api call", "openapi", "swagger", "http request"])) return "api";
  if (hasAny(text, ["npm ", "package", "dependency", "node_modules", "yarn ", "pnpm", "cargo ", "pip install", "build artifact"])) return "package";
  if (hasAny(text, ["slack", "discord", "chat"])) return "chat";
  if (hasAny(text, ["deploy", "release build", "ship it", "launch"])) return "rocket";
  if (hasAny(text, ["settings", "config", "preferences"])) return "gear";
  if (hasAny(text, ["debug", "stack trace", "traceback", "exception"])) return "bug";
  if (hasAny(text, ["encrypt", "secure ", "lockdown"])) return "lock";
  if (hasAny(text, ["game", "gamepad"])) return "gamepad";
  if (hasAny(text, ["idea", "brainstorm"])) return "lightbulb";
  if (hasAny(text, ["design", "illustrat", "paint"])) return "paint-brush";

  // Domain / life-tracking tools
  if (hasAny(text, ["journal", "diary", "log", "note", "memo"])) return "journal";
  if (hasAny(text, ["sport", "running", "run ", "cardio", "steps", "athletic", "jog"])) return "running";
  if (hasAny(text, ["gym", "dumbbell", "workout", "exercise", "fitness", "lift"])) return "dumbbell";
  if (hasAny(text, ["nutrition", "meal", "diet", "food", "plate", "calorie"])) return "plate-fork";
  if (hasAny(text, ["heart", "pulse", "vitals", "hrv", "blood pressure", "heartbeat"])) return "heart-pulse";
  if (hasAny(text, ["sleep", "rest", "moon", "circadian", "bedtime"])) return "moon-stars";
  if (hasAny(text, ["kanban", "backlog", "checklist", "task list", "todo list", "to-do list", "task board", "jira", "trello", "linear issue"])) return "tasks";
  if (hasAny(text, ["calendar", "schedule", "event", "appointment", "reminder", "todo", "task"])) return "calendar";
  if (hasAny(text, ["email", "mail", "message", "inbox", "send"])) return "envelope";
  if (hasAny(text, ["location", "map", "place", "navigate", "route", "gps"])) return "map-pin";
  if (hasAny(text, ["credit card", "debit card", "card payment", "checkout", "stripe", "billing", "invoice", "paypal"])) return "card";
  if (hasAny(text, ["finance", "money", "budget", "expense", "coin", "payment"])) return "coin-stack";
  if (hasAny(text, ["music", "audio", "sound", "podcast", "playlist"])) return "music-note";
  if (hasAny(text, ["photo", "camera", "image", "picture", "screenshot"])) return "camera";
  if (hasAny(text, ["medicine", "pill", "drug", "medication", "health track", "symptom"])) return "pill-potion";
  if (hasAny(text, ["mood", "emotion", "feeling", "how i feel", "wellbeing", "well-being"])) return "mood";
  if (hasAny(text, ["mind", "brain", "cognitive", "focus", "mental", "think"])) return "brain";
  if (hasAny(text, ["navigate", "compass", "direction", "goal", "plan", "roadmap"])) return "compass";
  if (hasAny(text, ["habit", "streak", "routine", "daily habit"])) return "habit";
  if (hasAny(text, ["growth", "plant", "garden", "progress", "seedling"])) return "seedling";
  if (hasAny(text, ["time", "timer", "stopwatch", "duration", "hourglass", "pomodoro"])) return "hourglass";
  if (hasAny(text, ["access", "unlock", "auth", "credential", "password", "token", "secret"])) return "key";
  if (hasAny(text, ["notify", "alert", "notification", "bell", "ping"])) return "bell";
  // 30-tool library: extended life-management, calls & app integrations
  if (hasAny(text, ["body weight", "weigh-in", "weight log", "weight track", "bmi", "body mass", "scale reading"])) return "weight";
  if (hasAny(text, ["water", "hydration", "hydrate", "fluid intake", "drink water"])) return "water";
  if (hasAny(text, ["phone call", "telephone", "voicemail", "dial ", "call log", "ring up"])) return "phone";
  if (hasAny(text, ["video call", "zoom meeting", "facetime", "google meet", "webcam", "video conference", "video meeting"])) return "video";
  if (hasAny(text, ["contact", "address book", "roster", "people list", "phonebook"])) return "contacts";
  if (hasAny(text, ["microphone", "voice memo", "voice note", "dictation", "record voice"])) return "mic";
  if (hasAny(text, ["share", "social media", "post to", "publish to", "tweet", "retweet"])) return "share";
  if (hasAny(text, ["google drive", "cloud storage", "dropbox", "onedrive", "gdrive", "file backup", "upload to drive"])) return "drive";
  if (hasAny(text, ["media player", "play video", "youtube", "netflix", "video stream", "streaming"])) return "media";
  if (hasAny(text, ["document", "google doc", "word doc", ".docx", "notion page", "report doc", "write-up"])) return "docs";
  // Core file / code operations
  if (hasAny(text, ["open-websearch", "fetch-web", "fetchgithub", "fetch-github", "websearch", "web search"])) return "seer";
  if (/\bsearch\b/.test(text) && !hasAny(text, ["grep", "ripgrep", "search files"])) return "seer";
  if (hasAny(text, ["memory", "vault", "keeper"])) return "keeper";
  if (hasAny(text, ["doctor", "warden"])) return "warden";
  if (hasAny(text, ["skill_write", "skill-write", "skill", "evolv", "new head"])) return "new-head";
  if (hasAny(text, ["read"])) return "scroll";
  if (hasAny(text, ["edit", "patch", "replace"])) return "needle";
  if (hasAny(text, ["write"])) return "quill";
  if (hasAny(text, ["grep", "find"])) return "lens";
  if (hasAny(text, ["ls", "list", "tree"])) return "folder";
  if (hasAny(text, ["bash", "shell", "command"])) return "anvil";

  return "hammer";
}
