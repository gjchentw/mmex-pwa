<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5">{{ $t('currency.title') }}</div>
      <q-space />
      <q-btn
        color="primary"
        icon="mdi-plus"
        :label="$t('currency.add')"
        data-testid="currency-add"
        @click="openEditor(null)"
      />
    </div>

    <!-- A failed write outside the editor is shown here (design D1). -->
    <q-banner
      v-if="actionError"
      dense
      class="bg-negative text-white q-mb-md"
      data-testid="currency-action-error"
    >
      <div class="text-subtitle2">{{ $t('currency.writeFailed') }}</div>
      {{ actionError }}
      <template #action>
        <q-btn flat dense :label="$t('common.close')" @click="actionError = ''" />
      </template>
    </q-banner>

    <div class="row q-col-gutter-md q-mb-md items-center">
      <q-input
        v-model="store.search"
        class="col-12 col-sm-6"
        dense
        clearable
        :label="$t('currency.search')"
        data-testid="currency-search"
      />
      <!-- Desktop's "Show all" box, stored in the file (design D4). -->
      <q-toggle
        :model-value="store.showAll"
        class="col-12 col-sm-6"
        :label="$t('currency.showAll')"
        data-testid="currency-show-all"
        @update:model-value="onShowAll"
      />
    </div>

    <div v-if="store.loading" class="text-center q-pa-lg">
      <q-spinner size="32px" color="primary" />
    </div>

    <div v-else-if="store.error" class="text-negative">{{ store.error }}</div>

    <q-list v-else bordered separator data-testid="currency-list">
      <q-item-label header class="row">
        <span>{{ $t('currency.title') }}</span>
        <q-space />
        <!-- "Last rate" while history is on, "Fixed rate" otherwise (design D5). -->
        <span data-testid="currency-rate-column">
          {{ store.useCurrencyHistory ? $t('currency.lastRate') : $t('currency.fixedRate') }}
        </span>
      </q-item-label>

      <q-item
        v-for="currency in store.visibleCurrencies"
        :key="currency.CURRENCYID"
        v-ripple
        clickable
        :data-currency="currency.CURRENCY_SYMBOL"
        @click="openEditor(currency)"
      >
        <q-item-section>
          <q-item-label>
            {{ currency.CURRENCY_SYMBOL }} — {{ currency.CURRENCYNAME }}
            <q-badge v-if="store.isBase(currency)" color="primary" class="q-ml-sm">
              {{ $t('currency.baseBadge') }}
            </q-badge>
          </q-item-label>
          <q-item-label caption>
            {{ sample(currency) }} · {{ $t(currencyTypeLabelKey(currency.CURRENCY_TYPE)) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side data-testid="currency-rate-cell">
          {{ store.displayedRate(currency) }}
        </q-item-section>
      </q-item>

      <!-- "Nothing in use yet" is the normal state before accounts exist, and
           reads as a broken list if it is reported as a search miss. -->
      <q-item v-if="store.visibleCurrencies.length === 0">
        <q-item-section class="text-grey-7" data-testid="currency-empty">
          {{ store.search.trim() ? $t('currency.noResults') : $t('currency.noneInUse') }}
        </q-item-section>
        <q-item-section v-if="!store.search.trim() && !store.showAll" side>
          <q-btn
            dense
            flat
            color="primary"
            :label="$t('currency.showAll')"
            data-testid="currency-empty-show-all"
            @click="onShowAll(true)"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <CurrencyEditorDialog
      v-model="editorOpen"
      :currency="editing"
      :is-base="editing !== null && store.isBase(editing)"
      :history="store.history"
      :history-active="store.useCurrencyHistory"
      :error-message="editorError"
      :deletion-blocker="editing === null ? null : store.deletionBlocker(editing)"
      :latest-rate="editing === null ? null : (store.latestRates.get(editing.CURRENCYID) ?? null)"
      @save="onSave"
      @delete="openDeleteDialog"
      @add-rate="onAddRate"
      @remove-rate="onRemoveRate"
    />

    <!-- Desktop asks before deleting; the history goes with the currency (design D1). -->
    <q-dialog v-model="deleteDialogOpen" persistent data-testid="currency-delete-dialog">
      <q-card>
        <q-card-section class="row items-center">
          <q-avatar icon="mdi-alert-circle" color="negative" text-color="white" />
          <span class="q-ml-sm text-h6">{{ $t('currency.deleteTitle') }}</span>
        </q-card-section>

        <q-card-section v-if="editing">
          {{
            $t('currency.deleteConfirm', {
              name: editing.CURRENCYNAME,
              code: editing.CURRENCY_SYMBOL,
            })
          }}
        </q-card-section>

        <q-card-actions align="right">
          <q-btn
            flat
            :label="$t('common.cancel')"
            data-testid="currency-delete-cancel"
            @click="deleteDialogOpen = false"
          />
          <q-btn
            flat
            :label="$t('common.delete')"
            color="negative"
            data-testid="currency-delete-confirm"
            @click="confirmDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCurrencyStore } from '../stores/currency-store'
import { CurrencyConflictError, CurrencyInUseError } from '../domain/repos/currency'
import { formatAmount } from '../domain/rules/currency'
import type { CurrencyRecord } from '../domain/records'
import CurrencyEditorDialog from '../components/currency/CurrencyEditorDialog.vue'
import { currencyTypeLabelKey } from '../components/currency/currency-labels'

const store = useCurrencyStore()
const { t } = useI18n()

const editorOpen = ref(false)
const deleteDialogOpen = ref(false)
const editing = ref<CurrencyRecord | null>(null)
const editorError = ref('')
const actionError = ref('')

onMounted(async () => {
  await store.load()
})

const sample = (currency: CurrencyRecord) => formatAmount(1234.5, currency)

/** The repository's typed refusals, in the user's language (design D9). */
const describe = (err: unknown): string => {
  if (err instanceof CurrencyConflictError) {
    const params = { name: err.other.CURRENCYNAME, code: err.other.CURRENCY_SYMBOL }
    return t(err.field === 'name' ? 'currency.nameConflict' : 'currency.codeConflict', params)
  }
  if (err instanceof CurrencyInUseError) return t(`currency.inUse.${err.reason}`)
  return err instanceof Error ? err.message : String(err)
}

const openEditor = async (currency: CurrencyRecord | null) => {
  editing.value = currency
  editorError.value = ''
  store.clearHistory()
  editorOpen.value = true
  if (currency && !store.isBase(currency)) {
    try {
      await store.loadHistory(currency.CURRENCYID)
    } catch (err: unknown) {
      editorError.value = describe(err)
    }
  }
}

const onShowAll = async (value: boolean) => {
  actionError.value = ''
  try {
    await store.setShowAll(value)
  } catch (err: unknown) {
    actionError.value = describe(err)
  }
}

const onSave = async (values: Omit<CurrencyRecord, 'CURRENCYID'>) => {
  editorError.value = ''
  try {
    if (editing.value) await store.save(editing.value.CURRENCYID, values)
    else await store.add(values)
    editorOpen.value = false
  } catch (err: unknown) {
    editorError.value = describe(err)
  }
}

const openDeleteDialog = () => {
  if (!editing.value) return
  deleteDialogOpen.value = true
}

const confirmDelete = async () => {
  const target = editing.value
  deleteDialogOpen.value = false
  if (!target) return
  actionError.value = ''
  try {
    await store.remove(target.CURRENCYID)
    editorOpen.value = false
    editing.value = null
  } catch (err: unknown) {
    actionError.value = describe(err)
  }
}

const onAddRate = async (entry: { date: string; value: number }) => {
  if (!editing.value) return
  editorError.value = ''
  try {
    await store.recordRate(editing.value.CURRENCYID, entry.date, entry.value)
  } catch (err: unknown) {
    editorError.value = describe(err)
  }
}

const onRemoveRate = async (histId: number) => {
  if (!editing.value) return
  editorError.value = ''
  try {
    await store.removeRate(histId, editing.value.CURRENCYID)
  } catch (err: unknown) {
    editorError.value = describe(err)
  }
}
</script>
