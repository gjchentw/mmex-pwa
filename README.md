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

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `npm run dev`        | Dev server on :5173                 |
| `npm run build`      | Production build to `dist/`         |
| `npm run preview`    | Serve the production build on :4173 |
| `npm run test:unit`  | Unit tests (Vitest)                 |
| `npm run test:e2e`   | End-to-end tests (Playwright)       |
| `npm run lint`       | Lint and auto-fix                   |
| `npm run lint:check` | Lint without fixing (what CI runs)  |
| `npm run type-check` | Type-check (vue-tsc)                |
| `npm run format`     | Format with Prettier                |

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

| Secret                  | Value                                                                   | Required        |
| ----------------------- | ----------------------------------------------------------------------- | --------------- |
| `CLOUDFLARE_API_TOKEN`  | The token from step 2                                                   | Yes             |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID (Workers & Pages sidebar, or the dashboard URL)              | Yes             |
| `VITE_GOOGLE_CLIENT_ID` | The sole Google credential — OAuth client id for sign-in and Drive sync | For sync builds |

## Specifications

This project follows spec-driven development. Accepted capability specifications live in [`openspec/specs/`](openspec/specs/), work in flight in [`openspec/changes/`](openspec/changes/), and the phase roadmap in [`openspec/designs/domain-capability-map.md`](openspec/designs/domain-capability-map.md).

[`AGENTS.md`](AGENTS.md) is the charter binding every AI agent that works in this repository, whatever tool it runs under — it carries the commit rules, the language rule, the standing duties, and the quality gates, and it overrides tool defaults. The OpenSpec authoring rules it delegates (declarative language, scenario format, diagram requirements) live in [`openspec/config.yaml`](openspec/config.yaml), which the OpenSpec CLI feeds to agents automatically.

## License and attribution

This is a derivative work of [MoneyManagerEx](https://github.com/moneymanagerex/moneymanagerex), which is free software under the **GNU General Public License, version 2**. Because this port carries upstream material into what it ships, the same terms carry with it.

```
Copyright © 2025-2026 gjchentw [gjchentw]

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.
```

The full text is in [LICENSE](LICENSE). Unless a file says otherwise, every source file in this repository is covered by the notice above.

### What is inherited from upstream

Two things, and the second is the one that matters legally:

- **Schema, shipped verbatim.** [`src/workers/sqlite.worker.ts`](src/workers/sqlite.worker.ts) imports `tables.sql` and every `incremental_upgrade/*.sql` from the vendored [`moneymanagerex/database`](https://github.com/moneymanagerex/database) submodule, so upstream's GPL-licensed schema is compiled into the deployed bundle — not merely referenced at build time.
- **Business rules, ported.** The domain layer under [`src/domain/rules/`](src/domain/rules/) reimplements upstream's financial logic in TypeScript — the account-flow function, exchange-rate resolution, the multiplexed repeat encoding, the moving-average cost book, asset compounding, the budget overlay. Each rule cites the `Model_*.cpp` function it mirrors.

Neither is arms-length reuse, so the deployed application is a work based on the Program in the sense of GPL-2.0 §2. The bundle is delivered to the browser, which is distribution: the corresponding source is this public repository, satisfying §3.

### Version range, and why they differ

| Source                             | Grant                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| This repository's own code         | GPL-2.0-**or-later**, matching upstream's file headers                    |
| `moneymanagerex` (C++)             | GPL-2.0-or-later — stated in every file header                            |
| `moneymanagerex/database` (schema) | GPL-2.0 — ships the bare licence text with no "or later" wording anywhere |

The combination is therefore distributable under **GPL-2.0**, the floor set by the schema repository. This project's own code is granted or-later deliberately: the constraint originates in a repository upstream owns, so if upstream ever adopts this port it can clarify its own schema licence and move the whole work forward without needing to relicense this contribution first.

Upstream requires no contributor licence agreement and no copyright assignment — contributors keep their copyright and are listed individually in its `license.txt`. The notice above follows that format.

### Third-party runtime components

Bundled dependencies are MIT (Vue, Quasar, Pinia, Vue Router, `opfs-cloud-file`), except **`@sqlite.org/sqlite-wasm`, which declares Apache-2.0** while wrapping SQLite itself, whose code is public domain.

Apache-2.0 and GPL-2.0 are generally held to be incompatible, so combining that wrapper with GPL-2.0 material in one distribution is a real question rather than a settled one. It is recorded here rather than resolved: the routes out are to move to GPL-3.0 (which needs the schema repository's version range clarified first), to consume the public-domain SQLite Wasm build from sqlite.org without the npm wrapper, or to obtain upstream's own reading. Nothing here is legal advice.
