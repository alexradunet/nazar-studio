// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * smoke.ts — confirm the Pi SDK imports under Node and the extension API surface Nazar uses is
 * present. Run with: npm run smoke (tsx smoke.ts).
 */
import * as pi from "@earendil-works/pi-coding-agent";

const P = pi as Record<string, any>;
const need = ["defineTool", "initTheme"];
const missing = need.filter((k) => !(k in P));
if (missing.length) {
  console.error(`✗ FAIL — missing exports under Node: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`✓ Pi SDK exports present: ${need.join(", ")}`);
console.log("✓ pi-nazar-studio package smoke passed");
