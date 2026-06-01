# mmex-pwa

Vue 3 + Quasar + Vite PWA. SQLite via WASM (`@sqlite.org/sqlite-wasm`) runs in a Web Worker.

## Quick start

```sh
npm install
npm run dev      # vite dev server (requires COOP/COEP headers for sqlite-wasm OPFS)
npm run build    # type-check then build (parallel via run-p)
```

## Commands

| Command | What |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `run-p type-check "build-only"` |
| `npm run preview` | Vite preview (port 4173) |
| `npm run test:unit` | Vitest (jsdom env) |
| `npm run test:e2e` | Playwright (chromium/firefox/webkit) |
| `npm run type-check` | `vue-tsc --build` |
| `npm run lint` | `eslint . --fix --cache` |
| `npm run format` | `prettier --write src/` |

## OpenSpec specs

All feature changes must first be documented as an OpenSpec spec under `openspec/`. Implementation follows the spec.

Each spec record MUST include the following files:
- `proposal.md` — scope, scenarios, and non-goals
- `spec.md` — detailed specification
- `design.md` — frontend implementation design
- `tasks.md` — task breakdown
- `*.drawio` — user flow or system flow diagram (one or more files, as needed by the spec)

## Git workflow

Squash merge feature branches to master.

## Architecture

- **`src/main.ts`** — app bootstrap (Vue, Pinia, Quasar, Router, i18n)
- **`src/workers/`** — SQLite WASM in a Web Worker
  - `sqlite.worker.ts` — owns `OpfsDb`, handles init/open/exec via postMessage
  - `db-client.ts` — `DbClient` class wrapping worker communication with request IDs
- **`src/locales/`** — i18n JSON + PO files (en-US, zh-TW); compiled by `unplugin-vue-i18n`
- **`mmex/database/`** — git submodule: MMEX SQL schema (`tables.sql`) & incremental upgrade SQL
- **`mmex/moneymanagerex/`** — git submodule: full MMEX C++ desktop source (see `openspec/MMEX.md` for architecture)

## Dev server caveats

- `vite.config.ts` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — required for sqlite-wasm OPFS; do not remove
- `@sqlite.org/sqlite-wasm` is excluded from `optimizeDeps` — must stay excluded

## Testing

- **Unit tests** (`src/__tests__/`): vitest + @vue/test-utils, jsdom env
  - Worker tests require mocking `sqlite.worker?worker`, `import.meta.glob`, and `crypto.randomUUID`
  - `App.spec.ts` is skipped (`it.skip`)
- **E2E** (`e2e/`): Playwright, auto-starts dev or preview server; CI uses port 4173 (preview), local uses 5173 (dev)

## Code style

- Prettier: no semicolons, single quotes, printWidth 100
- ESLint flat config with `@vue/eslint-config-typescript` (recommended), `eslint-plugin-vue` (essential), Vitest & Playwright plugins
- `lint` auto-fixes and caches; run before pushing
- No `opencode.json` in repo root (`.opencode/` is for OpenCode skills only)

## UI Design

- UI design MUST follow Quasar's Material Design guidelines and Quasar Best Practices

## Constraints

- `build` runs type-check first (fails fast on type errors)
- CI only runs `npm run test:unit`; type-check and lint are local-only
- All AI-generated documents in this repo MUST be written in English
- Google OAuth environment variable names and setup to be defined via OpenSpec spec
- Code analysis MUST use AST parsing to achieve complete structural understanding
