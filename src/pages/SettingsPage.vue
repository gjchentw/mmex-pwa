<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">{{ $t('settings.title') }}</div>

    <div v-if="store.loading" class="text-center q-pa-lg">
      <q-spinner size="32px" color="primary" />
    </div>

    <div v-else-if="store.error" class="text-negative" data-testid="settings-error">
      {{ store.error }}
    </div>

    <div v-else class="column q-gutter-md" style="max-width: 640px">
      <!-- Facts describing the data file itself. -->
      <q-card flat bordered data-testid="settings-file-facts">
        <q-card-section>
          <div class="text-subtitle1">{{ $t('settings.fileGroup') }}</div>
          <div class="text-caption text-grey-7">{{ $t('settings.fileGroupHint') }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <q-select
            v-model="selectedCurrency"
            :options="currencyOptions"
            option-value="id"
            option-label="label"
            :label="$t('database.baseCurrency')"
            use-input
            input-debounce="0"
            data-testid="settings-base-currency"
            @filter="filterCurrencies"
            @update:model-value="onBaseCurrencyPicked"
          />

          <q-input
            v-model="userNameDraft"
            :label="$t('database.userName')"
            :placeholder="$t('database.userNamePlaceholder')"
            data-testid="settings-user-name"
            @blur="saveUserName"
          />

          <q-input
            v-model="dateFormatDraft"
            :label="$t('settings.dateFormat')"
            :hint="$t('settings.dateFormatHint')"
            data-testid="settings-date-format"
            @blur="saveDateFormat"
          />

          <q-select
            v-model="localeDraft"
            :options="localeOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            :label="$t('settings.language')"
            :hint="$t('settings.languageHint')"
            data-testid="settings-language"
            @update:model-value="saveLocale"
          />

          <q-toggle
            v-model="useCurrencyHistoryDraft"
            :label="$t('settings.useCurrencyHistory')"
            data-testid="settings-currency-history"
            @update:model-value="saveUseCurrencyHistory"
          />
          <div class="text-caption text-grey-7">{{ $t('settings.useCurrencyHistoryHint') }}</div>
        </q-card-section>
      </q-card>

      <!-- Preferences describing how the application behaves. -->
      <q-card flat bordered data-testid="settings-preferences">
        <q-card-section>
          <div class="text-subtitle1">{{ $t('settings.appGroup') }}</div>
          <div class="text-caption text-grey-7">{{ $t('settings.appGroupHint') }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-input
            v-model.number="retentionDraft"
            type="number"
            min="0"
            :label="$t('settings.retentionDays')"
            :hint="
              retentionDraft === 0
                ? $t('settings.retentionImmediate')
                : $t('settings.retentionHint')
            "
            data-testid="settings-retention"
            @blur="saveRetention"
          />
        </q-card-section>
      </q-card>

      <!-- Read-only: these describe the file's format, not the user's choices. -->
      <q-card flat bordered data-testid="settings-file-info">
        <q-card-section>
          <div class="text-subtitle1">{{ $t('settings.infoGroup') }}</div>
        </q-card-section>
        <q-separator />
        <q-list>
          <q-item>
            <q-item-section>{{ $t('settings.schemaVersion') }}</q-item-section>
            <q-item-section side>{{ schemaVersion }}</q-item-section>
          </q-item>
          <q-item>
            <q-item-section>{{ $t('settings.dataVersion') }}</q-item-section>
            <q-item-section side>{{ store.dataVersion ?? '—' }}</q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>

    <BaseCurrencyChangeDialog
      v-model="confirmingBaseCurrency"
      :target-name="pendingCurrency?.label ?? ''"
      @confirm="commitBaseCurrency"
      @cancel="revertBaseCurrency"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings-store'
import { useDatabaseStore } from '../stores/database-store'
import { SUPPORTED_LOCALES, activeLocale } from '../i18n'
import currencies from '../data/currencies.json'
import BaseCurrencyChangeDialog from '../components/settings/BaseCurrencyChangeDialog.vue'

interface CurrencyOption {
  id: number
  label: string
}

const store = useSettingsStore()
const databaseStore = useDatabaseStore()

const allCurrencies: CurrencyOption[] = (
  currencies as { id: number; name: string; code: string }[]
).map((currency) => ({ id: currency.id, label: `${currency.code} — ${currency.name}` }))

const currencyOptions = ref<CurrencyOption[]>(allCurrencies)
const selectedCurrency = ref<CurrencyOption | null>(null)
const userNameDraft = ref('')
const dateFormatDraft = ref('')
const useCurrencyHistoryDraft = ref(false)
const retentionDraft = ref(0)
const localeDraft = ref(activeLocale())

const confirmingBaseCurrency = ref(false)
const pendingCurrency = ref<CurrencyOption | null>(null)
let committedCurrency: CurrencyOption | null = null

const schemaVersion = computed(() => databaseStore.version ?? '—')

const localeOptions = SUPPORTED_LOCALES.map((value) => ({
  value,
  label: value === 'en-US' ? 'English' : '繁體中文',
}))

const syncDrafts = () => {
  committedCurrency = allCurrencies.find((c) => c.id === store.baseCurrencyId) ?? null
  selectedCurrency.value = committedCurrency
  userNameDraft.value = store.userName
  dateFormatDraft.value = store.dateFormat
  useCurrencyHistoryDraft.value = store.useCurrencyHistory
  retentionDraft.value = store.retentionDays
  localeDraft.value = activeLocale()
}

onMounted(async () => {
  await store.load()
  syncDrafts()
})

const filterCurrencies = (needle: string, update: (fn: () => void) => void) => {
  update(() => {
    const term = needle.toLocaleLowerCase()
    currencyOptions.value = term
      ? allCurrencies.filter((c) => c.label.toLocaleLowerCase().includes(term))
      : allCurrencies
  })
}

const saveUserName = async () => {
  if (userNameDraft.value !== store.userName) await store.setUserName(userNameDraft.value)
}

const saveDateFormat = async () => {
  if (dateFormatDraft.value !== store.dateFormat) await store.setDateFormat(dateFormatDraft.value)
}

const saveUseCurrencyHistory = async (value: boolean) => {
  await store.setUseCurrencyHistory(value)
}

const saveRetention = async () => {
  if (retentionDraft.value !== store.retentionDays)
    await store.setRetentionDays(retentionDraft.value)
}

const saveLocale = async (value: string) => {
  await store.setLocale(value, databaseStore.isReady)
}

// Picking a currency stages the change; nothing is written until confirmed.
const onBaseCurrencyPicked = (value: CurrencyOption | null) => {
  if (!value || value.id === committedCurrency?.id) return
  pendingCurrency.value = value
  confirmingBaseCurrency.value = true
}

const commitBaseCurrency = async () => {
  const target = pendingCurrency.value
  pendingCurrency.value = null
  if (!target) return
  await store.setBaseCurrency(target.id)
  committedCurrency = target
  selectedCurrency.value = target
}

const revertBaseCurrency = () => {
  pendingCurrency.value = null
  selectedCurrency.value = committedCurrency
}
</script>
