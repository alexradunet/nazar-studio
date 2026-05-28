# Nazar public project instructions

This repository is the public source package for Nazar, a Pi-native local-first memory appliance built as an OS-agnostic TypeScript extension product.

## Working style

- Prefer direct, practical implementation steps.
- Keep solutions KISS, inspectable, and reversible.
- Use TypeScript/JavaScript for Pi extension logic and product runtime code.
- Keep private memory, generated context, journals, rollups, OAuth tokens, WhatsApp auth state, and local model downloads out of git.
- Prefer Pi extension points, Agent Skills, and settings over wrapper scripts or Pi core patches.
- Keep host operating-system setup outside this repository; document only portable environment variables and extension-level configuration here.
- On Windows, install every Nazar host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.

## Safety

- Do not expose SSH/RDP/remote desktop services to the internet without an explicit threat model and VPN/tunnel plan.
- Never commit secrets, raw session transcripts, private journals, OAuth callback URLs, access tokens, refresh tokens, or personal memory pages.
