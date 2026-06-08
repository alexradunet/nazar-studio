---
name: terminal-font
description: Diagnose and configure Nazar terminal fonts, especially Iosevka Term for high/octant ANSI avatars. Use when avatars look broken, octant glyphs render as artifacts, the user asks about /nazar-ui low/medium/high, or the user wants Pi to configure Kitty/terminal fonts.
---

# Nazar terminal font setup

Use this when Nazar's ANSI avatars look wrong or the user wants `high` avatar quality.

## Model of the problem

Nazar has one native ANSI avatar renderer with three quality levels:

- `low` → half-block (`▀`), safest fallback.
- `medium` → sextant (`U+1FB00…`), default and broadly supported.
- `high` → octant (`U+1CD00…`), highest fidelity but requires a recent font.

If `high` produces tiny marks, boxes, or scrambled icons, the renderer is usually correct and the terminal font/fallback is missing clean octant glyphs.

Recommended terminal font: **Iosevka Term** — https://github.com/be5invis/Iosevka

## Fast diagnosis

Run:

```bash
printf '\U0001CD00 \U0001CD01 \U0001CD02 \U0001CD03\n'
printf '\U0001FB00 \U0001FB01 \U0001FB02 \U0001FB03\n'
fc-list ':charset=1cd00' family file | rg -i 'iosevka|1cd|font' || true
```

Interpretation:

- Octant line looks like solid block fragments → `high` can work.
- Octant line looks like dots/tiny marks/boxes → use `/nazar-ui medium` until the font is fixed.
- Sextant line works but octant does not → normal: medium is safe, high needs newer font coverage.

Inside Pi, prefer the helper command when available:

```txt
/nazar-terminal-font status
```

## Installing Iosevka Term

Ask before installing packages or changing terminal config. Prefer OS package managers and documented upstream releases.

- Linux: use the distro package when available (`iosevka`, `ttc-iosevka`, or similar), or download an upstream release from https://github.com/be5invis/Iosevka/releases and run `fc-cache`.
- macOS: Homebrew commonly provides `brew install --cask font-iosevka`.
- Windows: use `winget` when it has an Iosevka package; ask before using Chocolatey, Scoop, or manual installers.

After installation, verify:

```bash
fc-list | rg -i iosevka || true
fc-list ':charset=1cd00' family file | rg -i iosevka || true
```

## Configure Kitty

If the current terminal is Kitty, the Pi command can do the safe edit with backup:

```txt
/nazar-terminal-font configure
```

It should add or update:

```conf
font_family Iosevka Term
symbol_map U+1CD00-U+1CDEF Iosevka Term
```

Then restart Kitty or reload its config, run the octant glyph test again, and switch:

```txt
/nazar-ui high
```

## Other terminals

Do not guess hidden config formats. Give manual instructions:

1. Set the terminal font family to `Iosevka Term`.
2. If the terminal has symbol fallback maps, map `U+1CD00-U+1CDEF` to Iosevka.
3. Restart/reload the terminal.
4. Run the octant glyph test.
5. Use `/nazar-ui high` only after the test is clean; otherwise stay on `/nazar-ui medium`.
