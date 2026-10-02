<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import type { PayeeRecord } from '../domain/records'
import type { PayeeDraft, TaxonomyUsage } from '../domain/repos/taxonomy'
import { usePayeeStore, type PayeeRow } from '../stores/payee-store'
import PayeeEditorDialog from '../components/payee/PayeeEditorDialog.vue'
import CategoryPicker from '../components/taxonomy/CategoryPicker.vue'
import MergeDialog from '../components/taxonomy/MergeDialog.vue'
import TaxonomyDeleteDialog from '../components/taxonomy/TaxonomyDeleteDialog.vue'
import { describeTaxonomyError } from '../components/taxonomy/taxonomy-messages'

/**
 * Payee manager (openspec: transaction-taxonomy, Payee Manager Display, Payee
 * Editing, Payee Selection Actions, Payee Deletion from the Surface, Merge
 * Screens). Desktop's Payee Manager: its eight columns, Show hidden, and the
 * selection menu — Hide, Show, Remove, Define Category, Remove Category, Merge
 * Payee — as a toolbar over a multi-selection (operator decision 24). A table on
 * wide screens, cards on narrow ones (design D8).
 */

const { t } = useI18n()
const $q = useQuasar()
const store = usePayeeStore()

const actionError = ref('')
const describe = (err: unknown): string =>
  describeTaxonomyError(err, t) ?? (err instanceof Error ? err.message : String(err))

const columns = computed(() => [
  {
    name: 'name',
    label: t('payee.columns.name'),
    field: 'name',
    align: 'left' as const,
    sortable: true,
  },
  { name: 'hidden', label: t('payee.columns.hidden'), field: 'hidden', align: 'center' as const },
  {
    name: 'category',
    label: t(store.categoryColumnTitleKey),
    field: 'categoryName',
    align: 'left' as const,
  },
  {
    name: 'reference',
    label: t('payee.columns.reference'),
    field: 'reference',
    align: 'left' as const,
  },
  { name: 'website', label: t('payee.columns.website'), field: 'website', align: 'left' as const },
  { name: 'notes', label: t('payee.columns.notes'), field: 'notes', align: 'left' as const },
  {
    name: 'pattern',
    label: t('payee.columns.pattern'),
    field: 'patternText',
    align: 'left' as const,
  },
  {
    name: 'used',
    label: t('payee.columns.used'),
    field: 'used',
    align: 'right' as const,
    sortable: true,
  },
])

/** q-table selects row objects; the store keeps the ids so the dialogs share them. */
const selectedRows = computed<PayeeRow[]>({
  get: () => store.rows.filter((row) => store.selectedIds.includes(row.id)),
  set: (rows) => {
    store.selectedIds = rows.map((row) => row.id)
  },
})
const hasSelection = computed(() => store.selectedIds.length > 0)
const singleSelection = computed(() => store.selectedIds.length === 1)

const onShowHidden = async (value: boolean) => {
  actionError.value = ''
  try {
    await store.setShowHidden(value)
  } catch (err) {
    actionError.value = describe(err)
  }
}

const run = async (action: () => Promise<unknown>) => {
  actionError.value = ''
  try {
    await action()
  } catch (err) {
    actionError.value = describe(err)
  }
}

// --- Editor -------------------------------------------------------------------

const editorOpen = ref(false)
const editing = ref<PayeeRecord | null>(null)
const editorError = ref('')
const editorSaving = ref(false)
const openEditor = (payee: PayeeRecord | null) => {
  editing.value = payee
  editorError.value = ''
  editorOpen.value = true
}
const openRow = (row: PayeeRow) => openEditor(store.get(row.id))
const onSave = async (draft: PayeeDraft | Partial<PayeeDraft>) => {
  editorSaving.value = true
  editorError.value = ''
  try {
    if (editing.value) await store.save(editing.value.PAYEEID, draft)
    else await store.add(draft as PayeeDraft)
    editorOpen.value = false
  } catch (err) {
    editorError.value = describe(err)
  } finally {
    editorSaving.value = false
  }
}

// --- Selection actions --------------------------------------------------------

const defineOpen = ref(false)
const defineCategoryId = ref<number | null>(null)
const openDefine = () => {
  defineCategoryId.value = null
  defineOpen.value = true
}
const confirmDefine = () =>
  run(async () => {
    if (defineCategoryId.value === null) return
    await store.setDefaultCategory(store.selectedIds, defineCategoryId.value)
    defineOpen.value = false
  })

const onRemove = () =>
  run(async () => {
    store.keptNames = []
    await store.requestDeletion(store.selectedIds)
  })
const confirmDelete = () =>
  run(async () => {
    await store.confirmDeletion()
  })

// --- Merge --------------------------------------------------------------------

const mergeOpen = ref(false)
const mergeOptions = computed(() =>
  store.payees.map((p) => ({
    id: p.PAYEEID,
    label: p.PAYEENAME,
    hidden: p.ACTIVE === 0,
    used: (store.usageCounts.get(p.PAYEEID) ?? 0) > 0,
  })),
)
const mergeSource = computed(() => (singleSelection.value ? store.selectedIds[0]! : null))
const usageOf = (id: number): Promise<TaxonomyUsage> => store.usageOf(id)
const relocate = (from: number, to: number, options: { deleteSource: boolean }) =>
  store.relocate(from, to, options)

onMounted(() => store.load())
</script>

<template>
  <q-page class="q-pa-md" data-testid="payees-page">
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-h5">{{ $t('payee.title') }}</div>
      <q-space />
      <q-btn
        color="primary"
        icon="mdi-plus"
        :label="$t('payee.add')"
        data-testid="payee-add"
        @click="openEditor(null)"
      />
    </div>

    <q-banner
      v-if="actionError"
      class="bg-negative text-white q-mb-md"
      data-testid="payee-action-error"
    >
      {{ actionError }}
      <template #action>
        <q-btn flat :label="$t('common.close')" @click="actionError = ''" />
      </template>
    </q-banner>
    <q-banner
      v-if="store.keptNames.length > 0"
      class="bg-warning text-dark q-mb-md"
      data-testid="payee-kept"
    >
      {{ $t('payee.kept', { names: store.keptNames.join(', ') }) }}
      <template #action>
        <q-btn flat :label="$t('common.close')" @click="store.keptNames = []" />
      </template>
    </q-banner>

    <div class="row items-center q-gutter-md q-mb-md">
      <q-input
        v-model="store.search"
        dense
        outlined
        clearable
        :label="$t('payee.search')"
        class="col-12 col-sm-5"
        data-testid="payee-search"
      >
        <template #prepend><q-icon name="mdi-magnify" /></template>
      </q-input>
      <q-toggle
        :model-value="store.showHidden"
        :label="$t('payee.showHidden')"
        data-testid="payee-show-hidden"
        @update:model-value="onShowHidden"
      >
        <q-tooltip>{{ $t('payee.showHiddenHint') }}</q-tooltip>
      </q-toggle>
    </div>

    <div class="row items-center q-gutter-sm q-mb-sm">
      <span class="text-caption" data-testid="payee-selected">
        {{ $t('payee.selected', { count: store.selectedIds.length }) }}
      </span>
      <q-btn
        flat
        dense
        :disable="!hasSelection"
        :label="$t('payee.actions.hideSelected')"
        data-testid="payee-hide"
        @click="run(() => store.setHidden(store.selectedIds, true))"
      />
      <q-btn
        flat
        dense
        :disable="!hasSelection"
        :label="$t('payee.actions.showSelected')"
        data-testid="payee-show"
        @click="run(() => store.setHidden(store.selectedIds, false))"
      />
      <q-btn
        flat
        dense
        :disable="!hasSelection"
        :label="$t('payee.actions.defineCategory')"
        data-testid="payee-define-category"
        @click="openDefine"
      />
      <q-btn
        flat
        dense
        :disable="!hasSelection"
        :label="$t('payee.actions.removeCategory')"
        data-testid="payee-remove-category"
        @click="run(() => store.setDefaultCategory(store.selectedIds, null))"
      />
      <q-btn
        flat
        dense
        :disable="!singleSelection"
        :label="$t('payee.actions.merge')"
        data-testid="payee-merge"
        @click="mergeOpen = true"
      />
      <q-btn
        flat
        dense
        color="negative"
        :disable="!hasSelection"
        :label="$t('payee.actions.remove')"
        data-testid="payee-remove"
        @click="onRemove"
      />
    </div>

    <div v-if="store.loading" class="q-pa-md"><q-spinner size="md" /></div>
    <div v-else-if="store.error" class="text-negative" data-testid="payee-error">
      {{ store.error }}
    </div>
    <q-table
      v-else
      v-model:selected="selectedRows"
      :rows="store.rows"
      :columns="columns"
      row-key="id"
      selection="multiple"
      :grid="$q.screen.lt.md"
      flat
      bordered
      dense
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
      :no-data-label="store.search ? $t('payee.noResults') : $t('payee.empty')"
      data-testid="payee-table"
    >
      <template #body="props">
        <q-tr
          :props="props"
          :data-payee-id="props.row.id"
          :class="{ 'text-grey': props.row.hidden }"
        >
          <q-td auto-width>
            <q-checkbox v-model="props.selected" dense />
          </q-td>
          <q-td key="name" :props="props" class="cursor-pointer" @click="openRow(props.row)">
            {{ props.row.name }}
          </q-td>
          <q-td key="hidden" :props="props">
            <q-icon v-if="props.row.hidden" name="mdi-check" data-testid="payee-hidden-mark" />
          </q-td>
          <q-td key="category" :props="props">{{ props.row.categoryName }}</q-td>
          <q-td key="reference" :props="props">{{ props.row.reference }}</q-td>
          <q-td key="website" :props="props">{{ props.row.website }}</q-td>
          <q-td key="notes" :props="props">{{ props.row.notes }}</q-td>
          <q-td key="pattern" :props="props">{{ props.row.patternText }}</q-td>
          <q-td key="used" :props="props" data-testid="payee-used">{{ props.row.used }}</q-td>
        </q-tr>
      </template>
      <template #item="props">
        <div class="col-12 col-sm-6 col-md-4 q-pa-xs">
          <q-card
            flat
            bordered
            :data-payee-id="props.row.id"
            :class="{ 'text-grey': props.row.hidden }"
          >
            <q-card-section class="row items-center no-wrap">
              <q-checkbox v-model="props.selected" dense />
              <div class="text-subtitle1 q-ml-sm cursor-pointer" @click="openRow(props.row)">
                {{ props.row.name }}
                <q-icon
                  v-if="props.row.hidden"
                  name="mdi-eye-off-outline"
                  data-testid="payee-hidden-mark"
                />
              </div>
              <q-space />
              <q-badge outline :label="props.row.used" data-testid="payee-used" />
            </q-card-section>
            <q-card-section class="q-pt-none text-caption">
              <div v-if="props.row.categoryName">
                {{ $t(store.categoryColumnTitleKey) }}: {{ props.row.categoryName }}
              </div>
              <div v-if="props.row.reference">
                {{ $t('payee.columns.reference') }}: {{ props.row.reference }}
              </div>
              <div v-if="props.row.website">
                {{ $t('payee.columns.website') }}: {{ props.row.website }}
              </div>
              <div v-if="props.row.notes">
                {{ $t('payee.columns.notes') }}: {{ props.row.notes }}
              </div>
              <div v-if="props.row.patternText">
                {{ $t('payee.columns.pattern') }}: {{ props.row.patternText }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </template>
    </q-table>

    <PayeeEditorDialog
      v-model="editorOpen"
      :payee="editing"
      :categories="store.categories"
      :delimiter="store.delimiter"
      :mode="store.mode"
      :error-message="editorError"
      :saving="editorSaving"
      @save="onSave"
    />

    <q-dialog v-model="defineOpen" persistent data-testid="payee-define-category-dialog">
      <q-card style="width: 100%; max-width: 480px">
        <q-card-section>
          <div class="text-h6">{{ $t('payee.defineCategoryTitle') }}</div>
        </q-card-section>
        <q-card-section>
          <CategoryPicker
            v-model="defineCategoryId"
            :categories="store.categories"
            :delimiter="store.delimiter"
            :label="$t(store.categoryColumnTitleKey)"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="$t('common.cancel')" @click="defineOpen = false" />
          <q-btn
            color="primary"
            :label="$t('common.save')"
            :disable="defineCategoryId === null"
            data-testid="payee-define-category-confirm"
            @click="confirmDefine"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <TaxonomyDeleteDialog
      :model-value="store.pendingDeletion !== null"
      kind="payee"
      :title="$t('payee.deleteTitle')"
      :names="store.pendingDeletion?.names ?? []"
      :lines="[$t('payee.deleteAttachments')]"
      :purge="store.pendingDeletion?.purge ?? false"
      @update:model-value="(open) => (open ? undefined : store.cancelDeletion())"
      @confirm="confirmDelete"
      @cancel="store.cancelDeletion()"
    />

    <MergeDialog
      v-model="mergeOpen"
      kind="payee"
      :options="mergeOptions"
      :initial-source="mergeSource"
      :usage-of="usageOf"
      :relocate="relocate"
    />
  </q-page>
</template>
