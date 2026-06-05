# Contributing to Nazar 🐉

Thanks for helping build a more sovereign personal computing layer.

## Ground rules
- **License:** Nazar's core is **AGPL-3.0-or-later**. By contributing, you agree your
  contribution is licensed under it.
- **CLA required:** Nazar is *open-core* (a FOSS core plus an optional commercial
  managed-hosting tier), so we ask every contributor to sign a short Contributor
  License Agreement once, before the first PR is merged. This lets the project offer
  the AGPL core **and** a commercial license. See [CLA.md](./CLA.md) — signing is
  automated via cla-assistant on your first pull request.
- **DCO:** also sign off your commits (`git commit -s`) to certify origin (Developer
  Certificate of Origin).

## Scope
- Contributions to the **core** (everything needed to self-host Nazar) are welcome.
- The commercial / managed-hosting layer lives elsewhere and is out of scope here.
- See [OPEN_CORE_BOUNDARY.md](./OPEN_CORE_BOUNDARY.md) for exactly where the line is.

## How to contribute
1. Open an issue describing the change (especially for anything non-trivial).
2. Keep it **KISS / YAGNI / Pareto (80/20)** — aim for ~80% of the value with ~20% of the
   build, then stop. Prefer **subtracting** over adding; if a field/tool/service isn't pulling
   its weight, remove it. Small, focused PRs; one concern each.
3. Add an SPDX header to new source files: `SPDX-License-Identifier: AGPL-3.0-or-later`.
4. Run it locally (`npm run typecheck`, `npm test`, `npm run smoke`, and `pi -e .` for terminal changes) and describe how you tested.

## Values
Sovereignty · open standards · privacy by default · no vendor lock-in · minimalism (KISS · YAGNI · Pareto 80/20).
