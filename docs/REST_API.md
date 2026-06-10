<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Balaur REST API gateway

The first gateway surface is a tiny Bun-native REST API over Balaur's runtime gateway contract.

It is deliberately basic:

- bound to `127.0.0.1` by default
- no browser UI
- no external account/session
- no transport dependency
- useful for testing the contract that future WhatsApp/Signal adapters will use

Run it with:

```bash
bun run api
```

Optional environment variables:

```bash
BALAUR_API_HOST=127.0.0.1
BALAUR_API_PORT=8787
```

Endpoints:

```http
GET /health
```

```http
POST /api/messages
content-type: application/json

{ "clientId": "local", "text": "hello" }
```

Returns `202 { "ok": true }` after the message has been queued for the runtime bus. Poll `/api/events` for output.

```http
GET /api/events?clientId=local&after=0
```

Returns buffered runtime output for that client:

```json
{
  "ok": true,
  "events": [
    { "id": 1, "sourceId": "local", "kind": "outbound", "text": "..." }
  ]
}
```

Keep it loopback-only unless there is an explicit auth and threat model.
