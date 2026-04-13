# Quickstart: Organization & Tools Module

**Feature**: 002-organize-tools-module  
**Date**: 2026-03-19 (updated)

## Prerequisites

- Node.js 22+ (see `engines` in package.json)
- Git submodules initialized: `git submodule update --init mmex/database`
- Dependencies installed: `npm ci`

## Development

```bash
# Start dev server
npm run dev

# Run unit tests in watch mode
npm run test:unit

# Type check
npm run type-check

# Lint + fix
npm run lint
```

## Key File Locations

| What | Where |
|------|-------|
| Entity type definitions | `src/types/entities.ts` |
| Composables (DB logic) | `src/composables/use*.ts` |
| Vue view pages | `src/views/*View.vue` |
| Reusable dialog components | `src/components/*Dialog.vue` |
| DB worker (transaction support) | `src/workers/sqlite.worker.ts` |
| DB client (API layer) | `src/workers/db-client.ts` |
| Unit tests | `src/__tests__/use*.spec.ts` |
| Locale files | `src/locales/en-US.json`, `src/locales/zh-TW.json` |
| Database schema reference | `mmex/database/tables.sql` |

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Vue Views      │────▶│  Composables     │────▶│  DbClient       │
│  (QPage/QDialog)│     │  (useCategories  │     │  (exec / exec-  │
│                 │◀────│   usePayees ...)  │◀────│   Transaction)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                         │ postMessage
                                                  ┌──────▼────────┐
                                                  │ SQLite Worker  │
                                                  │ (OPFS DB)      │
                                                  └───────────────┘
```

**Data flow**:
1. View calls composable method (e.g., `categories.create('Food', -1)`)
2. Composable constructs SQL and calls `dbClient.exec(sql, bind)`
3. DbClient sends typed message to Web Worker
4. Worker executes SQL against OPFS SQLite and responds
5. Composable updates reactive state; Vue re-renders

## Implementation Order

Follow the dependency chain:

1. **Types** (`src/types/entities.ts`) — shared interfaces, no dependencies
2. **Worker extension** (`exec-transaction`) — enables atomic merge operations
3. **useSettings** — no entity dependencies; used by other composables for formats
4. **useCategories** — self-contained entity with hierarchy
5. **usePayees** — depends on categories (default category FK)
6. **useTags** — depends on TagLink junction table
7. **Relocation tools** — depends on all entity composables
8. **useCustomFields** — independent entity with its own data table
9. **useDateRanges** — depends on settings for storage
10. **Views & Dialogs** — consume composables; build UI
11. **i18n** — add translation keys as views are built

## Testing Strategy

### Unit Tests (Vitest)
- Mock `dbClient.exec()` with `vi.mock()`
- Test SQL generation, response parsing, reactive state
- Test tree transformation (flat → hierarchical)
- Test merge SQL construction
- Test date range spec resolution

### Integration Tests (Playwright)
- Navigate to each management view
- Perform CRUD operations
- Verify persistence across page reloads
- Test merge flow end-to-end

## Common Patterns

### Composable Template

```typescript
import { ref, computed } from 'vue'
import { dbClient } from '@/workers/db-client'
import type { Category } from '@/types/entities'

export function useCategories() {
  const categories = ref<Category[]>([])
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      const rows = await dbClient.exec('SELECT * FROM CATEGORY_V1 ORDER BY CATEGNAME')
      categories.value = rows as unknown as Category[]
    } finally {
      loading.value = false
    }
  }

  // ... more methods

  return { categories, loading, refresh /* ... */ }
}
```

### Dialog Pattern (Quasar)

```vue
<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>
      <q-card-section>
        <q-input v-model="name" :label="$t('categories.name')" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn flat color="primary" :label="$t('common.save')" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useDialogPluginComponent } from 'quasar'
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()
</script>
```
