# Research: CI/CD Workflow Optimization (Version Guard Removal)

## Findings

### 1. 移除版本檢查邏輯
- **Decision**: 完全移除 `version-guard.yml` 與 `release.yml` 中的版本驗證步驟。
- **Rationale**: 遵循憲章 v1.5.0，將版本號維護責任回歸至 AI Agent，減少 CI/CD 的冗餘阻擋，提昇非發布性質提交（如中繼資料修改、緊急維護）的流程順暢度。
- **Alternatives considered**: 僅將檢查設為 Warning。被拒絕，因為這仍會干擾 CI 狀態顯示，直接移除更為乾淨。

### 2. 測試阻擋條件調整
- **Decision**: 僅以 `Build` 與 `E2E` 作為部署 GitHub Pages 的強制門檻。
- **Rationale**: `Lint` 或 `Unit` 測試失敗雖反映質量問題，但不應阻擋緊急或探索性的發布行為，前提是核心構建與端到端功能無損。

### 3. 通知機制調整
- **Decision**: 即使 Lint 或 Unit 測試不阻擋部署，失敗時仍必須透過 GitHub Actions 的 `if: failure()` 機制通知團隊。
- **Rationale**: 符合憲章對代碼質量的持續監控要求，確保質量債務是可見的。

## Technical Context
- 需要修改 `.github/workflows/test.yml` 以調整報告工作流的失敗判定。
- 需要修改 `.github/workflows/release.yml` 以移除對 `version-guard` 的依賴與內核版本檢查。
