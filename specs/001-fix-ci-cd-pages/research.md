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
