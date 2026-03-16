# Implementation Plan: CI/CD Optimization (Version Guard Removal)

**Branch**: `001-fix-ci-cd-pages` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-ci-cd-pages/spec.md`

## Summary

此計畫旨在優化 CI/CD 流程，移除所有針對版本號的強行阻擋檢查（包括 version-guard.yml 與 release.yml 中的驗證步奏），並調整 GitHub Pages 的部署條件，僅以 Build 與 E2E 測試作為強制門檻。

## Technical Context

**Language/Version**: TypeScript 5.9.0, Node.js 22.x
**Primary Dependencies**: Vite 7.x, Playwright 1.56.x, GitHub Actions
**Storage**: N/A (Build Artifacts only)
**Testing**: Playwright, Vitest, ESLint
**Target Platform**: GitHub Pages
**Project Type**: PWA (Web Application)
**Performance Goals**: 部署管道應維持在 10 分鐘內完成。
**Constraints**: 必須符合憲章 v1.5.0 對版本號執行邊界的定義。
**Scale/Scope**: 修改範圍限於 .github/workflows/ 目錄下的配置檔案。

## Constitution Check

| Principle | Status | Justification |
|-----------|--------|---------------|
| III. Test-First | ✅ | 雖然放寬了版本檢查，但仍堅持 Build 與 E2E 作為部署門檻。 |
| VII. CI/CD Discipline | ✅ | 此次修正正是為了落實憲章 v1.5.0 的新發布規範。 |
| VIII. Community Acceptance | ✅ | 移除冗餘阻擋有助於開發效率，符合社區對代碼質量與流程的平衡。 |

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-ci-cd-pages/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── test.yml          # 更新測試與通知邏輯
    ├── release.yml       # 移除版本檢查步驟
    └── version-guard.yml # 移除或停用此工作流
```

**Structure Decision**: 僅修改 GitHub Actions 工作流定義，不涉及應用程序源碼結構。
