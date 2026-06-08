# Nazar Sprite Generation Guide

## Overview

This guide documents the complete sprite generation process for the Nazar visual family—a cohesive collection of pixel-art crystal globes mounted on Romanian folk-art gold pedestals. The visual language combines cosmic/mystical themes with traditional folk aesthetics, rendered in a classic 16-bit RPG pixel-art style.

## Visual Family

The sprite family consists of:
- **Nazar eye orb** — Cosmic eye inside crystal globe (9 emotion frames)
- **Character faces** — Human (male/female) and alien faces inside crystal globes (9 frames each)
- **Tool icons** — Symbolic tools and objects inside crystal globes (9 frames each, typically static)
- **Empty globe template** — Crystal orb with nothing inside (9 frames)
- **Portrait versions** — Single large renderings of Nazar and human faces

All sprites follow a unified pedestal and orb design established by the original Nazar sprite sheet.

## Technical Specifications

### Spritesheet Format
- **Source sheet dimensions:** 512×512 pixels total (RGBA, transparent background)
- **Grid Layout:** 3×3 (3 columns × 3 rows)
- **Frame Size:** 170×170 pixels per frame, 170px stride (content fills 510×510, with a 2px transparent margin on the right/bottom edge of the 512 canvas)
- **Frame Order:** Row-major (left→right, top→bottom)
  - Frame 0 (top-left) = default/neutral state
  - Frames 1–8 = emotion/state variants (for characters), pulse-animation frames (for globes), or identical copies (for static tools)
- **File Format:** PNG with true alpha transparency (colorType 6, 8-bit, non-interlaced)
- **Grid Visibility:** Grid lines must NOT be visible; seamless 3×3 layout

### Generation → Processing Pipeline
Sprites are generated at native **2048×2048** (Gemini 3 Pro Image) on the dark
`#0d0d1a` background, then post-processed by `scripts/process_sprites.py`:
1. Split the 2048 sheet into 9 frames at precise 3×3 boundaries (~683px each)
2. **Background keying:** flood-fill the dark `#0d0d1a` field from each frame's
   border → alpha 0. Connectivity preserves interior dark pixels (eye pupils,
   globe shadows) that are NOT connected to the border, so no holes are punched.
3. Downscale each masked frame to 170×170 (LANCZOS) so the binary mask becomes
   a smooth anti-aliased alpha edge.
4. Reassemble into the 512×512 RGBA sheet.

The 512px transparent sheets feed the ANSI/Chafa renderer directly; the
ANSI half-block backend renders from the downsampled pre-renders built by
`scripts/build-ansi-avatar-assets.ts` (which reads 170px source frames).

### Color Palette & Style
- **Palette:** Old-school 16-bit RPG pixel art
- **Aesthetic:** Romanian folk-art with cosmic/mystical overlay
- **Generation background:** Deep dark (#0d0d1a) — keyed out to transparency in post
- **Orb Interior:** Subtle blue-violet gradient with inner glow
- **Pedestal:** Intricate geometric patterns in gold and deep red
- **Rendering:** No anti-aliasing in source art; alpha edges anti-aliased on downscale

## Reference Image

The **Nazar sprite sheet** (shortId: `tkgwfjwp`) is the established reference for this visual family and must be used as the seed image when generating new sprites.

- **URL:** https://hyperagent.com/api/files/usergenerated/threads/cmq10i8dd0akp0cad765k8oji/images/
- **Purpose:** Defines the pedestal style, orb design, background color, and overall visual language
- **Usage:** Include as inputImages when generating new sprites to ensure consistency

## Base Prompt Template

Use this template as the foundation for all sprite generation. Append the specific icon or character description as needed.

```
Pixel art sprite sheet, 3×3 grid, 9 frames, each frame 64×64 pixels, total 192×192px.
Style: RPG pixel art, old-school 16-bit palette. Romanian folk-art aesthetic.
Each frame shows: a crystal/glass orb globe sitting on a decorative Romanian folk-art gold pedestal.
The pedestal has intricate folk-art geometric patterns in gold and deep red.
The orb has a subtle blue-violet gradient interior glow.
Background: deep dark (#0d0d1a) — consistent across all frames.
No text, no labels. Clean pixel art, no anti-aliasing.
Grid lines must NOT be visible — seamless 3×3 layout.
[SPECIFIC CONTENT DESCRIPTION]
```

Replace `[SPECIFIC CONTENT DESCRIPTION]` with the sprite-specific details (see Sprite Catalog below).

## Generation Parameters

### Model & Quality
- **Model:** `gemini-3-pro-image` (Pro tier for maximum fidelity)
- **Resolution:** 2K
- **Aspect Ratio:** 1:1 (square, required for 192×192px output)
- **Quality Setting:** High (default or explicitly set)

### Seed Images
- **Reference Input:** Always include the Nazar sprite sheet (shortId `tkgwfjwp`) as `inputImages`
- **Purpose:** Ensures pedestal style, orb design, and color palette consistency across the family

## Sprite Catalog

### Character Sprites (Animation Frames)

Each character sprite contains 9 frames representing different emotions or states:

#### Nazar (Cosmic Eye Orb)
- **File:** `assets/avatars/nazar.png`
- **Shortcut ID:** `tkgwfjwp` (reference/seed image)
- **Content:** Stylized cosmic eye inside crystal orb
- **Frames:** 9 emotion states
  - Frame 0: Neutral
  - Frame 1: Curious
  - Frame 2: Focused
  - Frame 3: Pleased
  - Frame 4: Concerned
  - Frame 5: Playful
  - Frame 6: Wise
  - Frame 7: Alert
  - Frame 8: Resting

**Generation Prompt Addition:**
```
Inside the orb: a stylized cosmic eye with an iris, pupil, and arcane glow. 
The eye expresses nine emotions: neutral, curious, focused, pleased, concerned, playful, wise, alert, and resting.
Frame 0 (neutral) shows the eye straight-ahead with a calm gaze.
Subsequent frames show subtle expressions: narrowed for focus, widened for curiosity, tilted for concern, etc.
The arcane glow intensifies or dims to match emotional intensity.
```

#### Nazar Expressions
- **File:** `assets/avatars/nazar-expr.png`
- **Content:** Contextual Nazar mood expressions
- **Frames:** 9 emotion states used by the live assistant panel

#### User Avatar — Mage Alien
- **File:** `assets/avatars/mage-alien.png`
- **Shortcut ID:** `xuth8abi`
- **Character Details:** Alien humanoid, large eyes, no hair, pale or green tint, visible neck
- **Gaze:** Straight forward
- **Frames:** 9 typing/portrait states

**Generation Prompt Addition:**
```
Inside the orb: an alien humanoid face.
Features: large expressive eyes, no hair, pale or slightly green-tinted skin.
The face shows from forehead to shoulders, with visible neck.
Expression: neutral, straightforward gaze directly at viewer.
All 9 frames stay consistent as a compact user portrait.
```

### Tool Icons (Static Frames)

Tool icons are mounted in the crystal globes. All 9 frames are currently identical (no animation states used). Each tool represents a concept or domain.

**Location:** `assets/avatars/tools/`

**Generation Prompt Addition Template (for any tool):**
```
Inside the orb: a [TOOL DESCRIPTION].
Style: simple, iconic, immediately recognizable even at 64×64px.
The icon is rendered in pixel-art style with a limited palette.
All 9 frames are identical (static icon, no animation).
```

#### Original Tool Set

- **anvil.png** (shortId: `9cn9kr6j`)
  - Content: Blacksmith anvil icon
  - Prompt: "a blacksmith anvil, drawn as a classic iron anvil on a base"

- **scroll.png** (shortId: `n5l8bxw6`)
  - Content: Rolled parchment scroll
  - Prompt: "a rolled parchment scroll, tied with a ribbon"

- **quill.png** (shortId: `exkj7r0c`)
  - Content: Feather quill pen
  - Prompt: "a feather quill pen with a wooden stem and feather tip"

- **needle.png** (shortId: `fe0ko900`)
  - Content: Sewing needle with thread
  - Prompt: "a sewing needle with thread running through it"

- **lens.png** (shortId: `h6cikzek`)
  - Content: Magnifying lens
  - Prompt: "a magnifying lens or magnifying glass"

- **folder.png** (shortId: `1xi13svy`)
  - Content: Folder or files icon
  - Prompt: "a folder icon with multiple documents or files"

- **keeper.png** (shortId: `1y5ygzak`)
  - Content: Key and lock keeper
  - Prompt: "a key and lock, representing a keeper or guardian"

- **warden.png** (shortId: `od2q38hq`)
  - Content: Shield warden
  - Prompt: "a shield or protective emblem, representing a warden"

- **new-head.png** (shortId: `dcnvt024`)
  - Content: New/plus icon
  - Prompt: "a plus or 'new' icon, possibly with a head silhouette to represent new people"

- **seer.png** (shortId: `k7riaj0k`)
  - Content: All-seeing eye (alternate cosmic eye variant)
  - Prompt: "an all-seeing eye or cosmic eye, similar to but distinct from the Nazar eye"

- **hammer.png** (shortId: `lnllromk`)
  - Content: Magical hammer
  - Prompt: "a magical hammer, possibly with glowing runes or ethereal effects"

#### New Domain Tools (Expansion Set)

These tools represent additional life domains beyond the original craft-focused set.

- **journal.png** (shortId: `d9s66rc3`)
  - Domain: Journaling / Reflection
  - Prompt: "an open journal or notebook with visible pages, suggesting writing and reflection"

- **dumbbell.png** (shortId: `bqaxb7cd`)
  - Domain: Fitness / Exercise
  - Prompt: "a dumbbell or weight, representing physical training and fitness"

- **plate-fork.png** (shortId: `ambj4np7`)
  - Domain: Nutrition / Food
  - Prompt: "a plate and fork, representing food, cooking, and nutrition"

- **heart-pulse.png** (shortId: `noohtrxz`)
  - Domain: Health / Wellness
  - Prompt: "a heart with a pulse or heartbeat line, representing health and vitality"

- **moon-stars.png** (shortId: `5qe5o478`)
  - Domain: Sleep / Rest
  - Prompt: "a moon and stars, representing sleep, rest, and night"

- **calendar.png** (shortId: `llqectmg`)
  - Domain: Schedule / Time Management
  - Prompt: "a calendar or date representation, indicating scheduling and time management"

- **envelope.png** (shortId: `astn6isi`)
  - Domain: Communication / Mail
  - Prompt: "an envelope or letter, representing communication and correspondence"

- **map-pin.png** (shortId: `7d6hr5r6`)
  - Domain: Location / Travel
  - Prompt: "a map pin or location marker, representing places and navigation"

- **coin-stack.png** (shortId: `rthpgmpy`)
  - Domain: Finance / Money
  - Prompt: "a stack of coins, representing finances, money, and wealth"

- **music-note.png** (shortId: `q1q3jkfh`)
  - Domain: Music / Arts
  - Prompt: "a musical note or staff, representing music and creative arts"

- **camera.png** (shortId: `s5h772vf`)
  - Domain: Photography / Visual Media
  - Prompt: "a camera or photography symbol, representing visual media and creativity"

- **pill-potion.png** (shortId: `majwqpx3`)
  - Domain: Medicine / Care
  - Prompt: "a pill or potion bottle, representing medicine, healthcare, and treatment"

- **brain.png** (shortId: `rka4chdq`)
  - Domain: Learning / Cognition
  - Prompt: "a brain or mind symbol, representing learning, thinking, and knowledge"

- **compass.png** (shortId: `uvhvc88v`)
  - Domain: Navigation / Direction
  - Prompt: "a compass, representing direction, guidance, and navigation"

- **seedling.png** (shortId: `nzxqxjwf`)
  - Domain: Growth / Nature
  - Prompt: "a seedling or young plant, representing growth, nature, and development"

- **hourglass.png** (shortId: `txl6axky`)
  - Domain: Time / Patience
  - Prompt: "an hourglass, representing time, patience, and the passage of moments"

- **key.png** (shortId: `j1p4kmsh`)
  - Domain: Access / Unlocking
  - Prompt: "a key, representing access, unlocking, and secrets"

- **bell.png** (shortId: `v5iwxxbs`)
  - Domain: Notifications / Awareness
  - Prompt: "a bell, representing notifications, alerts, and awareness"

#### Icon-Pack Expansion — Dev / Engineering Tools

Globe icons for engineering work. `rocket` and `gear` are ANIMATED across
their 9 frames (launch / rotation).

- **terminal.png** — command-line prompt `>_`
- **code.png** — code brackets `</>`
- **git-branch.png** — git branch diagram
- **git-merge.png** — git merge diagram
- **database.png** — stacked DB cylinders
- **cloud.png** — cloud computing/storage
- **browser.png** — web browser window
- **container.png** — cargo containers (docker-style)
- **chat.png** — chat/speech bubble
- **gamepad.png** — game controller
- **rocket.png** ★animated — rocket launch (flame grows frame-to-frame)
- **gear.png** ★animated — settings cog (rotates frame-to-frame)

#### Icon-Pack Expansion — Objects / Status / Actions

`lightbulb`, `flask`, `atom`, `star`, `flag` are ANIMATED across their 9 frames.

- **lightbulb.png** ★animated — idea (pulsing glow)
- **trophy.png** — achievement / win
- **target.png** — goal / bullseye
- **flask.png** ★animated — experiment (bubbling)
- **atom.png** ★animated — science (orbiting electrons)
- **bug.png** — debugging
- **lock.png** — security / locked
- **star.png** ★animated — favorite (twinkle)
- **flag.png** ★animated — milestone (waving)
- **gift.png** — reward / present
- **cart.png** — commerce / shopping
- **paint-brush.png** — design / art
- **wrench.png** — repair / config
- **bookmark.png** — save / bookmark

> **Animation in the runtime:** tools whose 9 frames are an animation cycle
> through their own frames while running. Static-icon tools borrow one of the
> six coloured globes (`globe-*`) as their running animation. See
> `ANIMATED_TOOL_KINDS` and `TOOL_RUNNING_GLOBE` in `lib/ui/pixel-avatar.ts`.

## Reproduction Workflow

Follow these steps to generate new sprites in the Nazar family:

### 1. Prepare the Reference
- Obtain the Nazar sprite sheet (shortId: `tkgwfjwp`)
- Use it as the seed/reference image (inputImages parameter)

### 2. Compose the Generation Prompt
- Start with the base prompt template
- Append the sprite-specific content description from the Sprite Catalog above
- Ensure all details are clear and unambiguous

### 3. Configure Generation Settings
- **Model:** `gemini-3-pro-image`
- **Resolution:** 2K
- **Aspect Ratio:** 1:1
- **Input Images:** `tkgwfjwp` (Nazar sprite sheet)

### 4. Generate the Sprite
- Submit the prompt with all parameters
- Verify the output is 192×192px with a 3×3 grid
- Check that the pedestal style matches the reference
- Confirm the background color is #0d0d1a
- Ensure no visible grid lines in the output

### 5. Validate the Output
- **Dimensions:** Exactly 192×192px
- **Grid Layout:** 3 columns × 3 rows, seamless
- **Frame Count:** 9 distinct frames (or 9 identical copies for static icons)
- **Visual Consistency:** Pedestal, orb, background, and color palette match the reference
- **Quality:** Clean pixel art without anti-aliasing artifacts
- **Readability:** Icons (if applicable) are clearly recognizable at 64×64px

### 6. Store and Catalog
- Save the PNG file to the appropriate location
- Document the shortId for future reference
- Update the Sprite Catalog if this is a new sprite
- Note any variations or special properties

## Best Practices

### Consistency Checks
- **Always use the Nazar sprite sheet as the seed image** to maintain visual family cohesion
- **Verify pedestal details** match exactly: gold color, geometric patterns, deep red accents
- **Check orb design**: blue-violet gradient interior glow must be consistent
- **Confirm background**: all sprites use #0d0d1a

### Prompt Clarity
- Be specific about frame count and layout (3×3, 64×64px per frame, 192×192px total)
- Describe the content inside the orb clearly
- Mention emotional states or variations if applicable
- Specify "all 9 frames identical" for static icons

### Quality Assurance
- Generate at 2K resolution to preserve pixel-art details
- Use Pro-tier model for fidelity
- Never scale down from a lower resolution
- Review the spritesheet to ensure no visible grid lines
- Check that each frame is properly centered in its 64×64px area

### Scaling & Reuse
- The 64×64px frame size is the reference size
- Sprites can be scaled down 2× to 32×32px for UI usage
- Do not upscale beyond 64×64px without re-generation
- Always maintain integer scaling (2×, 3×, 4×) to preserve pixel-art quality

## Future Expansion

### Animation States
Tool icons currently use static (identical) 9-frame layouts. Future versions could introduce:
- Frame variations showing the tool in use
- Animated sequences (e.g., hammer swinging, scroll unrolling)
- State changes (e.g., active/inactive, lit/unlit)

### Character Expressions
Character sprites (Nazar, faces) currently show primarily neutral expressions. Future refinement could:
- Develop distinct emotional expression variations across frames
- Add mouth/eye movements
- Incorporate lighting changes to convey mood

### New Character Types
Potential additions:
- Dwarf face
- Elf face
- Additional cosmic entities
- Pet or creature companions

### Interactive Elements
- Glowing effects or auras around the orb
- Dynamic backgrounds (stars, mystical energy)
- Seasonal or themed variant pedestals

## Technical Notes

### Pixel Art Rendering
- Disable anti-aliasing in generation
- Preserve hard edges and clean pixels
- Use a limited, cohesive color palette
- Maintain consistent line weight

### File Format
- Always export as PNG with transparency support
- Use indexed color or RGB mode depending on tool constraints
- Optimize file size without compromising quality
- Verify transparency is preserved in pedestal/frame boundaries

### Version Control
- Document the shortId for each sprite
- Keep a record of generation parameters used
- Store reference images for visual comparison
- Note any special modifications or exceptions

## Related Assets

- Nazar sprite sheet (reference): shortId `tkgwfjwp`
- Nazar portrait: shortId `lhheol3v`
- Male face (Mage): shortId `dqq3q4a8`
- Female face (Mage): shortId `cj8u0ayi`
- Alien face: shortId `xuth8abi`
- Male portrait: shortId `isrkuhmp`
- Empty globe: shortId `9rfb4wge`

All tool sprites are catalogued in the Tool Icons section above with their respective shortIds.

---

**Last Updated:** 2026-06-06  
**Version:** 1.0  
**Maintained By:** Nazar Studio Design Team
