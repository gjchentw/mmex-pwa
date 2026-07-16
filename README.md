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

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, format-check, type-check, unit tests, and a production build on every push and pull request.

The **e2e** and **Cloudflare Pages deploy** jobs are written but commented out. They are blocked on defects in the production build — most importantly, the built worker requests an unhashed `sqlite3.wasm` that the SPA fallback answers with `index.html`, so the database cannot open in a built app. Enabling deployment before that is fixed would ship an app that is broken for everyone. The blockers are documented in [`openspec/changes/infrastructure-baseline/design.md`](openspec/changes/infrastructure-baseline/design.md) and in the comment block at the bottom of the workflow.

When enabled, deploying will require two repository secrets: `CLOUDFLARE_API_TOKEN` (scoped to Pages:Edit) and `CLOUDFLARE_ACCOUNT_ID`.

## Specifications

This project follows spec-driven development. The governing infrastructure specification lives in [`openspec/`](openspec/); see [`openspec/AGENTS.md`](openspec/AGENTS.md) for the authoring rules.
