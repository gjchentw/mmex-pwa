# Quickstart: CI/CD Fix (Version Guard Removal)

## Prerequisites
- 需具備 GitHub Repository 管理權限。
- 確保 `secrets.GITHUB_TOKEN` 已配置為讀寫權限。

## Running locally
- 執行 `npm run build` 以驗證構建輸出。
- 執行 `npm run test:e2e` 以驗證端到端測試是否通過。

## Triggering the Pipeline
- 推送至任何分支觸發 `test` 工作流。
- 合併至 `master` 並在 `build` 與 `e2e` 通過後，觸發 `release` 工作流。
