# Contracts: CI/CD Failure Notification

## Notification Contract
- **Source**: GitHub Actions Workflow (on failure)
- **Payload**:
  - `workflow`: test | release
  - `status`: failure
  - `failed_job`: The job name that failed.
  - `link`: `https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}`

## Release Eligibility Contract
- **Source**: `test` workflow outputs
- **Result**: `is_deployable = (build == success) && (e2e == success)`
