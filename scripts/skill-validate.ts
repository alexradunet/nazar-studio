// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * skill-validate.ts — Stage-0 self-evolution gate.
 *
 * Statically scans + compiles a proposed agent-authored skill BEFORE a human reviews
 * the PR. Usage:
 *   npm run skill-check -- <path/to/skill.ts>
 *   tsx scripts/skill-validate.ts <path/to/skill.ts>
 *   node scripts/skill-validate.ts <path/to/skill.ts>   # Node 23.4+ runs TS natively
 *
 * This is the automated half of the gate; a human still approves the PR before the
 * skill is merged and loaded (`/reload` in Pi). See docs/SELF_EVOLUTION.md.
 */
import { readFileSync, existsSync } from "node:fs";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("usage: tsx scripts/skill-validate.ts <skill.ts>");
  process.exit(2);
}
const src = readFileSync(file, "utf8");

// 1) Denylist — block dangerous capabilities in agent-authored skills.
const DENY: [RegExp, string][] = [
  [/\beval\s*\(/, "eval()"],
  [/new\s+Function\s*\(/, "new Function()"],
  [/child_process|node:child_process/, "child_process"],
  [/Bun\.spawn|Bun\.\$|execSync|spawnSync/, "subprocess execution"],
  [/\brequire\s*\(/, "CommonJS require()"],
  [/process\.env\b/, "raw process.env (secret) access"],
  [/\brm\s+-rf\b|rmSync|unlinkSync/, "destructive fs ops"],
];
const hits = DENY.filter(([re]) => re.test(src)).map(([, name]) => name);
if (hits.length) {
  console.error(`✗ FAIL — forbidden patterns: ${hits.join(", ")}`);
  process.exit(1);
}

// 2) Require a capability header so the skill declares its blast radius.
if (!/@capability:/.test(src)) {
  console.error("✗ FAIL — missing `@capability:` header (declare reads/writes/network).");
  process.exit(1);
}

// 3) Compile check via esbuild (dev dependency). Skipped gracefully when esbuild is absent.
try {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [file],
    write: false,
    bundle: false,
    logLevel: "silent",
    format: "esm",
    platform: "node",
  });
  console.log("✓ PASS — scan clean, capability declared, compiles.");
} catch (e) {
  const msg = (e as Error)?.message || String(e);
  if (/Cannot find (package|module) ['"]esbuild['"]|ERR_MODULE_NOT_FOUND/.test(msg)) {
    console.log(`✓ PASS (scan + capability) — compile step skipped: esbuild not installed.`);
  } else {
    console.error(`✗ FAIL — does not compile:\n   ${msg}`);
    process.exit(1);
  }
}
