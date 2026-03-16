# Research: CI/CD and GitHub Pages Recovery

## Technical Context

- **Language/Version**: TypeScript 5.9.0, Node.js 22.x
- **Primary Dependencies**: Vite 7.x, Vue 3.x, Quasar 2.x, Playwright 1.56.x, Vitest 3.x
- **Storage**: OPFS (Runtime), GitHub Actions Artifacts (Build-time)
- **Testing**: Playwright (E2E), Vitest (Unit)
- **Target Platform**: GitHub Pages (PWA)

## Findings

### 1. Branch Standardization
- **Decision**: Update all workflow triggers and branch references from `master` to `main` to align with the latest specification and modern standards.
- **Rationale**: The specification (Session 2026-03-16) explicitly targets the `main` branch. Consistency between documentation and implementation reduces confusion.
- **Alternatives considered**: Keeping `master`. Rejected as it contradicts the latest spec clarifications.

### 2. Failure Notifications (FR-014)
- **Decision**: Use GitHub Actions native notifications and explore a lightweight step for Slack/Discord if a webhook is provided via Secrets.
- **Rationale**: FR-014 requires automatic notification. GitHub sends emails/push by default on failure, but explicit "Failure" steps in the workflow can be used to trigger webhooks.
- **Implementation**: Add a "Notify Failure" step using `rtCamp/action-slack-notify` or similar, triggered `if: failure()`.

### 3. Build Artifacts for Debugging (FR-013)
- **Decision**: Add `actions/upload-artifact` to the `build` and `e2e-tests` jobs in `test.yml`.
- **Rationale**: Providing build outputs and test traces/screenshots helps maintainers diagnose failures faster (SC-003).
- **Artifacts**: `dist/` folder from build, `test-results/` and Playwright traces from E2E.

### 4. E2E Policy Enforcement (FR-010, FR-012)
- **Decision**: Hardcode `chromium` in the workflow `playwright install` step and update `playwright.config.ts` to honor CI retries.
- **Rationale**: FR-010 specifies exactly 1 retry in CI and 0 locally. FR-012 specifies Chromium only.
- **Configuration**: Set `retries: process.env.CI ? 1 : 0` in `playwright.config.ts`.

### 5. Security Posture (SR-001)
- **Decision**: Ensure all sensitive data (like deployment tokens or webhooks) are pulled from `secrets.GITHUB_TOKEN` or repository-level Secrets.
- **Rationale**: Complies with SR-001 and prevents secret leakage.