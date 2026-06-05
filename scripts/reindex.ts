// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * reindex.ts — rebuild the disposable node:sqlite FTS5 index from the Markdown vault.
 *
 * The .md pages under $VAULT_PATH/memory are the SOURCE OF TRUTH; this index just makes recall
 * fast. The memory extension also reindexes on load, so this is for manual/CI use:
 *   npm run reindex          # tsx scripts/reindex.ts
 *   node scripts/reindex.ts  # Node 23.4+ runs TypeScript natively
 */
import { reindexMemory, vaultRoot } from "../lib/memory.ts";

const count = reindexMemory();
console.log(`reindexed ${count} memory page(s) from ${vaultRoot()}/memory`);
