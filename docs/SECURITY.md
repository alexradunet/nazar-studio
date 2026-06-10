<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Security Policy

## Reporting a vulnerability
Please report security issues **privately** to **hello@alexradu.net** (subject:
"Balaur security"). Do **not** open a public issue for vulnerabilities.

We aim to acknowledge within 72 hours and to agree a disclosure timeline with you.
Please allow reasonable time for a fix before public disclosure — we're glad to credit
you.

## Of particular interest
Balaur handles sensitive personal data (journal, health, messages). High-value reports:
- **privacy leaks** — personal data reaching a provider unintentionally. Model/provider selection is explicit; keep secrets out of vault entries that may be sent to a provider.
- **secret handling** — `.env`, provider API keys, OAuth tokens, local runtime credentials
- **self-modification path** — future human-approved edit/test/commit flows run host-native as your user; flag privilege or secret-handling gaps there
- **auth** on exposed services or future gateway adapters

## Supported versions
During early development, only the latest `main` is supported.
