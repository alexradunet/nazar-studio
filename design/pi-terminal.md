# Nazar Pi terminal design

The Pi terminal is Nazar's owned daily surface. It should feel like an old-school fantasy RPG command interface, but still be compact, truthful, and useful.

## Goals

- Make Pi feel like **Nazar**, not a generic coding agent.
- Keep private/local state legible.
- Add RPG flavor through structure: portrait panels, ANSI-colored dialog frames, terse wise copy, and generated sprite avatars.
- Keep canonical per-avatar 3×3, 9-frame, 64×64 PNG sprite sheets; render them through the selected terminal graphics backend.
- Avoid taking over the whole screen.

## Current implemented pieces

- Compact Basm/RPG framed header.
- Fixed-width RPG portrait gutters:
  - avatars are always on.
  - ANSI half-block avatars are the baseline rendering path; HD mode uses Kitty Unicode placeholder cells when supported.
  - role/tool names appear as the right panel title, using the same `╔═◆ label ◆═╗` double-line language as the input editor.
  - `NAZAR_AVATAR_RECENT_LIMIT=10`: cap full avatars to recent panels; older history uses compact generated ANSI badges for performance.
- Working/thinking state is shown as a Nazar-owned transient chat-like assistant portrait widget, not as a sentence or Pi's default loader row.
- Truthful footer:
  - local model -> `local/private`
  - frontier model -> `frontier/opt-in`
  - dirty git state -> `git:branch*`
  - context usage -> compact text meter on wider terminals
- Thinking blocks hidden by default with no placeholder line; the animated avatar is enough.
- Quiet truecolor ANSI RPG panels around user, assistant, thinking, tool-call turns, and the input editor; avatars may use ANSI or Kitty graphics.
- Tool output collapsed by default and wrapped in the same dialog-panel style.
- Per-tool generated pixel icons for read/edit/write/bash/search/memory/doctor/skill-evolution states. Tool names appear as right-panel titles.

## RPG portrait/title rules

Avatars use a fixed-width left portrait box across all roles, so messages align vertically. Names live in the right-panel title line, not as badges under the portrait.

Good:

```txt
╔══════════╗ ╔═◆ cico ◆══════╗
║ avatar   ║ ║ ask           ║
╚══════════╝ ╚═══════════════╝
╔══════════╗ ╔═◆ Nazar ◆════╗
║ avatar   ║ ║ answer        ║
╚══════════╝ ╚═══════════════╝
```

Rules:

- User name comes from `NAZAR_USER_NAME` in `.env`, falling back to `$USER`, then `You`.
- Use the role/tool palette for borders and title text; keep non-essential copy muted.
- Do not render `[ Name ]` badges; the avatar is always shown.
- Do not let user-message background bleed into the left portrait box.
- Avoid emoji because terminal width varies; box drawing and ANSI truecolor are part of the canonical UI.
- Avatar quality is selected by `/nazar-ui basic|hd|auto` or `NAZAR_UI_QUALITY=basic|hd|auto`; basic is ANSI, hd is Kitty placeholder cells when supported, and auto chooses HD when Kitty support is detected.
- Border style is not configurable: RPG box drawing plus ANSI SGR color is canonical.
- Performance cap: `NAZAR_AVATAR_RECENT_LIMIT=<n|all>`; default `10`, `0` means active-only full avatars.
- Role portraits and tool icons use canonical per-avatar 3×3, 9-frame, 64×64 PNG sprite sheets rendered through ANSI half-blocks or Kitty graphics.

## Sprite rules

Backend/name source of truth: [`../lib/ui/sprites.ts`](../lib/ui/sprites.ts). Canonical role sprite source of truth: [`../lib/ui/pixel-avatar.ts`](../lib/ui/pixel-avatar.ts).

Current internal sprite catalog:

```txt
@  user/player
B  Nazar idle
?  Nazar thinking
T  tool work
M  memory/life tracking
+  doctor/health check
*  self-evolution/new capability
```

The text catalog above is a mnemonic for future states, not a badge/nameplate system. The rendered source of truth is the canonical role/tool sprite sheet.

## Working state

The working state should be portable and quiet.

Rules:

- Do not print a working sentence like `Hmm... I will think about that.`.
- Do not show a plain status-line spinner for normal thinking.
- Render thinking as the same RPG portrait-panel format used by assistant turns, with `Nazar` as the right-panel title.
- Own thinking through an extension widget above the editor; hide Pi's built-in Loader/Text working row during normal agent streaming.
- Replace the transient thinking widget once answer text begins streaming.
- Use the same PNG sprite-sheet-to-ANSI renderer as message panels.
- Keep the built-in Loader/Text fallback ANSI-only and simple.
- Keep one blank separator line between user/assistant turns; avoid stacking bottom and top padding into two-line gaps.

## Message borders

Messages use a quiet ANSI RPG dialog panel: a small avatar box on the left, titled message body box on the right, separated by one column of breathing room.

Short message:

```txt
╔══════════╗ ╔═◆ Nazar ◆═════╗
║          ║ ║ answer         ║
║ avatar   ║ ║                ║
║ avatar   ║ ║                ║
║          ║ ║                ║
╚══════════╝ ╚════════════════╝
```

Long message:

```txt
╔══════════╗ ╔═◆ Nazar ◆═════╗
║          ║ ║ answer         ║
║ avatar   ║ ║ more           ║
║ avatar   ║ ║ more           ║
║          ║ ║ more           ║
╚══════════╝ ║ more           ║
             ║ more           ║
             ╚════════════════╝
```

Rules:

- Each panel has one internally uniform border color. Corners, joins, verticals, and top/bottom rules must not mix colors inside one panel.
- Border identity comes from the panel palette: user = indigo/blue, Nazar = gold, tool = olive/steel, thinking = teal, system = slate by default.
- The canonical style uses double-line RPG box drawing (`╔═║╚╝`) plus restrained `◆` label ornaments, colored with ANSI SGR.
- Avatar gets its own fixed-size box with one column/row of inner padding.
- Full chat-turn panels keep one outer column of left/right padding, matching the transient thinking panel.
- The message body is its own box with one column of horizontal gap from the avatar box; avoid shared-border separators.
- Text body height is at least the avatar box height; if text is longer, only the message body continues downward.
- While hidden thinking is the only content, show only the transient thinking panel; do not render a persistent empty assistant message body.
- Keep exactly one visual blank separator between turns. Do not add extra bottom padding inside the panels.

## Tool-call panels

Tool execution uses the same panel language as chat turns:

```txt
 ╔══════════╗ ╔═◆ read ◆═══════╗
 ║          ║ ║ read file      ║
 ║ hammer   ║ ║                ║
 ║ hammer   ║ ║ result/preview ║
 ║          ║ ║                ║
 ╚══════════╝ ╚════════════════╝
```

Rules:

- Do not fall back to Pi's default unframed tool UI in normal chat.
- Left cell shows a compact generated pixel tool avatar while the tool is pending/running. Common tools get distinct icons: scroll (`read`), needle/loom shuttle (`edit`), quill (`write`), anvil (`bash`), lens/folder (`grep`/`find`/`ls`), Keeper (`memory`/life tracking), Warden (`doctor`/health), New Eye (`skill_write`/evolution), and Seer (`open-websearch`/web retrieval). Unknown tools fall back to the maker's hammer. Tool names appear as right-panel titles. Tool avatars animate only while actively running; pending/ok/error panels are static.
- Tool avatar foreground/background carries state:
  - gold/umber = pending
  - bright parchment/steel = running
  - teal = success
  - ember/red = error
- Keep the icon hook small so later tools can get distinct animated/static avatars without changing panel layout.
- Keep built-in tool render content on the right so diffs, previews, and errors remain useful.
- Running tools must visibly show activity in the avatar rail by animating the generated ANSI tool sprite.
- Use the same outer one-column padding and a tool-specific panel-theme border consistent with chat/working panels.

## Input editor

The editor renders as if it WERE the next user-message panel — same
two-column composer, same indigo plaque, same mage avatar on the right
(mirroring the user-message side of the chat). Submitting a draft flows
seamlessly into the next user turn: the panel below visually inherits
the same plaque, the same portrait position, the same column geometry.

```txt
PAD │  ⛨ CICO · you                 ctx ▰▱▱▱▱▱▱▱ 36% · GPT-5.5 · git:main* · 15 tools  │ GAP │ portrait field │ PAD
PAD │  > draft message…                                                       drafting…│ GAP │ portrait pixel │ PAD
PAD │                                                                                  │ GAP │ portrait pixel │ PAD
```

Differences from a submitted user message — there are only two:

1. **Body ambient is slightly cooler/lifted** than a submitted user
   panel, so editor ≠ message at a glance even when empty.
2. **Right-side meta carries the live runtime status**
   (`ctx ▰▱ % · model · git · N tools`). The footer no longer shows
   any of that; it sits where the user's eye is during drafting.
   While the input has text, the meta also reports `drafting…`.

Other rules:

- Pi's internal `paddingX` is forced to 0 so the two-column composer
  owns all outer padding — no double-pad.
- The mage's typing animation cycles frames 1–8 only while the input
  has text. When the input clears, the static idle portrait shows.
- Pi editor behaviour is preserved through the base class: history,
  autocomplete, bracketed paste, submit shortcuts, cursor. Internal
  `\x1b[0m` and `\x1b[49m` resets emitted by the editor are rewritten
  by the composer so the painted bg never tears or leaks
  reverse-video state.
- Autocomplete content renders inside the panel using the same visual
  language; no second style.

Implementation: [`../lib/ui/editor.ts`](../lib/ui/editor.ts).

## Header

The header is a single gold nameplate plaque built on the same
`nameplateRow` primitive as message panels, followed by a 1-row
Romanian-carpet "folk band" motif and a **chapter divider** marking
the session opening:

```txt
  ✦ B A L A U R · woven, not rendered          local-first · private · sovereign · FOSS
  ▓▓▓▒▒▒░░░▒▒▒▓▓▓▓▒▒▒░░░▒▒▒▓▓▓▓▒▒▒░░░▒▒▒▓▓▓▓▒▒▒░░░▒▒▒▓▓▓▓▒▒▒░░░▒▒▒  ← folk band
  ──── ✦ session opened · 23:27 ✦ ──────────────────────────────────  ← chapter divider
```

Width-adaptive:

- ≥ 90 cells → `BALAUR · woven, not rendered` on the left, full trust
  tagline (`local-first · private · sovereign · FOSS`) on the right.
- 56–89 cells → `BALAUR` only on the left; tagline trims to
  `local-first · private · FOSS`.
- < 46 cells → `NAZAR` on the left; tagline trims to `private · FOSS`.

The chapter-divider row uses the **chapter-divider primitive** documented
below, with the label `session ${status} · HH:MM`. `status` is
`"opened"` for a fresh session and `"resumed"` when restoring (set via
the `recordSessionStart()` hook in `lib/ui/session-info.ts`, fired from
the `session_start` extension event). On `/reload` the timestamp updates.

Rules:

- Always exactly three lines, never more.
- The folk band may be disabled via `NAZAR_FOLK_BAND=off`.
- The third row falls back to a plain blank when no session info has
  been recorded yet (ad-hoc renders, unit tests).
- No box-drawing characters beside body text — every visual element is
  either a background fill (plaque, folk band) or a quiet `─` rule row
  (chapter divider). Copy-safe end-to-end.

Implementation: [`../lib/ui/header.ts`](../lib/ui/header.ts).

## Chapter dividers

Thin Basm-motif rows that mark meaningful moments in the conversation:
session opened/resumed in the header, and (later) compaction boundaries
or branch markers inside the conversation flow itself.

Two primitives in [`../lib/ui/divider.ts`](../lib/ui/divider.ts):

- `renderChapterDivider({ width, label, glyph, style })` — full-width
  centred divider with optional label + flanking accent glyph:

  ```txt
  ──── ✦ session opened · 23:27 ✦ ───────────────────────────────────
  ```

  Rule chars (`─`) in muted, glyph (`✦`) in accent, label in title.
  When the label can't fit the width, falls back to a plain rule.

- `renderStitchLine({ width, style })` — quieter alternating-rule line
  for sub-breaks inside a panel:

  ```txt
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  ```

Both lines are themed through `PanelStyle`, so callers pick the role
hue (assistant gold for session moments, teal for thinking transitions,
smoke for system neutrality). The session-info module exposes
`recordSessionStart(status)` (called from `extensions/brand.ts` on the
`session_start` event) so the header always knows the current session
metadata without each render having to re-derive it.

## Footer

The footer is now a quiet brand-mark line — the live runtime status
(`model · git · tools · ctx`) lives in the input editor's nameplate meta
slot, adjacent to where the user is actively typing. The only thing the
footer surfaces is an optional context-warning pip when usage gets tight:

```txt
 Nazar                                                            ctx 92% — running tight
```

Rules:

- Always one line.
- Left: dim `Nazar` brand mark, bold.
- Right: empty until ctx ≥ 85% — then a warning pip in `warning` or
  `error` colour. Otherwise the right side stays clean.

Implementation: [`../lib/ui/footer.ts`](../lib/ui/footer.ts).

## Typography

A terminal can only use one monospace family for the TUI. Nazar's default Basm terminal font is **CozetteVector**: the vector build of Cozette, compact enough to fit the 16-bit/RPG surface while staying readable for chat and tools. Install/apply it locally with:

```bash
bash scripts/install-basm-terminal-fonts.sh
```

That writes a small Kitty include at `~/.config/kitty/nazar.conf` and copies CozetteVector into local fontconfig. Departure Mono and JetBrains Mono remain available via `NAZAR_TERMINAL_FONT="Departure Mono" bash scripts/install-basm-terminal-fonts.sh` and `NAZAR_TERMINAL_FONT="JetBrains Mono" bash scripts/install-basm-terminal-fonts.sh`. Pixelify Sans and Silkscreen remain web/display fonts; do not force them into the daily terminal because they reduce code/chat readability.

## Color rules

Use Basm palette:

- Nazar/name/accent: gold.
- User/name: indigo; avoid making the whole left gutter green.
- Dividers and empty gutter: smoke/muted.
- Thinking avatar marker: gold / ember / teal, kept inside the compact portrait.
- Generated ANSI pixel blocks are the canonical avatar path; emoji remain out of the default TUI because terminal width varies.

## Panel color system and presets

Panel color is resolved in [`../lib/ui/panel-style.ts`](../lib/ui/panel-style.ts):

1. role palette (`user`, `assistant`, `tool`, `thinking`, `system`)
2. optional state accent (`running`, `ok`, `error`, `warning`)
3. user overrides from `~/.pi/agent/settings.json`

The public customization key is `nazarPanelTheme`:

```json
"nazarPanelTheme": {
  "user": { "border": "#5b82e4", "text": "#f4efe4", "background": "#10221f" },
  "assistant": { "border": "#d49a45", "text": "#f4efe4", "background": "#23170f" },
  "tool": { "border": "#86965f", "text": "#f4efe4", "background": "#10221f" },
  "thinking": { "border": "#45b3c0", "text": "#f4efe4", "background": "#102927" },
  "system": { "border": "#70788b", "text": "#f4efe4", "background": "#0f1d2a" }
}
```

Accepted color formats: `#rgb`, `#rrggbb`, `rgb(r,g,b)`, or `r,g,b`. Missing/invalid values fall back to the built-in palette. `nazarPanelStyles` and `nazarPanelColors` are accepted aliases, but `nazarPanelTheme` is canonical.

Rules:

- A single panel border must be internally consistent: all corners, joins, verticals, and horizontal rules use the role border color.
- The label ornament may use the role accent, but it must not make the border edges look broken.
- Role identity should survive state changes. `running` may pulse accents, but should not collapse all borders into one global color.
- `ok`/`error`/`warning` may override a tool border because those states communicate outcome.

Preset intents:

- **persona-icons** (default): strong role identity — user blue, Nazar gold, tool olive/steel, thinking teal, system slate.
- **quiet-smoke**: low-noise review mode — keep backgrounds and text, set all borders to smoke/slate.
- **tool-forward**: debugging mode — make tools teal/green and keep user/Nazar calmer.
- **thinking-forward**: reasoning mode — make thinking cyan/teal and keep completed turns muted.

Quick apply pattern:

```bash
NAZAR_PANEL_PRESET=persona-icons python3 - <<'PY'
import json, os, pathlib
p = pathlib.Path.home() / ".pi" / "agent" / "settings.json"
s = json.loads(p.read_text())
preset = os.environ.get("NAZAR_PANEL_PRESET", "persona-icons")
base = {
  "user": { "text": "#f4efe4", "background": "#10221f" },
  "assistant": { "text": "#f4efe4", "background": "#23170f" },
  "tool": { "text": "#f4efe4", "background": "#10221f" },
  "thinking": { "text": "#f4efe4", "background": "#102927" },
  "system": { "text": "#f4efe4", "background": "#0f1d2a" },
}
borders = {
  "persona-icons": { "user": "#5b82e4", "assistant": "#d49a45", "tool": "#86965f", "thinking": "#45b3c0", "system": "#70788b" },
  "quiet-smoke": { "user": "#566274", "assistant": "#566274", "tool": "#626874", "thinking": "#4c767c", "system": "#70788b" },
  "tool-forward": { "user": "#566e96", "assistant": "#a88440", "tool": "#76d5dc", "thinking": "#4c767c", "system": "#70788b" },
  "thinking-forward": { "user": "#566e96", "assistant": "#a88440", "tool": "#86965f", "thinking": "#76d5dc", "system": "#70788b" },
}[preset]
s["nazarPanelTheme"] = { role: { **base[role], "border": color } for role, color in borders.items() }
p.write_text(json.dumps(s, indent=2) + "\n")
PY
```

Run `/reload` in the Nazar terminal after changing the theme.

## Avatar rendering

See [`avatars.md`](avatars.md).

- Avatars always use canonical 64×64 PNG sprite sheets: one 3×3, 9-frame sheet per avatar/tool.
- The runtime renders those sheets into generated ANSI half-block pixels.
- There is no Kitty/image, Unicode, or ASCII avatar fallback to maintain.

## Implementation notes

Pi currently exposes custom renderers only for custom messages, not built-in user/assistant role messages. Nazar decorates Pi's exported `UserMessageComponent` and `AssistantMessageComponent` in [`../lib/ui/avatars.ts`](../lib/ui/avatars.ts). Keep this patch small, idempotent, and easy to remove if Pi adds official role-rendering hooks.

## Border-free panel system (replaces the double/heavy-line box canon)

The canonical terminal UI uses **background fills, not border-drawing characters**, for all turn
panels. This is the copy-safe principle: terminal selection captures glyphs only, not SGR color
codes. Border glyphs (`┃ ┏ ┗ ━ ╔ ║`) are real glyphs that contaminate clipboard pastes;
background fills are invisible to copy.

The turn panel anatomy is now:

```
[nameplate band — full-width bg fill, role-accent title, no border chars]
[portrait strip — bg-filled avatar columns, no box borders               ]
[empty padding row — panel ambient tint                                  ]
[text body rows — fully copyable, bg-filled                              ]
[empty padding row                                                       ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The bottom `━━━` rule is the only line that may contain a glyph character; it is its own line,
never beside body text, so it does not contaminate a selected range of conversation.

The `╔═◆ label ◆═╗` double-line box language described in earlier versions of this doc is
**retired** for turn panels. It remains acceptable for narrow decorative header/footer frames
(`lib/ui/header.ts`) where the user never selects text inside a frame.

Layout source of truth: [`../lib/ui/turn-composer.ts`](../lib/ui/turn-composer.ts).
Pi adapter: [`../lib/ui/avatars.ts`](../lib/ui/avatars.ts).
