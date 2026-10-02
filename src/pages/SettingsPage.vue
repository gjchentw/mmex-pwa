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
      <!-- A write the database refused: shown here, with the field already
           restored to what the file holds (design D7). -->
      <q-banner
        v-if="actionError"
        dense
        class="bg-negative text-white"
        data-testid="settings-action-error"
      >
        <div class="text-subtitle2">{{ $t('settings.writeFailed') }}</div>
        {{ actionError }}
        <template #action>
          <q-btn flat dense :label="$t('common.close')" @click="actionError = ''" />
        </template>
      </q-banner>

      <!-- Facts describing the data file itself. -->
      <q-card flat bordered data-testid="settings-file-facts">
        <q-card-section>
          <div class="text-subtitle1">{{ $t('settings.fileGroup') }}</div>
          <div class="text-caption text-grey-7">{{ $t('settings.fileGroupHint') }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <!-- The choices are the file's own currencies (design D6). -->
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

          <!-- Only the masks desktop accepts, each shown as today's date (design D3). -->
          <q-select
            v-model="dateFormatDraft"
            :options="dateFormatOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            :label="$t('settings.dateFormat')"
            :hint="$t('settings.dateFormatHint')"
            data-testid="settings-date-format"
            @update:model-value="saveDateFormat"
          />

          <!-- Derived from the active locale, so the shell's switcher and this
               field always agree. -->
          <q-select
            :model-value="locale"
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
            v-model="retentionDraft"
            type="number"
            min="0"
            :max="RETENTION_DAYS_MAX"
            :label="$t('settings.retentionDays')"
            :hint="
              String(retentionDraft) === '0'
                ? $t('settings.retentionImmediate')
                : $t('settings.retentionHint')
            "
            :error="!!retentionError"
            :error-message="retentionError"
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
            <q-item-section side data-testid="settings-data-version">
              {{ store.dataVersion ?? $t('common.notSet') }}
            </q-item-section>
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
import { useI18n } from 'vue-i18n'
import { SettingRefusedError, useSettingsStore } from '../stores/settings-store'
import { useDatabaseStore } from '../stores/database-store'
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../i18n'
import {
  DATE_FORMAT_MASKS,
  RETENTION_DAYS_MAX,
  isDateFormatMask,
  renderDateMask,
} from '../domain/rules/metadata'
import BaseCurrencyChangeDialog from '../components/settings/BaseCurrencyChangeDialog.vue'

interface CurrencyOption {
  id: number
  label: string
}

const store = useSettingsStore()
const databaseStore = useDatabaseStore()
const { locale, t } = useI18n()

const allCurrencies = computed<CurrencyOption[]>(() =>
  store.currencies.map((c) => ({
    id: c.CURRENCYID,
    label: `${c.CURRENCY_SYMBOL} — ${c.CURRENCYNAME}`,
  })),
)
const currencyFilter = ref('')
const currencyOptions = computed(() => {
  const term = currencyFilter.value.toLocaleLowerCase()
  return term
    ? allCurrencies.value.filter((c) => c.label.toLocaleLowerCase().includes(term))
    : allCurrencies.value
})
const selectedCurrency = ref<CurrencyOption | null>(null)
const userNameDraft = ref('')
const dateFormatDraft = ref('')
const useCurrencyHistoryDraft = ref(true)
const retentionDraft = ref<string | number>('')
const retentionError = ref('')
const actionError = ref('')

const confirmingBaseCurrency = ref(false)
const pendingCurrency = ref<CurrencyOption | null>(null)
const committedCurrency = computed(
  () => allCurrencies.value.find((c) => c.id === store.baseCurrencyId) ?? null,
)

const schemaVersion = computed(() => databaseStore.version ?? '—')

const localeOptions = SUPPORTED_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))

// A stored value outside desktop's list is shown as stored, and offered only so
// the field can display it; choosing a real mask replaces it.
const dateFormatOptions = computed(() => {
  const today = new Date()
  const options = DATE_FORMAT_MASKS.map((mask) => ({
    value: mask as string,
    label: `${renderDateMask(mask, today)}  (${mask})`,
  }))
  const stored = store.dateFormat
  if (stored && !isDateFormatMask(stored)) {
    options.unshift({ value: stored, label: `${stored} — ${t('settings.dateFormatUnknown')}` })
  }
  return options
})

/** Every draft takes the stored value, so a refused or failed write leaves no trace. */
const syncDrafts = () => {
  selectedCurrency.value = committedCurrency.value
  userNameDraft.value = store.userName
  dateFormatDraft.value = store.dateFormat
  useCurrencyHistoryDraft.value = store.useCurrencyHistory
  retentionDraft.value = store.retentionDays
  retentionError.value = ''
}

onMounted(async () => {
  await store.load()
  syncDrafts()
})

const filterCurrencies = (needle: string, update: (fn: () => void) => void) => {
  update(() => {
    currencyFilter.value = needle
  })
}

/** Runs a write; a failure is shown on the page and the drafts restored (design D7). */
const attempt = async (write: () => Promise<void>) => {
  actionError.value = ''
  try {
    await write()
  } catch (err: unknown) {
    if (err instanceof SettingRefusedError && err.field === 'retentionDays') {
      retentionError.value = t('settings.retentionInvalid')
      retentionDraft.value = store.retentionDays
      return
    }
    actionError.value = err instanceof Error ? err.message : String(err)
    syncDrafts()
  }
}

const saveUserName = () =>
  attempt(async () => {
    if (userNameDraft.value !== store.userName) await store.setUserName(userNameDraft.value)
  })

const saveDateFormat = (value: string) =>
  attempt(async () => {
    if (value !== store.dateFormat) await store.setDateFormat(value)
  })

const saveUseCurrencyHistory = (value: boolean) => attempt(() => store.setUseCurrencyHistory(value))

const saveRetention = () =>
  attempt(async () => {
    retentionError.value = ''
    if (String(retentionDraft.value) !== String(store.retentionDays)) {
      await store.setRetentionDays(retentionDraft.value)
    }
  })

const saveLocale = (value: string) => attempt(() => store.setLocale(value, databaseStore.isReady))

// Picking a currency stages the change; nothing is written until confirmed.
const onBaseCurrencyPicked = (value: CurrencyOption | null) => {
  if (!value || value.id === committedCurrency.value?.id) return
  pendingCurrency.value = value
  confirmingBaseCurrency.value = true
}

const commitBaseCurrency = () =>
  attempt(async () => {
    const target = pendingCurrency.value
    pendingCurrency.value = null
    if (!target) return
    await store.setBaseCurrency(target.id)
    syncDrafts()
  })

const revertBaseCurrency = () => {
  pendingCurrency.value = null
  selectedCurrency.value = committedCurrency.value
}
</script>
