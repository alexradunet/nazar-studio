---
date: 2026-05-27T19:51:11+0300
author: Alex Radu
commit: 5c5f3ab
branch: main
repository: nazar
topic: "OS-agnostic Nazar TypeScript Pi product"
confidence: medium
complexity: high
status: superseded-by-implementation
tags: [solutions, pi-extension, packaging, os-agnostic, productization]
last_updated: 2026-05-27T19:54:21+0300
last_updated_by: Alex Radu
last_updated_note: "User chose full removal of bundled host operating-system configuration."
---

# Solution Analysis: OS-agnostic Nazar TypeScript Pi product

## Current decision

Nazar is now treated as an OS-agnostic TypeScript Pi extension product. Bundled host operating-system configuration is out of scope for this repository.

## Product boundary

- Keep runtime behavior in TypeScript Pi extensions, Agent Skills, and settings.
- Keep private/generated memory outside git through `PI_MEMORY_*` paths.
- Install Pi, Node.js, QMD, audio helpers, GitHub CLI, `ffmpeg`, and other optional tools through the user's own platform package manager.
- Do not ship machine-specific host service definitions from this public product tree.

## Implementation notes

- Root host configuration files were removed.
- The host configuration directory under `code/` was removed.
- Public docs now describe a host-agnostic product boundary.
- Durable public AI pages were updated to remove bundled host setup assumptions.
- Memory heuristics now reinforce an OS-agnostic TypeScript Pi product boundary.

## Remaining productization work

- Add root package metadata for the Pi package.
- Decide the v1 package surface: memory/context/search only or selected optional adapters.
- Add package smoke tests with a tarball allowlist check.
- Guard optional adapters so missing host tools or native dependencies do not break core startup.
