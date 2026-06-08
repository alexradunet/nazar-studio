# Nazar Studio — 30 new tool sprites (future-use library)

Adds 30 new tool avatars in the locked **Style-A "icon-in-orb"** family (a rich,
colored, shaded pixel-art icon glowing inside its domain-colored crystal orb with
gold filigree — identical structure to the existing 27, no pedestal, with the subtle
glow-pulse "working" animation). Each is a 768×768 RGBA 3×3 nine-frame sheet plus an
ANSI half-block prerender, fully wired into the loader so the right icon auto-selects
from a running tool's name.

This is a **future-use library** spanning four areas: coding/engineering,
life-management, calls/communication, and popular app integrations.

## Drop-in (mirrors the repo tree)
```
assets/avatars/tools/eye-<name>.png        # 30 new HD sheets (768×768, 9 frames)
assets/avatars/ansi/tools/eye-<name>.png   # 30 new ANSI prerenders (24×18)
lib/ui/pixel-avatar.ts                      # loader: types + maps + inference (full file)
scripts/build-ansi-avatar-assets.ts         # ANSI builder: new eyes added to SHEETS (full file)
```
Copy these over the same paths in your repo. Then regenerate ANSI if you wish
(already included, but to be safe): `node scripts/build-ansi-avatar-assets.ts`.

## The 30 new tools  (logical kind → eye sprite → orb color)
### Coding / engineering (10)
| tool name | eye sprite | orb | symbol |
|---|---|---|---|
| git-branch | eye-git | indigo | branch graph |
| git-merge | eye-merge | indigo | merge arrows |
| database | eye-database | slate | DB cylinders |
| cloud | eye-cloud | indigo | cloud |
| container | eye-container | slate | crate/box |
| bug | eye-bug | red | beetle/debug |
| api | eye-api | teal | node burst |
| code | eye-code | teal | `</>` brackets |
| lock | eye-lock | slate | padlock |
| package | eye-package | gold | build cube |

### Life-management (8)
| tasks | eye-tasks | teal | clipboard checklist |
| habit | eye-habit | green | streak flame |
| weight | eye-weight | teal | scale dial |
| water | eye-water | indigo | hydration drop |
| (medication) pill-potion | eye-meds | red | pill capsule |
| mood | eye-mood | violet | smiley face |
| (goal) target | eye-goal | ember | bullseye + dart |
| cart | eye-cart | gold | shopping cart |

### Calls / communication (6)
| phone | eye-phone | teal | handset |
| video | eye-video | indigo | video camera |
| chat | eye-chat | teal | speech bubble |
| contacts | eye-contacts | indigo | person card |
| mic | eye-mic | violet | microphone |
| bell | eye-bell | gold | notification bell |

### Apps / integrations (6, generic category glyphs — not brand logos)
| share | eye-share | indigo | social nodes |
| drive | eye-drive | indigo | cloud/disk storage |
| card | eye-card | gold | credit card |
| (map-pin) map | eye-map | green | location pin |
| media | eye-media | violet | play button |
| docs | eye-docs | teal | document page |

## Loader changes (lib/ui/pixel-avatar.ts)
- **EyeKind / EYE_KINDS:** +30 dedicated eyes (27 → 57).
- **TOOL_KINDS:** +16 new logical kinds (api, package, tasks, habit, weight, water,
  mood, phone, video, contacts, mic, share, drive, card, media, docs). 56 → 72.
- **KIND_TO_EYE:** 14 existing kinds **repointed** from reused approximations to their
  dedicated sprites (code: write→code, git-branch: deploy→git, git-merge: deploy→merge,
  database: files→database, cloud: deploy→cloud, container: deploy→container,
  chat: mail→chat, bug: edit→bug, lock: idle→lock, cart: idle→cart, target: grep→goal,
  bell: idle→bell, map-pin: browser→map, pill-potion: health→meds), plus 16 new mappings.
- **toolKind() inference:** added keyword detection for every new kind, ordered so
  specific terms win over broad ones and existing tested behavior is preserved (e.g.
  "task list"/"kanban"→tasks while bare "task"/"todo" still→calendar; "card payment"/
  "stripe"→card while bare "payment"→coin-stack; "habit"/"streak"→habit; "mood"/
  "feeling"→mood). Bare ambiguous substrings ("mic", "drive", "card", "api") were
  avoided to prevent false matches (microsoft, driver, sceptical, rapid, etc.).

Note: the old **eye-deploy** sprite is now an unused spare (all four kinds that used it
moved to dedicated eyes); the dedicated **rocket** eye covers deploy/launch/ship-it intent.

## Validation
Done in this sandbox (npm registry is firewalled, so tsc/vitest run in your env):
- HD ↔ ANSI eye sets are identical (57/57).
- Static wiring check PASSES: KIND_TO_EYE is total over all 72 TOOL_KINDS with no stray
  keys; every mapped eye is a declared EyeKind and has both HD + ANSI files on disk; all
  62 toolKind() return values are declared kinds.

Pending in your environment:
- `npm run typecheck` / `tsc` (confirms the Record<ToolAvatarKind, EyeKind> totality at
  the type level — already verified structurally here).
- `vitest run lib/ui/pixel-avatar.test.ts` (existing tests check render widths/backends/
  frame-cycling and that different tools render differently — unaffected by these edits).
- `npm run build:tokens --check` if you regrade colors.

## Regenerating the sprites
`build_tools2.py` (included) is the generator: it keys each isolated colored icon off
its flat dark background and composites it into the shared orb template (center ~0.45 +
gaussian-blur glow underlay), then cross-fades a 9-frame glow pulse into a 768×768 sheet.
Source icons are not bundled (they live in the workspace); swap any icon and rerun.
