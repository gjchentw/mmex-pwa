# Quickstart: CI/CD Fix

## Prerequisites
- GitHub Repository access.
- GitHub Actions enabled.
- `master` branch exists and is the default.

## Workflow Setup
1. Ensure `secrets.GITHUB_TOKEN` has write permissions for content, pages, and deployments.
2. Add any third-party webhook URLs (Slack/Discord) to repository Secrets if using FR-014.

## Running locally
1. Run `npm run build` to verify the Vite output.
2. Run `npm run test:e2e` to verify the Playwright smoke tests.

## Triggering the Pipeline
- Push to any branch to trigger the `test` workflow.
- Merge to `master` to trigger the `test` and then the `release` workflow.