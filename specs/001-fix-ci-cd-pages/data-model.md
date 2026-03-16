# Data Model: CI/CD Workflow State

## Entities

### Validation Pipeline Result
- **Description**: 測試流水線的執行狀態與結果。
- **Fields**:
  - `lint`: success | failure (非阻擋)
  - `build`: success | failure (阻擋)
  - `unit-tests`: success | failure (非阻擋)
  - `e2e-tests`: success | failure (阻擋)

### Release Eligibility Result
- **Description**: 是否符合部署 GitHub Pages 的條件。
- **Conditions**:
  - `build_status == 'success'`
  - `e2e_status == 'success'`
