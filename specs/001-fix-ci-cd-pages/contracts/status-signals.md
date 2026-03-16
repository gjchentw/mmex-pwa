# Contracts: CI/CD Status Signals

## Failure Notification Contract
- **Source**: GitHub Actions Workflow (on failure)
- **Payload**:
  - `workflow`: test | release
  - `status`: failure
  - `failed_job`: The job name that failed.
  - `link`: `https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}`

## Deployment Evidence Contract
- **Source**: `release-summary` job
- **Output**: GITHUB_STEP_SUMMARY
- **Fields**: Branch, Commit, Deploy Status, Page URL, Release Tag.