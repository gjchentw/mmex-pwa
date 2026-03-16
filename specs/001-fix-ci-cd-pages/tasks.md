# Tasks: CI/CD Optimization (Version Guard Removal)

**Input**: Design documents from `/specs/001-fix-ci-cd-pages/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 備份 `.github/workflows/` 目錄下的所有工作流檔案
- [X] T002 [P] 檢查 `.github/scripts/ci/` 腳本的權限，確保在 CI 環境中可執行

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T003 修改 `.github/scripts/ci/detect-failed-stage.sh`，使其能接收並區分阻擋（Build/E2E）與非阻擋（Lint/Unit）狀態
- [X] T004 更新 `.github/scripts/ci/write-run-summary.sh`，以清楚標示哪些失敗是「非阻擋」的

## Phase 3: User Story 1 - Stable Automated Build and Test (Priority: P1) 🎯 MVP

- [X] T005 [US1] 修改 `.github/workflows/test.yml` 中的 `report` Job，調整其 `is_validated` 輸出邏輯為僅依賴 `build` 與 `e2e-tests`
- [X] T006 [US1] 確保 `lint` 與 `unit-tests` 即使失敗，`report` Job 仍能執行並產出摘要

## Phase 4: User Story 2 - Successful Publish to GitHub Pages (Priority: P2)

- [X] T007 [US2] 移除 `.github/workflows/release.yml` 對 `version-guard` 工作流的依賴聲明
- [X] T008 [US2] 刪除 `.github/workflows/release.yml` 中 `tag-and-release` Job 內部的版本比對與驗證步驟
- [X] T009 [US2] 調整 `preflight` Job，使其僅根據 `workflow_run` 的成功結論與自定義的 `is_validated` 標記進行判定

## Phase 5: User Story 3 - Traceable and Recoverable Failure Handling (Priority: P3)

- [X] T010 [US3] 在 `.github/workflows/test.yml` 的各個 Job 中增加 `failure()` 時的通知觸發器
- [X] T011 [US3] 確保 `report` Job 在任何測試失敗時均能輸出正確的失敗診斷細節至 GitHub Step Summary

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 刪除 `.github/workflows/version-guard.yml` 檔案
- [X] T013 [P] 更新 `README.md` 中的 CI/CD 章節，說明目前的部署門檻政策
- [X] T014 再次執行 `quickstart.md` 中的驗證流程，確保文件與實作同步
- [X] T015 [US2] 確認 package.json 中的版本號已由 Agent 完成遞增 (+1 PATCH) 以符合發布規範

## Implementation Summary

- 成功移除所有版本號阻擋檢查。
- 調整 `test.yml` 為「非阻擋」測試鏈，僅 Build 與 E2E 失敗會阻擋部署。
- 移除 `version-guard.yml` 並更新 `release.yml`。
- 手動遞增版本至 0.0.4 並更新 README 說明。
