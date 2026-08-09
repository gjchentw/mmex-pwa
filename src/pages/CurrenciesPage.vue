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

    <div class="row q-col-gutter-md q-mb-md items-center">
      <q-input
        v-model="store.search"
        class="col-12 col-sm-6"
        dense
        clearable
        :label="$t('currency.search')"
        data-testid="currency-search"
      />
      <q-toggle
        v-model="store.showAll"
        class="col-12 col-sm-6"
        :label="$t('currency.showAll')"
        data-testid="currency-show-all"
      />
    </div>

    <div v-if="store.loading" class="text-center q-pa-lg">
      <q-spinner size="32px" color="primary" />
    </div>

    <div v-else-if="store.error" class="text-negative">{{ store.error }}</div>

    <q-list v-else bordered separator data-testid="currency-list">
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
          <q-item-label caption>{{ sample(currency) }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          {{ store.isBase(currency) ? '1' : currency.BASECONVRATE }}
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
            @click="store.showAll = true"
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
      @save="onSave"
      @delete="onDelete"
      @add-rate="onAddRate"
      @remove-rate="onRemoveRate"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '../stores/currency-store'
import { formatAmount } from '../domain/rules/currency'
import type { CurrencyRecord } from '../domain/records'
import CurrencyEditorDialog from '../components/currency/CurrencyEditorDialog.vue'

const store = useCurrencyStore()

const editorOpen = ref(false)
const editing = ref<CurrencyRecord | null>(null)
const editorError = ref('')

onMounted(async () => {
  await store.load()
})

const sample = (currency: CurrencyRecord) => formatAmount(1234.5, currency)

const openEditor = async (currency: CurrencyRecord | null) => {
  editing.value = currency
  editorError.value = ''
  store.history = []
  editorOpen.value = true
  if (currency && !store.isBase(currency)) {
    await store.loadHistory(currency.CURRENCYID)
  }
}

const onSave = async (values: Omit<CurrencyRecord, 'CURRENCYID'>) => {
  editorError.value = ''
  try {
    if (editing.value) await store.save(editing.value.CURRENCYID, values)
    else await store.add(values)
    editorOpen.value = false
  } catch (err: unknown) {
    editorError.value = err instanceof Error ? err.message : String(err)
  }
}

const onDelete = async () => {
  if (!editing.value) return
  editorError.value = ''
  try {
    await store.remove(editing.value.CURRENCYID)
    editorOpen.value = false
  } catch (err: unknown) {
    // The capability refuses deletion while anything references the currency.
    editorError.value = err instanceof Error ? err.message : String(err)
  }
}

const onAddRate = async (entry: { date: string; value: number }) => {
  if (!editing.value) return
  await store.recordRate(editing.value.CURRENCYID, entry.date, entry.value)
}

const onRemoveRate = async (histId: number) => {
  if (!editing.value) return
  await store.removeRate(histId, editing.value.CURRENCYID)
}
</script>
