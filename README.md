# My MMEX Progressive Web App (PWA) Version

![Unit Tests](https://github.com/gjchentw/mmex-pwa/actions/workflows/test.yml/badge.svg?branch=master)

## CI/CD Architecture

The repository uses a two-stage GitHub Actions model:

1. Validation workflow ([.github/workflows/test.yml](.github/workflows/test.yml))
- Triggered on push and pull request (docs-only paths are ignored).
- Executes strict quality gates in order: lint -> build -> unit tests -> e2e tests.
- Writes a run summary that includes success/failure state and failed stage diagnostics.

2. Release workflow ([.github/workflows/release.yml](.github/workflows/release.yml))
- Triggered by successful completion of the validation workflow on `master`.
- Rebuilds deterministic artifacts from the tested commit SHA.
- Deploys to GitHub Pages using official Pages actions.
- Creates idempotent Git tag and GitHub Release entries (`v<semver>`).

## Required Checks

The following checks are required before any production deployment:

1. `lint`
2. `build`
3. `unit-tests`
4. `e2e-tests`

If any required check fails, deployment is blocked automatically.

## E2E Smoke Policy

- Smoke assertions use stable selectors (`data-testid`) instead of user-visible text.
- Required smoke signals: app root container and SQLite status component.
- Retry policy: CI uses exactly 1 retry; local runs use 0 retries.
- SQLite status visibility timeout is 10 seconds.
- PR and master smoke runs execute on Chromium only.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
```
