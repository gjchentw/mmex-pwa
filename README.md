# My MMEX Progressive Web App (PWA) Version

[![ci](https://github.com/gjchentw/mmex-pwa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gjchentw/mmex-pwa/actions/workflows/ci.yml)

A browser-native port of [MoneyManagerEx](https://github.com/moneymanagerex/moneymanagerex). The database is a real SQLite file, compiled to WebAssembly and stored in the browser's origin-private file system — there is no backend, and financial data never leaves the device unless Google Drive sync is enabled.

## Setup

The upstream MMEX schema is vendored as a git submodule and **the build imports from it** — a clone without submodules will not build.

```bash
git clone --recurse-submodules https://github.com/gjchentw/mmex-pwa.git

# already cloned without --recurse-submodules?
git submodule update --init

nvm use          # reads .nvmrc
npm install

cp .env.example .env   # then fill in the Google credentials
```

> Every `VITE_*` value is inlined into the client bundle and is publicly readable. They are identifiers, not secrets — restrict them by authorized origin in the Google Cloud console.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build on :4173 |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run lint` | Lint and auto-fix |
| `npm run lint:check` | Lint without fixing (what CI runs) |
| `npm run type-check` | Type-check (vue-tsc) |
| `npm run format` | Format with Prettier |

## Cross-origin isolation

SQLite WASM and OPFS need `SharedArrayBuffer`, which browsers expose **only** to cross-origin isolated pages. Every environment that serves the app must send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are configured in [`vite.config.ts`](vite.config.ts) (for both `dev` and `preview`) and in [`public/_headers`](public/_headers) (for Cloudflare Pages). If `window.crossOriginIsolated` is `false` the database will not open — that is the first thing to check when persistence misbehaves.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, format-check, type-check, unit tests, and a production build on every push and pull request. On a push to `main`, a `deploy` job publishes to Cloudflare Pages.

The gate is **structural**, not procedural: `deploy` declares `needs: [quality, build]`, so a failing check makes deployment unreachable rather than merely discouraged. It publishes the exact artifact the gate verified rather than rebuilding.

The Playwright e2e suite (cross-origin isolation + the database actually opening against a preview build) is **not part of CI** — removed by operator decision on 2026-07-18 ([design.md D12](openspec/changes/infrastructure-baseline/design.md)). Run it locally before shipping risky changes:

```bash
npm run build && CI=true npm run test:e2e -- --project=chromium
```

### Deployment setup

1. **Create the Pages project first** — `npx wrangler pages project create mmex-pwa --production-branch=main`, or via the dashboard (Workers & Pages → Create → Pages → Upload assets). It must be named `mmex-pwa` to match `--project-name` in the workflow. `pages deploy` will not create it unattended: it prompts for the production branch, and prompting in CI is an error.
2. **Create an API token** at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Custom token, with the single permission **Account → Cloudflare Pages → Edit**.
3. **Add repository secrets** under Settings → Secrets and variables → Actions:

| Secret | Value | Required |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | The token from step 2 | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID (Workers & Pages sidebar, or the dashboard URL) | Yes |
| `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` / `VITE_GOOGLE_APP_ID` | Google Picker credentials | No — nothing reads them yet |

## Specifications

This project follows spec-driven development. The governing infrastructure specification lives in [`openspec/`](openspec/); see [`openspec/AGENTS.md`](openspec/AGENTS.md) for the authoring rules.
