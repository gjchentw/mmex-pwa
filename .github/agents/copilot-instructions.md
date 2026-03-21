# mmex-pwa Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-19

## Active Technologies
- TypeScript 5.9 (project runtime), GitHub Actions workflow YAML + Node.js 22 in CI, npm, actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4, Playwright (001-fix-ci-cd-pages)
- N/A for runtime feature scope; CI artifacts and GitHub Pages deployment storage (001-fix-ci-cd-pages)
- TypeScript (strict mode); ES2022 targe + Vue 3 (Composition API), Quasar Framework, Pinia, vue-i18n, @sqlite.org/sqlite-wasm (002-organize-tools-module)
- OPFS SQLite via Web Worker (`src/workers/sqlite.worker.ts` + `src/workers/db-client.ts`) (002-organize-tools-module)
- TypeScript 5.9.0 (strict mode, ES2022 target) + Vue 3.5.22 (Composition API), Quasar 2.18.6, Vue Router 4.6.3, Pinia 3.0.3, vue-i18n 12.0.0-alpha.3 (002-organize-tools-module)
- OPFS SQLite via @sqlite.org/sqlite-wasm 3.51.1-build1, running in dedicated Web Worker (002-organize-tools-module)

- TypeScript 5.9 (project runtime), GitHub Actions workflow YAML + Node.js 22 runtime in CI, npm, actions/checkout@v4, actions/setup-node@v4, GitHub Pages official deploy actions (001-fix-ci-cd-pages)

## Project Structure

```text
src/          # Vue 3 application source (components, stores, workers, router)
e2e/          # Playwright end-to-end tests
mmex/         # Git submodule: moneymanagerex/database (SQL schemas + upgrades)
public/       # Static assets
.github/      # CI/CD workflows and scripts
specs/        # Feature specifications and planning documents
```

## Commands

npm run test:unit && npm run lint

## Code Style

TypeScript 5.9 (project runtime), GitHub Actions workflow YAML: Follow standard conventions

## Recent Changes
- 002-organize-tools-module: Added TypeScript 5.9.0 (strict mode, ES2022 target) + Vue 3.5.22 (Composition API), Quasar 2.18.6, Vue Router 4.6.3, Pinia 3.0.3, vue-i18n 12.0.0-alpha.3
- 002-organize-tools-module: Added TypeScript 5.9.0 (strict mode, ES2022 target) + Vue 3.5.22 (Composition API), Quasar 2.18.6, Vue Router 4.6.3, Pinia 3.0.3, vue-i18n 12.0.0-alpha.3
- 002-organize-tools-module: Added TypeScript (strict mode); ES2022 targe + Vue 3 (Composition API), Quasar Framework, Pinia, vue-i18n, @sqlite.org/sqlite-wasm


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
