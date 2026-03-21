# Implementation Plan: Organization & Tools Module

**Branch**: `002-organize-tools-module` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-organize-tools-module/spec.md`

## Summary

Implement the organization and tools module for the MMEX PWA, providing master data management for categories (hierarchical), payees, and tags — including CRUD, active/hidden toggling, and a generic relocation (merge) tool with transactional safety. Additionally provide custom field management, custom date range management, and a system-level settings/preferences UI with dark/light theme support. All data operations target the local OPFS SQLite database via the existing Web Worker message protocol, following the existing composable + dialog + view architecture.

## Technical Context

**Language/Version**: TypeScript 5.9.0 (strict mode, ES2022 target)
**Primary Dependencies**: Vue 3.5.22 (Composition API), Quasar 2.18.6, Vue Router 4.6.3, Pinia 3.0.3, vue-i18n 12.0.0-alpha.3
**Storage**: OPFS SQLite via @sqlite.org/sqlite-wasm 3.51.1-build1, running in dedicated Web Worker
**Testing**: Vitest 3.2.4 (unit), Playwright 1.56.1 (e2e)
**Target Platform**: Browser/WebKit PWA only — no server-side rendering
**Project Type**: PWA (Progressive Web App)
**Performance Goals**: Settings changes reflected within 1 second; category add completes in <30 seconds of user interaction; merge operation completes in <1 minute user flow
**Constraints**: Fully offline-capable (Local First), all writes to OPFS SQLite, no network dependency for core features
**Scale/Scope**: 7 management views, 7 composables, 7 dialog components, 1 generic relocation dialog, ~15 database tables involved

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Local First (NON-NEGOTIABLE) | **PASS** | All CRUD and relocation ops target OPFS SQLite via existing worker. No network dependency. |
| II. UX First | **PASS** | Immediate feedback on settings changes (FR-028). Confirmation dialog for destructive merges (FR-019a). Active/hidden toggle preserves history. |
| III. Test-First (NON-NEGOTIABLE) | **PASS** | Existing test patterns established for all composables and worker. TDD cycle to be followed for new code. |
| IV. Quasar Design System | **PASS** | All views use QPage, dialogs use QDialog (useDialogPluginComponent). QTree for categories. Standard Quasar components throughout. |
| V. MMEX Schema Compatibility | **PASS** | Using existing CATEGORY_V1, PAYEE_V1, TAG_V1, TAGLINK_V1, CUSTOMFIELD_V1, CUSTOMFIELDDATA_V1, SETTING_V1 tables from upstream schema. No DDL changes required. |
| VI. TypeScript Strictness | **PASS** | All entities have typed interfaces. Worker message contracts fully typed. Build error in current code (RelocationStats → Record<string,number> cast) to be fixed as part of this feature. |
| VII. CI/CD Discipline | **PASS** | Standard Vite build + vue-tsc type-check. Existing CI pipeline applies. |
| VIII. MMEX Community Acceptance | **PASS** | Feature set mirrors upstream MMEX C++ (category/payee/tag management, relocation, custom fields, settings). No divergence from upstream behaviour. |
| Language & Documentation Policy | **PASS** | All code, comments, docs in English. User-facing strings externalised via vue-i18n. |
| SDD Enforcement | **PASS** | This plan document and spec.md precede implementation. |

**Pre-existing build errors to fix** (TypeScript violations on current branch):
1. `SettingsPanel.vue:69` — missing `ref` import
2. `CategoriesView.vue:149` — `RelocationStats` cast to `Record<string, number>` type mismatch
3. `relocate.spec.ts:61,156,185` — `Object is possibly 'undefined'`
4. `sqlite.worker.spec.ts:195` — incomplete MessageEvent mock

These are existing type errors on the branch that must be fixed to satisfy Constitution Principle VI and VII.

## Project Structure

### Documentation (this feature)

```text
specs/002-organize-tools-module/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── entities.ts           # Category, Payee, Tag, TagLink, CustomField,
│                              # CustomFieldData, Setting, DateRangeSpec,
│                              # RelocationStats, etc.
├── composables/
│   ├── useCategories.ts      # Category CRUD + tree + relocation
│   ├── usePayees.ts          # Payee CRUD + relocation
│   ├── useTags.ts            # Tag CRUD + relocation
│   ├── useCustomFields.ts    # Custom field CRUD + data management
│   ├── useDateRanges.ts      # Date range CRUD + resolve
│   └── useSettings.ts        # Settings key-value + computed helpers
├── components/
│   ├── CategoryTreeDialog.vue
│   ├── PayeeDialog.vue
│   ├── TagDialog.vue
│   ├── CustomFieldDialog.vue
│   ├── DateRangeDialog.vue
│   ├── RelocateDialog.vue    # Generic relocation/merge dialog
│   └── SettingsPanel.vue
├── views/
│   ├── CategoriesView.vue
│   ├── PayeesView.vue
│   ├── TagsView.vue
│   ├── CustomFieldsView.vue
│   ├── DateRangesView.vue
│   └── SettingsView.vue
├── workers/
│   ├── sqlite.worker.ts      # SQLite OPFS worker
│   └── db-client.ts          # Promise-based DB client
├── router/
│   └── index.ts              # App routes including all management views
├── locales/
│   ├── en-US.json            # English translations
│   └── zh-TW.json            # Traditional Chinese translations
└── __tests__/
    ├── useCategories.spec.ts
    ├── usePayees.spec.ts
    ├── useTags.spec.ts
    ├── useCustomFields.spec.ts
    ├── useDateRanges.spec.ts
    ├── useSettings.spec.ts
    ├── relocate.spec.ts
    ├── sqlite.worker.spec.ts
    └── db-client.spec.ts
```

**Structure Decision**: Follows the existing single-project Vue 3 SPA structure established in the repository. All features are organized by concern (composables, components, views, types, workers). No new structural patterns introduced — this module extends the existing architecture.

## Complexity Tracking

No constitution violations detected. No complexity justification required.

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Local First | **PASS** | No network dependency introduced in any design artifact. |
| II. UX First | **PASS** | Unified stats with zero-hiding improves relocation dialog clarity. |
| III. Test-First | **PASS** | Testing strategy and mock patterns documented in quickstart. |
| IV. Quasar Design System | **PASS** | All UI contracts use Quasar component patterns. |
| V. MMEX Schema Compatibility | **PASS** | Zero DDL changes. DateRanges in SETTING_V1 (existing table). |
| VI. TypeScript Strictness | **PASS** | Unified RelocationStats eliminates unsafe casts. Build errors addressed. |
| VII. CI/CD Discipline | **PASS** | Build error fixes planned as prerequisite task. |
| VIII. MMEX Community Acceptance | **PASS** | Feature set mirrors upstream C++ application. |
| Language & Documentation Policy | **PASS** | All design docs in English. i18n strategy in research.md. |

**Result**: All gates pass. Ready for Phase 2 task generation.
