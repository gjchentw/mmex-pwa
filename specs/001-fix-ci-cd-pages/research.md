# Phase 0 Research: CI/CD and GitHub Pages Recovery

## Decision 1: Keep validation and deployment as separate workflow responsibilities
- Decision: Preserve a dedicated validation workflow for pull requests and mainline pushes, and keep deployment behavior in a dedicated release/deploy workflow that runs only after qualified mainline success.
- Rationale: Separation improves traceability and minimizes accidental deployment from non-main contexts.
- Alternatives considered: One monolithic workflow for all events was rejected because branch/event gating becomes harder to audit and easier to misconfigure.

## Decision 2: Enforce strict quality-gate ordering before deployment
- Decision: Treat lint, type-check/build, unit tests, and e2e tests as mandatory quality gates that must pass before any deployment path can execute.
- Rationale: This directly satisfies constitutional Test-First and CI/CD discipline requirements while preventing partial or unverified publishes.
- Alternatives considered: Optional or non-blocking e2e checks were rejected because they allow regressions into public demo releases.

## Decision 3: Use GitHub Pages official deployment flow with explicit permissions
- Decision: Use GitHub Actions-native Pages artifact/deploy model and explicit least-privilege permissions in deploy workflows.
- Rationale: Official Pages flow is maintainable, auditable, and aligns with GitHub-hosted deployment expectations.
- Alternatives considered: Manual artifact upload or external hosting deploy scripts were rejected due to lower governance and repeatability.

## Decision 4: Add deployment concurrency controls
- Decision: Use a deployment concurrency group for the production environment so only the latest qualified run can publish.
- Rationale: Prevents overlapping deploy jobs and stale output races when multiple commits land close together.
- Alternatives considered: No concurrency control was rejected because rapid pushes can produce out-of-order public state.

## Decision 5: Preserve release tagging discipline after successful mainline pipeline
- Decision: Continue automatic tag/release generation only after successful master pipeline completion and pre-1.0 version policy validation.
- Rationale: Keeps traceability between package version, tags, and public release records while enforcing constitutional version policy.
- Alternatives considered: Manual tagging was rejected due to inconsistency risk and reduced auditability.

## Decision 6: Define explicit run evidence contract for failure diagnostics and publish verification
- Decision: Require workflow outputs and run summaries to include failure stage visibility and post-deploy verification evidence.
- Rationale: Improves MTTR by making rerun decisions actionable and confirms public site update as part of delivery confidence.
- Alternatives considered: Relying solely on raw step logs was rejected because it slows incident triage and weakens operator clarity.

## Decision 7: Use selector-based smoke assertions instead of user-visible text
- Decision: Validate homepage readiness with stable selectors (for example data-testid) rather than localized visible strings.
- Rationale: Removes i18n and wording fragility from CI smoke checks while still validating key UI readiness.
- Alternatives considered: Text assertions were rejected because locale/content changes can cause false negatives.

## Decision 8: Scope smoke coverage to app root and SQLite status component
- Decision: Keep minimum smoke coverage focused on app shell root and SQLite status component presence.
- Rationale: Captures startup and storage-readiness signals with low test maintenance cost.
- Alternatives considered: Full homepage copy verification was rejected due to brittleness and slower iteration.

## Decision 9: Use CI-only retry and bounded readiness timeout
- Decision: Apply exactly one retry in CI and no retries locally; use a 10-second timeout for SQLite status visibility.
- Rationale: CI retry absorbs transient infrastructure noise while local deterministic failure remains fast; 10 seconds balances stability and feedback speed.
- Alternatives considered: Zero retry in CI was rejected due to avoidable flakes, and longer timeouts were rejected because they delay genuine failure feedback.

## Decision 10: Run smoke checks on Chromium only in PR and master pipelines
- Decision: Keep PR and master smoke matrix on Chromium only.
- Rationale: Fast, predictable gate feedback is prioritized for CI/CD recovery and deploy safety.
- Alternatives considered: Multi-browser matrices in primary gate were deferred to avoid higher runtime and added flakiness during stabilization.
