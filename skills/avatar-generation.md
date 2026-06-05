---
name: avatar-generation
description: "Generate small local avatars or simple pixel-art pictures inline. Use when the user asks to create, draw, generate, visualize, make an avatar/icon/sprite/profile picture, or wants a quick 8-bit/pixel-art image shown in the conversation."
---

# Avatar / small image generation

Use Nazar's local image tool when the user asks to generate a small picture, avatar, icon, sprite, or pixel-art visual and wants to see it in the conversation.

## Tool

Call `nazar_image_generate`.

Parameters:

- `prompt`: concise visual prompt.
- `mode`:
  - `fast-128` — native 128×128, very quick, good for on-the-spot icons.
  - `clean-128` — generate at 128×128.
  - `clean-256` (**default**) — generate a transparent 256×256 PNG.
  - `clean-384` — generate a transparent 384×384 PNG.
  - `clean-512` — generate a transparent 512×512 PNG for higher-detail passes.

  Clean modes also keep a small 128px version for quick inspection.

## Prompt style

Prefer compact pixel-art prompts:

```text
8-bit pixel art avatar, [subject], front-facing, simple silhouette, limited color palette, clean outline, game icon, centered, plain dark background
```

Negative prompt is handled by the tool. The local generator adds the PixelArtRedmond trigger words when its SD1.5 LoRA is installed.

## Behavior

- Use the tool directly; do not describe a manual shell command unless the user asks for setup/debugging.
- Keep default behavior at `clean-256` so avatar asks produce transparent 256×256 PNGs first.
- For fast iteration or when waiting, use `fast-128`.
- If the user says it looks messy or asks for a different style, use `fast-128` for quick retries, then `clean-512` for a higher-detail final pass.
- Keep private memory/preferences local; use them only as prompt hints when relevant.
