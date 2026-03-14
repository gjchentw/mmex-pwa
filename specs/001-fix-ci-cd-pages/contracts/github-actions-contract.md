# Contract: GitHub Actions CI/CD and GitHub Pages Deployment

## 1. Validation Workflow Contract

### Workflow identity
- Name: test
- Purpose: Execute quality gates for pull requests and branch pushes.

### Trigger contract
- Must trigger on pull_request for all branches.
- Must trigger on push for all branches.

### Required jobs and order
- Mandatory gate sequence:
  1. lint
  2. build/type-check
  3. unit tests
  4. e2e tests
- Contract rule: Deployment workflows must not run unless all mandatory gates return success for the target mainline commit.
- Validation workflow must use concurrency cancellation so obsolete in-progress runs on the same ref do not consume deploy eligibility.

### Output contract
- Workflow conclusion must be one of: success, failure, cancelled.
- On failure, logs must identify failed gate stage.
- Run summary must include source branch, source commit SHA, and explicit failed stage (if any).

## 2. Release and Deploy Workflow Contract

### Workflow identity
- Name: release
- Purpose: Tag/release and deploy approved mainline artifacts.

### Trigger contract
- Must execute only when validation workflow for master concludes with success.
- Must never publish from non-master branches.
- Must verify `workflow_run` payload includes source branch and source commit SHA before deployment logic executes.

### Permission contract
- contents: write required for tagging and release publication.
- pages/deploy permissions must be explicitly declared for GitHub Pages deployment jobs.

### Deployment contract
- Deploy target must be GitHub Pages production environment.
- Deployment must consume deterministic build artifacts from the qualified run context.
- Deployment must run under a production concurrency group to prevent overlapping publishes.
- Deployment evidence must include page URL and source commit SHA in run summary.

### Release contract
- Tag format: v<package.json version>.
- Pre-1.0 policy: major version must remain 0.
- If tag already exists, workflow must skip duplicate tag creation and must not fail due to idempotent replay.
- If release already exists for the target tag, workflow must skip duplicate release creation and continue successfully.

## 3. Version Guard Workflow Contract

### Workflow identity
- Name: version-guard
- Purpose: Enforce versioning policy for pull requests targeting master.

### Trigger contract
- Must run on pull_request targeting master.

### Validation contract
- package.json version must be strict semver.
- Head version must be greater than base version.
- Allowed transitions:
  - patch +1
  - minor +1 with patch reset to 0 and explicit maintainer approval label
- Major version must remain 0 before formal community acceptance.

## 4. Operational Evidence Contract

### Required evidence for each publish-eligible run
- Source commit SHA and branch.
- Quality gate pass status.
- Deployment target and final deployment status.
- Release tag (when created).
- Published page URL.

### Failure diagnostics contract
- Failed runs must identify the failed gate or deploy stage in run summary or clearly discoverable logs.
- Rerun must be supported through native GitHub Actions rerun capabilities without source changes.
