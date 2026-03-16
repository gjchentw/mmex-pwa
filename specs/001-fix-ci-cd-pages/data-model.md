# Data Model: CI/CD Pipeline

## Entities

### Pipeline Run
- **Description**: One end-to-end automation execution.
- **Fields**:
  - `id`: Unique identifier (GITHUB_RUN_ID)
  - `trigger`: Branch or PR that started the run.
  - `status`: success, failure, or in-progress.
  - `failed_stage`: The name of the first failing job.

### Quality Gate Result
- **Description**: Outcomes of mandatory checks.
- **Checks**:
  - `lint`: Static code analysis pass/fail.
  - `build`: Vite production build success.
  - `unit-tests`: Vitest suite result.
  - `e2e-tests`: Playwright smoke test result.

### Deployment Record
- **Description**: Tracking GitHub Pages publish events.
- **Fields**:
  - `timestamp`: When the deploy finished.
  - `sha`: The commit SHA published.
  - `url`: Public URL of the deployed PWA.

### Published Site Version
- **Description**: The currently live version of the PWA.
- `version`: semver from package.json (e.g., 0.x.x).