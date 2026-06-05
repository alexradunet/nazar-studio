// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar inscription-style code blocks.
//
// Pi-tui's MarkdownTheme paints each rendered code block as:
//
//   ```typescript        ← codeBlockBorder
//     const x = 1;       ← codeBlock
//     // ...             ← codeBlock
//   ```                  ← codeBlockBorder
//
// We wrap that theme so the literal triple-backticks disappear and a quiet
// lang chip appears in their place — closer to an inscription tablet:
//
//   ◇ TYPESCRIPT         ← codeBlockBorder (opening)
//   ▏ const x = 1;       ← codeBlock (left stripe + parchment fg)
//   ▏ // ...             ← codeBlock
//                        ← codeBlockBorder (closing, hidden as blank row)
//
// The lang chip is fg-only (no bg block), so it inherits the panel ambient
// tint and reads as part of the same surface. The left stripe (▏) visually
// distinguishes code without needing per-row bg fill (which would require
// the composer to know per-row bg — see "Future work" at the bottom).
import type { MarkdownTheme } from "@earendil-works/pi-tui";

const CHIP_GLYPH = "◇";
const CODE_STRIPE = "▏";

const WRAPPED_MARKER = Symbol.for("nazar.markdownThemeWrapped");

type WrappedTheme = MarkdownTheme & { [WRAPPED_MARKER]?: true };

/**
 * Wrap a base MarkdownTheme so:
 *   - Opening `\`\`\`lang` fences render as a muted `◇ LANG` chip
 *   - Closing fences (and opening-without-lang) hide entirely (blank row)
 *   - Code body lines get a `▏ ` left stripe in the muted color
 *
 * Idempotent — wrapping an already-wrapped theme returns it unchanged.
 *
 * The original `codeBlockBorder` painter is reused for the chip colour so
 * the theme keeps responding to the loaded Pi theme (`mdCodeBlockBorder`).
 * Likewise the original `codeBlock` painter wraps the inner code text so
 * `mdCodeBlock` colours still apply.
 */
export function nazarMarkdownTheme(base: MarkdownTheme): MarkdownTheme {
  const w = base as WrappedTheme;
  if (w[WRAPPED_MARKER]) return base;

  const paintChip = base.codeBlockBorder;
  const paintCode = base.codeBlock;

  const codeBlockBorder = (text: string): string => {
    const opening = text.match(/^```(\w+)$/);
    if (opening) {
      const lang = opening[1].toUpperCase();
      return paintChip(`${CHIP_GLYPH} ${lang}`);
    }
    // Closing fence (or opening without language) — emit an empty row that
    // pi-tui's markdown renderer treats as a single blank line. Acts as a
    // visual separator under the code block.
    return "";
  };

  const codeBlock = (text: string): string => {
    return `${paintChip(`${CODE_STRIPE} `)}${paintCode(text)}`;
  };

  const wrapped: WrappedTheme = { ...base, codeBlockBorder, codeBlock };
  wrapped[WRAPPED_MARKER] = true;
  return wrapped;
}

// Future work: per-row background fill ("inscription stone" look) requires
// the panel composer to honour a per-row bg override. Today every body row
// in turn-composer.ts is painted with `style.background` (the panel ambient
// tint) in paintBodyRow — there's no hook for a code row to opt into a
// darker stone-bg without the composer punching a colour-reset hole in it.
// Adding that would mean extending the composer's body type from
// `string[]` to something like `Array<string | { text, bg }>` plus the
// detection logic to identify "this is a code row" after the markdown
// theme has flattened everything to strings. Worth doing if the stripe +
// chip combo isn't distinctive enough in real use.
