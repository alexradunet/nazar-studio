// SPDX-License-Identifier: AGPL-3.0-or-later
/** Rebuild the disposable SQLite FTS5 index from the Johnny Decimal Markdown vault. */
import { reindexVault, vaultPath } from "../lib/vault.ts";

const count = reindexVault();
console.log(`reindexed ${count} vault entr${count === 1 ? "y" : "ies"} from ${vaultPath()}`);
