// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import type { ComposerState } from "../../../lib/tui/composer-state.ts";
import { CommandPanel } from "./CommandPanel.tsx";
import { PromptGlyph } from "../atoms/PromptGlyph.tsx";

function cursorParts(composer: ComposerState): { before: string; cursor: string; after: string } {
  const before = composer.text.slice(0, composer.cursor);
  const cursor = composer.text[composer.cursor] ?? " ";
  const after = composer.text.slice(composer.cursor + (composer.cursor < composer.text.length ? 1 : 0));
  return { before, cursor, after };
}

export function Composer({ composer }: { composer: ComposerState }) {
  const parts = cursorParts(composer);
  return (
    <>
      <CommandPanel input={composer.text} />
      <Box marginTop={1}>
        <PromptGlyph />
        <Text>{parts.before}</Text>
        <Text inverse>{parts.cursor}</Text>
        <Text>{parts.after}</Text>
      </Box>
    </>
  );
}
