import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { showText, truncateUtf8, writePrivateJsonSync } from "@nazar/core/shared";
import { defaultMemoryConfig, ensureSetupDirectories, readNazarSetupConfig, writeNazarSetupConfig } from "./setup-store.ts";
import { registerSetupProvider, type SetupProvider } from "./setup-registry.ts";

const SHELL_BLOCK_START = "# >>> Nazar setup";
const SHELL_BLOCK_END = "# <<< Nazar setup";
const AGENTS_BLOCK_START = "<!-- >>> Nazar host context -->";
const AGENTS_BLOCK_END = "<!-- <<< Nazar host context -->";
const CURRENT_HOST_BLOCK_START = "<!-- >>> Nazar current host -->";
const CURRENT_HOST_BLOCK_END = "<!-- <<< Nazar current host -->";
const CURRENT_HOST_CONTEXT_LIMIT_BYTES = 8 * 1024;

type ShellProfileUpdate = "created" | "updated" | "unchanged";

type SessionSetupValues = {
  vaultDir: string;
  sessionDir: string;
  aliasWorkdir: string;
  shellProfile?: string;
  agentsPath: string;
  currentHostPath: string;
};

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function input(ctx: ExtensionContext, title: string, placeholder = ""): Promise<string | undefined> {
  if (ctx.hasUI === false) return undefined;
  return ctx.ui.input(title, placeholder);
}

function envPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? resolve(value) : undefined;
}

function configuredVaultDir(): string {
  return envPath("NAZAR_HOME") || readNazarSetupConfig().memory?.vaultDir?.trim() || defaultMemoryConfig().vaultDir;
}

export function sessionDirForVault(vaultDir: string): string {
  return join(resolve(vaultDir), "05_Nazar", "session");
}

function defaultAliasWorkdir(): string {
  const mobileCheckout = join(homedir(), "src", "nazar");
  if (existsSync(mobileCheckout)) return mobileCheckout;
  return resolve(process.env.PI_PROJECT_ROOT || process.cwd());
}

function shellName(): string {
  return basename(process.env.SHELL || "").toLowerCase();
}

export function defaultShellProfilePath(): string | undefined {
  const override = envPath("NAZAR_SHELL_PROFILE");
  if (override) return override;
  if (platform() === "win32") return undefined;

  const shell = shellName();
  if (shell.includes("zsh")) return join(homedir(), ".zshrc");
  if (shell.includes("bash")) return join(homedir(), ".bashrc");
  if (existsSync(join(homedir(), ".bashrc"))) return join(homedir(), ".bashrc");
  return join(homedir(), ".profile");
}

function piAgentDir(): string {
  return envPath("PI_CODING_AGENT_DIR") || join(homedir(), ".pi", "agent");
}

function defaultAgentsPath(): string {
  return join(piAgentDir(), "AGENTS.md");
}

export function defaultCurrentHostPath(): string {
  return envPath("NAZAR_CURRENT_HOST_PATH") || join(piAgentDir(), "current_host.md");
}

function normalizePathForShell(path: string): string {
  return resolve(path).split(sep).join("/");
}

function escapeDoubleQuotedShell(value: string): string {
  return value.replace(/(["\\`$])/g, "\\$1");
}

function shellDoubleQuoted(value: string): string {
  return `"${escapeDoubleQuotedShell(value)}"`;
}

function shellPathExpression(path: string): string {
  const absolute = normalizePathForShell(path);
  const home = normalizePathForShell(homedir());
  if (absolute === home) return '"$HOME"';
  if (absolute.startsWith(`${home}/`)) return `"$HOME/${escapeDoubleQuotedShell(relative(homedir(), path).split(sep).join("/"))}"`;
  return shellDoubleQuoted(absolute);
}

export function renderNazarShellBlock(values: Pick<SessionSetupValues, "vaultDir" | "aliasWorkdir">): string {
  const vault = shellPathExpression(values.vaultDir);
  const workdir = shellPathExpression(values.aliasWorkdir);
  return [
    SHELL_BLOCK_START,
    "# Managed by /nazar setup sessions. Rerun setup to refresh these host-local paths.",
    `export NAZAR_HOME=${vault}`,
    'export PI_CODING_AGENT_SESSION_DIR="$NAZAR_HOME/05_Nazar/session"',
    `alias nazar='cd ${workdir} && pi'`,
    SHELL_BLOCK_END,
    "",
  ].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceManagedBlock(existing: string, block: string, start = SHELL_BLOCK_START, end = SHELL_BLOCK_END): string {
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  if (re.test(existing)) return existing.replace(re, block);
  const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${prefix}${prefix.trim() ? "\n" : ""}${block}`;
}

export function upsertNazarShellProfile(path: string, values: Pick<SessionSetupValues, "vaultDir" | "aliasWorkdir">): ShellProfileUpdate {
  const block = renderNazarShellBlock(values);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = replaceManagedBlock(existing, block);
  if (next === existing) return "unchanged";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  return existing ? "updated" : "created";
}

function piSettingsPath(): string {
  return join(piAgentDir(), "settings.json");
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function writePiSessionSetting(sessionDir: string): { path: string; changed: boolean } {
  const path = piSettingsPath();
  const current = readJsonObject(path);
  const next = { ...current, sessionDir };
  writePrivateJsonSync(path, next);
  return { path, changed: current.sessionDir !== sessionDir };
}

function currentPiSessionSetting(): string | undefined {
  try {
    const value = readJsonObject(piSettingsPath()).sessionDir;
    return typeof value === "string" && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

function isTermux(): boolean {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux") || process.env.HOME?.includes("/com.termux/"));
}

function detectedHostRuntime(): string {
  if (isTermux()) return `Android / Termux (${platform()}/${process.arch})`;
  if (platform() === "win32") return `Windows (${process.arch})`;
  if (platform() === "darwin") return `macOS (${process.arch})`;
  return `${platform()} (${process.arch})`;
}

function upsertManagedFile(path: string, block: string, start: string, end: string): ShellProfileUpdate {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = replaceManagedBlock(existing, block, start, end);
  if (next === existing) return "unchanged";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  return existing ? "updated" : "created";
}

export function renderNazarAgentsBlock(values: Pick<SessionSetupValues, "vaultDir" | "sessionDir" | "currentHostPath">): string {
  return [
    AGENTS_BLOCK_START,
    "## Nazar host context",
    "",
    "This machine participates in a synced Nazar install.",
    "",
    `- Shared Nazar vault: ${values.vaultDir}`,
    `- Synced Pi sessions: ${values.sessionDir}`,
    `- Host-local current environment file: ${values.currentHostPath}`,
    "",
    "Rules for AI assistants:",
    "- Treat the host-local current environment file as the source of truth for OS, shell, package manager, paths, sync role, and device constraints.",
    "- Read that file before making host-specific setup, install, path, service, networking, or battery assumptions.",
    "- Do not sync, commit, or copy the host-local current environment file into shared memory or public git.",
    "- Use Syncthing for vault/session sync and enable file versioning on peers.",
    AGENTS_BLOCK_END,
    "",
  ].join("\n");
}

function renderCurrentHostBlock(values: Pick<SessionSetupValues, "vaultDir" | "sessionDir" | "aliasWorkdir">): string {
  const profile = readNazarSetupConfig().profile || "unknown";
  return [
    CURRENT_HOST_BLOCK_START,
    "# Current Nazar host",
    "",
    "This file is host-local. It should live outside the synced Nazar vault and should not be committed.",
    "Edit the free-form notes below this managed block for device-specific details.",
    "",
    `Host name: ${hostname()}`,
    `Nazar profile: ${profile}`,
    `Runtime: ${detectedHostRuntime()}`,
    `Home: ${homedir()}`,
    `Nazar vault: ${values.vaultDir}`,
    `Pi session dir: ${values.sessionDir}`,
    `Nazar checkout/workdir: ${values.aliasWorkdir}`,
    "Sync: Syncthing should sync the whole Nazar vault root; this current_host.md file stays local-only.",
    "",
    "Local notes:",
    "- Role: describe this device here, e.g. Pixel 6a always-on sync hub or S25 Ultra mobile client.",
    "- Constraints: describe battery, storage, network, package manager, or service constraints.",
    "- Do not store secrets, tokens, private keys, raw transcripts, or Syncthing device IDs here unless explicitly sanitized.",
    CURRENT_HOST_BLOCK_END,
    "",
  ].join("\n");
}

export function upsertNazarAgentsFile(path: string, values: Pick<SessionSetupValues, "vaultDir" | "sessionDir" | "currentHostPath">): ShellProfileUpdate {
  return upsertManagedFile(path, renderNazarAgentsBlock(values), AGENTS_BLOCK_START, AGENTS_BLOCK_END);
}

export function upsertCurrentHostFile(path: string, values: Pick<SessionSetupValues, "vaultDir" | "sessionDir" | "aliasWorkdir">): ShellProfileUpdate {
  return upsertManagedFile(path, renderCurrentHostBlock(values), CURRENT_HOST_BLOCK_START, CURRENT_HOST_BLOCK_END);
}

export function currentHostContextText(): string {
  const configuredPath = readNazarSetupConfig().sessions?.currentHostPath?.trim();
  const path = configuredPath ? resolve(configuredPath) : defaultCurrentHostPath();
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8").trim();
  if (!text) return "";
  return `Source: ${path}\n\n${truncateUtf8(text, CURRENT_HOST_CONTEXT_LIMIT_BYTES)}`;
}

function valuesSummary(values: SessionSetupValues, piSettings?: { path: string; changed: boolean }, shellUpdate?: ShellProfileUpdate, agentsUpdate?: ShellProfileUpdate, currentHostUpdate?: ShellProfileUpdate): string {
  return [
    `Vault root: ${values.vaultDir}`,
    `Pi session dir: ${values.sessionDir}`,
    `Nazar shortcut workdir: ${values.aliasWorkdir}`,
    values.shellProfile ? `Shell profile: ${values.shellProfile}${shellUpdate ? ` (${shellUpdate})` : ""}` : "Shell profile: not configured on this platform",
    piSettings ? `Pi settings: ${piSettings.path}${piSettings.changed ? " (updated)" : " (already set)"}` : undefined,
    `Standard AGENTS.md: ${values.agentsPath}${agentsUpdate ? ` (${agentsUpdate})` : ""}`,
    `Current host file: ${values.currentHostPath}${currentHostUpdate ? ` (${currentHostUpdate})` : ""}`,
    "",
    "Syncthing plan:",
    `- Sync the whole vault root: ${values.vaultDir}`,
    "- Enable Syncthing file versioning for the vault.",
    "- Do not actively use the same Pi session on two devices at the same time; let sync settle, then resume elsewhere.",
  ].filter(Boolean).join("\n");
}

async function configureSessions(ctx: ExtensionContext): Promise<void> {
  const current = readNazarSetupConfig();
  const vaultInput = await input(ctx, "Nazar vault root for Syncthing/session sync", current.memory?.vaultDir || configuredVaultDir());
  const vaultDir = resolve((vaultInput?.trim() || current.memory?.vaultDir || configuredVaultDir()).trim());
  const sessionDir = sessionDirForVault(vaultDir);

  const aliasInput = await input(ctx, "Nazar shortcut working directory", current.sessions?.aliasWorkdir || defaultAliasWorkdir());
  const aliasWorkdir = resolve((aliasInput?.trim() || current.sessions?.aliasWorkdir || defaultAliasWorkdir()).trim());

  const defaultProfile = current.sessions?.shellProfile || defaultShellProfilePath() || "";
  const shellProfileInput = defaultProfile ? await input(ctx, "Shell profile to update", defaultProfile) : undefined;
  const shellProfile = (shellProfileInput?.trim() || defaultProfile).trim() || undefined;
  const agentsPath = current.sessions?.agentsPath || defaultAgentsPath();
  const currentHostPath = current.sessions?.currentHostPath || defaultCurrentHostPath();

  mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  writeNazarSetupConfig({
    memory: { vaultDir },
    sessions: { sessionDir, shellProfile, aliasWorkdir, agentsPath, currentHostPath, sync: "syncthing" },
  });
  ensureSetupDirectories(readNazarSetupConfig());

  const piSettings = writePiSessionSetting(sessionDir);
  const shellUpdate = shellProfile ? upsertNazarShellProfile(shellProfile, { vaultDir, aliasWorkdir }) : undefined;
  const agentsUpdate = upsertNazarAgentsFile(agentsPath, { vaultDir, sessionDir, currentHostPath });
  const currentHostUpdate = upsertCurrentHostFile(currentHostPath, { vaultDir, sessionDir, aliasWorkdir });
  const values = { vaultDir, sessionDir, aliasWorkdir, shellProfile, agentsPath, currentHostPath };

  await show(ctx, "Synced sessions configured", `${valuesSummary(values, piSettings, shellUpdate, agentsUpdate, currentHostUpdate)}\n\nRestart your shell/Pi or run: source ${shellProfile || "<your shell profile>"}`);
}

function sessionSetupStatusText(): string {
  const config = readNazarSetupConfig();
  const vaultDir = config.memory?.vaultDir || configuredVaultDir();
  const expectedSessionDir = sessionDirForVault(vaultDir);
  return [
    `Configured vault: ${config.memory?.vaultDir || "(not set; using default)"}`,
    `Configured session dir: ${config.sessions?.sessionDir || "(not set)"}`,
    `Expected vault session dir: ${expectedSessionDir}`,
    `Current PI_CODING_AGENT_SESSION_DIR: ${process.env.PI_CODING_AGENT_SESSION_DIR || "(not set)"}`,
    `Pi settings sessionDir: ${currentPiSessionSetting() || "(not set)"}`,
    `Shell profile: ${config.sessions?.shellProfile || defaultShellProfilePath() || "(not configured on this platform)"}`,
    `Standard AGENTS.md: ${config.sessions?.agentsPath || defaultAgentsPath()}`,
    `Current host file: ${config.sessions?.currentHostPath || defaultCurrentHostPath()}`,
    `Sync mode: ${config.sessions?.sync || "syncthing (recommended)"}`,
    "Sync root: configure Syncthing to sync the whole Nazar vault, not only the session folder.",
    "Host context: AGENTS.md points at current_host.md, and Nazar core injects current_host.md when present.",
  ].join("\n");
}

function sessionOnboardingPrompt(): string {
  return [
    "You are onboarding Nazar's synced Pi-session setup.",
    "",
    "Session/sync onboarding goals:",
    "- Explain that Pi JSONL conversations are stored under the Nazar vault at `05_Nazar/session` after setup/restart.",
    "- Explain that Syncthing should sync the whole vault root across devices, with file versioning enabled.",
    "- Explain that the standard host-local AGENTS.md points to a host-local `current_host.md`, and that `current_host.md` is not synced.",
    "- Warn the user not to actively continue the same live Pi session on two devices at once; sync first, then resume.",
    "- If the user mentions host roles, capture concise approved facts with `/memory remember`, such as Pixel 6a = always-on sync hub and S25 Ultra = mobile client/backup peer.",
    "- Do not store secrets, raw transcripts, Syncthing device IDs, or private network addresses unless explicitly sanitized by the user.",
  ].join("\n");
}

export function registerNazarSessionSetupProvider(): () => void {
  const provider: SetupProvider = {
    id: "sessions",
    label: "Synced Pi sessions",
    order: 20,
    configure: async (_pi, ctx) => configureSessions(ctx),
    statusText: sessionSetupStatusText,
    onboardingVersion: 1,
    onboardingPrompt: () => sessionOnboardingPrompt(),
  };
  return registerSetupProvider(provider);
}
