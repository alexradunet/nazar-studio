// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";

import { parseDotEnvText } from "./env.ts";

test("parses dotenv content with export and quoted values", () => {
  const parsed = parseDotEnvText(`
export BALAUR_MODEL=synthetic/syn:large:text
OPENAI_API_KEY=plain-key
BLAH_WITH_HASH=abc#123
SINGLE_QUOTED='a value with spaces'
DOUBLE_QUOTED="line1\\nline2"
EMPTY_VALUE=
# ignored=comment
`);

  expect(parsed.BALAUR_MODEL).toBe("synthetic/syn:large:text");
  expect(parsed.OPENAI_API_KEY).toBe("plain-key");
  expect(parsed.BLAH_WITH_HASH).toBe("abc");
  expect(parsed.SINGLE_QUOTED).toBe("a value with spaces");
  expect(parsed.DOUBLE_QUOTED).toBe("line1\nline2");
  expect(parsed.EMPTY_VALUE).toBe("");
  expect(parsed).not.toHaveProperty("ignored");
});

test("ignores invalid dotenv lines", () => {
  const parsed = parseDotEnvText(`
INVALID KEY=value
1INVALID=bad
_OKAY=good
`);

  expect(parsed._OKAY).toBe("good");
  expect(parsed).not.toHaveProperty("INVALID KEY");
  expect(parsed).not.toHaveProperty("1INVALID");
});
