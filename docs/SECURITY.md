# Security Policy

## Reporting a vulnerability
Please report security issues **privately** to **hello@alexradu.net** (subject:
"Nazar security"). Do **not** open a public issue for vulnerabilities.

We aim to acknowledge within 72 hours and to agree a disclosure timeline with you.
Please allow reasonable time for a fix before public disclosure — we're glad to credit
you.

## Of particular interest
Nazar handles sensitive personal data (journal, health, messages). High-value reports:
- **privacy leaks** — personal data reaching a frontier model unintentionally (the local model is the default; frontier is a manual switch)
- **secret handling** — `.env`, Pi `auth.json`, local-model API key
- **self-modification path** — Nazar runs host-native as your user in the terminal (commit/push/reload); flag privilege or secret-handling gaps there
- **auth** on exposed services (especially the local model endpoint if you bind it beyond loopback)

## Supported versions
During early development, only the latest `main` is supported.
