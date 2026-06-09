<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# GitHub Pages setup guide for nazar.studio

## What to do (three steps)

### Step 1 — Add the workflow (you must do this via the GitHub UI — the API token can't write workflow files)

1. Go to https://github.com/alexradunet/nazar-studio
2. Click **Add file → Create new file**
3. Type the filename: `.github/workflows/pages.yml`
4. Paste the exact content from [`pages.yml`](../pages.yml) in the repo root (or from below)
5. Commit directly to `main`

The workflow deploys the `web/` directory to Pages on every push to `main`.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Step 2 — Enable GitHub Pages in repo Settings

1. Go to **Settings → Pages**
2. Source: **GitHub Actions** (not "Deploy from a branch")
3. Custom domain: `nazar.studio`
4. Tick **Enforce HTTPS** (after DNS propagates — may take up to 24h)

### Step 3 — DNS at your registrar

Add these records for `nazar.studio` (apex / naked domain):

**A records (IPv4) — point to GitHub Pages:**
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**AAAA records (IPv6):**
```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

**CNAME for www subdomain (optional — redirects www.nazar.studio):**
```
www  →  alexradunet.github.io
```

> Note: GitHub Pages is served via GitHub's CDN (US infrastructure). For a public-facing
> product landing page this is a pragmatic tradeoff — no personal data is served here,
> only static assets. The sovereign, private vault runs on your own box.

## After setup

Once DNS propagates and the workflow runs:
- https://nazar.studio serves `web/index.html`
- HTTPS is auto-provisioned via Let's Encrypt
- Every push to `main` that touches `web/` triggers a redeploy (~1 min)

Don't forget to drop in the binary bundle first:
`web/crest.png`, `web/logo.png`, `web/fonts/*.woff2`
