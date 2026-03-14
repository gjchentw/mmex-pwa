# Quickstart: Validate CI/CD and GitHub Pages Recovery

## Goal
Validate that CI checks are reliable, deployment is correctly gated, GitHub Pages is updated from qualified master runs, and failures are recoverable.

## Prerequisites
- Repository write access with permission to run workflows.
- GitHub Pages configured for GitHub Actions deployment.
- A branch with this feature workflow changes.

## Scenario A: Pull Request Quality Gate Validation
1. Open a pull request with a small safe code change.
2. Confirm validation workflow triggers automatically.
3. Verify lint, build/type-check, unit tests, and e2e tests all execute.
4. Confirm smoke assertions use stable selectors and validate app root plus SQLite status readiness.
5. Confirm PR e2e runs on Chromium only.
6. Confirm no deploy-to-pages action occurs for the pull request context.

Expected result:
- Quality gates produce a clear pass/fail status.
- Failed stage is obvious when any gate fails.

## Scenario B: Master Deployment Validation
1. Merge a pull request after all checks pass.
2. Confirm validation workflow completes successfully for master commit.
3. Confirm release/deploy workflow starts only after successful validation.
4. Verify `build-pages` and `deploy-pages` jobs complete successfully.
5. Verify GitHub Pages environment shows a successful deployment event.
6. Confirm release run summary contains source SHA, page URL, and release tag.
7. Open the public site and verify latest change is visible.

Expected result:
- Only qualified master commit is deployed.
- Public site reflects latest approved version.

## Scenario C: Failure and Recovery Validation
1. Introduce a controlled failing change in workflow or test condition.
2. Confirm validation marks the run as failed and exposes failed stage.
3. Fix the issue without unrelated source changes.
4. Rerun or push fix and verify full pipeline returns to success.
5. Confirm deployment resumes for qualified master runs.

Expected result:
- Failure diagnosis is fast and unambiguous.
- Recovery via rerun/fix is straightforward and reliable.

### Troubleshooting and Rerun Runbook
1. Open the failed run summary and capture `Failed stage` value.
2. Drill into the failed job logs for the exact command and error line.
3. For smoke failures, first verify selector stability and SQLite status timeout behavior (10s) before broad workflow changes.
4. If failure is dependency/network related, rerun failed jobs first.
5. If failure is deterministic (config or script), push a minimal fix commit.
6. Confirm the next run summary reports `Status: success` and no failed stage.
7. For release flow reruns, verify existing tag/release detection reports reuse instead of duplicate creation.

## Scenario D: Concurrency and Freshness Validation
1. Push two commits rapidly to master.
2. Verify deployment concurrency behavior prevents stale publish overlap.
3. Confirm final public site content corresponds to the latest qualified commit.

Expected result:
- No conflicting production publishes.
- Final published state matches the newest eligible commit.

## End-to-End Validation Checklist (Execution Record)

- [ ] A. PR validation run completed all four quality gates in order.
- [ ] B. Failed validation run exposed explicit failed stage in summary.
- [ ] C. Master release run deployed to GitHub Pages with evidence summary.
- [ ] D. Existing tag/release rerun path completed without duplicate publish failure.
- [ ] E. Consecutive master commits did not produce stale final deployment.
- [ ] F. Smoke checks validated app root and SQLite status via stable selectors.
- [ ] G. Smoke retry/timeout policy observed as CI retry=1 and SQLite timeout=10s.
- [ ] H. PR/master smoke browser matrix executed on Chromium only.

### Validation Results Log

- Date: 2026-03-14
- Executor: GitHub Copilot (GPT-5.4)
- Result: Local validation green
- Notes: Local lint, build, unit tests, and Playwright Chromium smoke test pass with selector-based assertions, CI retry policy, and 10-second readiness timeout. GitHub-hosted workflow scenarios for PR validation, Pages deployment, rerun idempotency, and deploy concurrency still require repository-side execution records.
