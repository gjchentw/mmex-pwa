# Phase 1 Data Model: CI/CD and GitHub Pages Recovery

## Entity: PipelineRun
- Purpose: Represents one CI/CD workflow execution instance.
- Fields:
  - runId (string, required, unique)
  - workflowName (string, required)
  - triggerEvent (enum: push, pull_request, workflow_run, workflow_dispatch)
  - branch (string, required)
  - commitSha (string, required)
  - startedAt (datetime, required)
  - finishedAt (datetime, optional until completion)
  - status (enum: queued, in_progress, success, failure, cancelled)
  - failedStage (string, optional)
- Relationships:
  - One PipelineRun has many QualityGateResults.
  - One PipelineRun can produce zero or one DeploymentRecord.
- Validation rules:
  - finishedAt must be greater than or equal to startedAt.
  - failedStage must be present when status is failure.

## Entity: QualityGateResult
- Purpose: Captures gate-by-gate outcomes used for deploy eligibility.
- Fields:
  - gateName (enum: lint, build, unit_test, e2e_test)
  - gateStatus (enum: success, failure, skipped)
  - completedAt (datetime, required)
  - detailsUrl (string, optional)
- Relationships:
  - Many QualityGateResults belong to one PipelineRun.
- Validation rules:
  - Deploy eligibility requires all mandatory gates in success status.
  - skipped is valid only for explicitly non-required contexts.

## Entity: DeploymentRecord
- Purpose: Represents one GitHub Pages publish attempt.
- Fields:
  - deploymentId (string, required, unique)
  - sourceRunId (string, required)
  - targetEnvironment (enum: github_pages)
  - deployedRef (string, required)
  - deployedSha (string, required)
  - deployedAt (datetime, required)
  - deploymentStatus (enum: success, failure)
  - evidenceUrl (string, optional)
- Relationships:
  - One DeploymentRecord belongs to one PipelineRun.
  - One DeploymentRecord produces one PublishedSiteVersion when successful.
- Validation rules:
  - sourceRunId must reference a successful PipelineRun with all required gate successes.
  - targetEnvironment must be github_pages for this feature scope.

## Entity: PublishedSiteVersion
- Purpose: Tracks the currently visible public site version.
- Fields:
  - publicUrl (string, required)
  - releaseTag (string, optional)
  - sourceDeploymentId (string, required)
  - publishedAt (datetime, required)
  - verificationStatus (enum: verified, unverified, failed)
- Relationships:
  - One PublishedSiteVersion is derived from one successful DeploymentRecord.
- Validation rules:
  - verificationStatus must be verified before marking rollout complete.

## State Transitions
- PipelineRun:
  - queued -> in_progress -> success
  - queued -> in_progress -> failure
  - queued/in_progress -> cancelled
- DeploymentRecord:
  - success path: created -> publishing -> success
  - failure path: created -> publishing -> failure
- PublishedSiteVersion:
  - unverified -> verified
  - unverified -> failed
