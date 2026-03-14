# mmex-pwa Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-14

## Active Technologies
- TypeScript 5.9 (project runtime), GitHub Actions workflow YAML + Node.js 22 in CI, npm, actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4, Playwright (001-fix-ci-cd-pages)
- N/A for runtime feature scope; CI artifacts and GitHub Pages deployment storage (001-fix-ci-cd-pages)

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
- 001-fix-ci-cd-pages: Added TypeScript 5.9 (project runtime), GitHub Actions workflow YAML + Node.js 22 in CI, npm, actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4, Playwright

- 001-fix-ci-cd-pages: Added TypeScript 5.9 (project runtime), GitHub Actions workflow YAML + Node.js 22 runtime in CI, npm, actions/checkout@v4, actions/setup-node@v4, GitHub Pages official deploy actions

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
