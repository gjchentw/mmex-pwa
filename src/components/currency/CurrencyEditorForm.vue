<template>
  <q-card style="width: 100%; max-width: 560px" data-testid="currency-editor">
    <q-card-section class="row items-center">
      <div class="text-h6">
        {{ isNew ? $t('currency.addTitle') : $t('currency.editTitle') }}
      </div>
      <q-space />
      <q-badge v-if="isBase" color="primary" data-testid="currency-editor-base">
        {{ $t('currency.baseBadge') }}
      </q-badge>
    </q-card-section>

    <q-separator />

    <!-- The fields desktop's currency dialog offers, in its shape (design D3). -->
    <q-card-section class="column q-gutter-sm">
      <div class="row q-col-gutter-sm">
        <q-input
          v-model="draft.CURRENCYNAME"
          class="col-12 col-sm-7"
          :label="$t('currency.name')"
          data-testid="currency-name"
          :error="!!refusals.name"
          :error-message="refusals.name"
        />
        <q-input
          v-model="draft.CURRENCY_SYMBOL"
          class="col-12 col-sm-5"
          :label="$t('currency.symbol')"
          :maxlength="CURRENCY_CODE_MAX_LENGTH"
          data-testid="currency-symbol"
          :error="!!refusals.code"
          :error-message="refusals.code"
        />
      </div>

      <div class="row q-col-gutter-sm items-center">
        <q-input
          v-model="draft.symbol"
          class="col-12 col-sm-5"
          :label="$t('currency.sign')"
          data-testid="currency-sign"
        />
        <div class="col-12 col-sm-7 row items-center">
          <q-radio
            v-model="draft.symbolPlacement"
            val="prefix"
            :label="$t('currency.placementPrefix')"
            data-testid="currency-prefix"
          />
          <q-radio
            v-model="draft.symbolPlacement"
            val="suffix"
            :label="$t('currency.placementSuffix')"
            class="q-ml-sm"
            data-testid="currency-suffix"
          />
        </div>
      </div>

      <div class="row q-col-gutter-sm">
        <q-select
          v-model="draft.DECIMAL_POINT"
          :options="decimalOptions"
          emit-value
          map-options
          class="col-6"
          :label="$t('currency.decimalPoint')"
          data-testid="currency-decimal"
        />
        <q-select
          v-model="draft.GROUP_SEPARATOR"
          :options="groupingOptions"
          emit-value
          map-options
          class="col-6"
          :label="$t('currency.groupSeparator')"
          data-testid="currency-grouping"
          :error="!!refusals.grouping"
          :error-message="refusals.grouping"
        />
      </div>

      <div class="row q-col-gutter-sm">
        <q-input v-model="draft.UNIT_NAME" class="col-6" :label="$t('currency.unitName')" />
        <q-input v-model="draft.CENT_NAME" class="col-6" :label="$t('currency.centName')" />
      </div>

      <div class="row q-col-gutter-sm">
        <q-select
          v-model="draft.decimalPlaces"
          :options="decimalPlacesOptions"
          class="col-6"
          :label="$t('currency.decimalPlaces')"
          data-testid="currency-decimal-places"
        />
        <q-select
          v-model="draft.CURRENCY_TYPE"
          :options="typeOptions"
          emit-value
          map-options
          class="col-6"
          :label="$t('currency.type')"
          data-testid="currency-type"
        />
      </div>

      <!-- The base currency is what every rate is measured against, so its own
           rate is definitionally one. -->
      <q-input
        v-model="draft.BASECONVRATE"
        type="number"
        step="any"
        :label="$t('currency.conversionRate')"
        :hint="isBase ? $t('currency.baseRateFixed') : $t('currency.conversionRateHint')"
        :readonly="isBase"
        data-testid="currency-rate"
        :error="!!refusals.rate"
        :error-message="refusals.rate"
      />

      <q-banner dense class="bg-grey-2" data-testid="currency-preview">
        <template #avatar><q-icon name="mdi-eye-outline" /></template>
        {{ $t('currency.preview') }}: <strong>{{ preview }}</strong>
      </q-banner>

      <div v-if="errorMessage" class="text-negative" data-testid="currency-editor-error">
        {{ errorMessage }}
      </div>
    </q-card-section>

    <!-- Recorded rates belong to a currency that is not the base one. The panel
         is hidden while history is off, as desktop hides it (design D6). -->
    <template v-if="!isNew && !isBase">
      <q-separator />
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">{{ $t('currency.historyTitle') }}</div>

        <div
          v-if="!historyActive"
          class="text-caption text-grey-7"
          data-testid="currency-history-off"
        >
          {{ $t('currency.historyOff') }}
        </div>

        <template v-else>
          <div class="row q-col-gutter-sm items-start" data-testid="currency-history-panel">
            <q-input
              v-model="rateDate"
              type="date"
              class="col-5"
              :label="$t('currency.rateDate')"
              data-testid="rate-date"
            />
            <q-input
              v-model="rateValue"
              type="number"
              step="any"
              class="col-5"
              :label="$t('currency.rateValue')"
              data-testid="rate-value"
              :error="!!rateError"
              :error-message="rateError"
            />
            <div class="col-2">
              <q-btn
                dense
                color="primary"
                icon="mdi-plus"
                :aria-label="$t('currency.rateValue')"
                data-testid="rate-add"
                @click="addRate"
              />
            </div>
          </div>

          <q-list v-if="history.length > 0" dense class="q-mt-sm" data-testid="rate-list">
            <q-item v-for="row in history" :key="row.CURRHISTID">
              <q-item-section>{{ row.CURRDATE }}</q-item-section>
              <q-item-section side>{{ row.CURRVALUE }}</q-item-section>
              <q-item-section side>
                <q-btn
                  dense
                  flat
                  round
                  icon="mdi-delete-outline"
                  :aria-label="$t('currency.removeRate')"
                  data-testid="rate-remove"
                  @click="emit('remove-rate', row.CURRHISTID)"
                />
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey-7 q-mt-sm">{{ $t('currency.noRates') }}</div>
        </template>
      </q-card-section>
    </template>

    <q-separator />

    <q-card-actions align="right">
      <!-- Disabled with its reason while the capability forbids deletion (design D1). -->
      <div v-if="!isNew" class="row items-center">
        <q-btn
          flat
          color="negative"
          :label="$t('common.delete')"
          :disable="deletionBlocker !== null"
          data-testid="currency-delete"
          @click="emit('delete')"
        />
        <span
          v-if="deletionBlocker"
          class="text-caption text-grey-7 q-ml-sm"
          data-testid="currency-delete-reason"
        >
          {{ $t(`currency.inUse.${deletionBlocker}`) }}
        </span>
      </div>
      <q-space />
      <q-btn flat :label="$t('common.cancel')" @click="emit('cancel')" />
      <q-btn
        color="primary"
        :label="$t('common.save')"
        data-testid="currency-save"
        @click="onSave"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CurrencyUsage } from '../../domain/repos/currency'
import {
  CURRENCY_CODE_MAX_LENGTH,
  CURRENCY_TYPES,
  DECIMAL_CHARACTERS,
  DECIMAL_PLACES_MAX,
  GROUPING_CHARACTERS,
  draftFromCurrency,
  formatAmount,
  normalizeCurrencyDefinition,
  parseRateEntry,
  scaleFromDecimalPlaces,
  validateCurrencyDefinition,
  type CurrencyDraftField,
} from '../../domain/rules/currency'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../../domain/records'
import { currencyTypeLabelKey } from './currency-labels'

/**
 * The editor's body, kept separate from the dialog that presents it: a portal
 * renders nothing under test, which would make every assertion here vacuous.
 */
const props = defineProps<{
  currency: CurrencyRecord | null
  isBase: boolean
  history: CurrencyHistoryRecord[]
  historyActive: boolean
  errorMessage: string
  /** What forbids deleting this currency, or null when it may be deleted. */
  deletionBlocker: CurrencyUsage | null
  /** The most recent recorded rate, which prefills the fixed rate while history is on. */
  latestRate: number | null
}>()

const emit = defineEmits<{
  save: [Omit<CurrencyRecord, 'CURRENCYID'>]
  cancel: []
  delete: []
  'add-rate': [{ date: string; value: number }]
  'remove-rate': [number]
}>()

const { t } = useI18n()

const typeOptions = CURRENCY_TYPES.map((value) => ({
  value,
  label: t(currencyTypeLabelKey(value)),
}))
const decimalPlacesOptions = Array.from({ length: DECIMAL_PLACES_MAX + 1 }, (_, n) => n)

const SEPARATOR_LABEL_KEYS: Record<string, string> = {
  '': 'currency.separatorNone',
  '.': 'currency.separatorDot',
  ',': 'currency.separatorComma',
  ' ': 'currency.separatorSpace',
}

/** Desktop's choices, plus the stored value when it lies outside them, offered as it is. */
const separatorOptions = (choices: readonly string[], stored: string) => {
  const options = choices.map((value) => ({ value, label: t(SEPARATOR_LABEL_KEYS[value] ?? '') }))
  if (!choices.includes(stored)) {
    options.unshift({ value: stored, label: t('currency.separatorStored', { value: stored }) })
  }
  return options
}

const fromProps = () => {
  const next = draftFromCurrency(props.currency)
  if (props.isBase) next.BASECONVRATE = 1
  // Desktop prefills the rate from the latest history point while history is on.
  else if (props.currency && props.historyActive && props.latestRate !== null) {
    next.BASECONVRATE = props.latestRate
  }
  return next
}

const draft = ref(fromProps())
const refusals = ref<Partial<Record<CurrencyDraftField, string>>>({})
const rateDate = ref('')
const rateValue = ref<string | number>('')
const rateError = ref('')

const isNew = computed(() => props.currency === null)

const decimalOptions = computed(() =>
  separatorOptions(DECIMAL_CHARACTERS, draft.value.DECIMAL_POINT),
)
const groupingOptions = computed(() =>
  separatorOptions(GROUPING_CHARACTERS, draft.value.GROUP_SEPARATOR),
)

/** A representative amount, so decimals, separators and the symbol are visible before saving. */
const preview = computed(() =>
  formatAmount(1234567.89, {
    SCALE: scaleFromDecimalPlaces(draft.value.decimalPlaces),
    DECIMAL_POINT: draft.value.DECIMAL_POINT,
    GROUP_SEPARATOR: draft.value.GROUP_SEPARATOR,
    PFX_SYMBOL: draft.value.symbolPlacement === 'prefix' ? draft.value.symbol : '',
    SFX_SYMBOL: draft.value.symbolPlacement === 'suffix' ? draft.value.symbol : '',
  }),
)

watch(
  () => [props.currency, props.latestRate] as const,
  () => {
    draft.value = fromProps()
    refusals.value = {}
    rateDate.value = ''
    rateValue.value = ''
    rateError.value = ''
  },
)

// A fresh history array means the parent wrote the entry, so it is cleared only then.
watch(
  () => props.history,
  () => {
    rateValue.value = ''
    rateError.value = ''
  },
)

/** Desktop validates on OK; the refusals land on their fields and Save stays enabled (design D10). */
const onSave = () => {
  const found = validateCurrencyDefinition(draft.value)
  refusals.value = Object.fromEntries(
    Object.entries(found).map(([field, code]) => [field, t(`currency.${code}`)]),
  )
  if (Object.keys(found).length > 0) return
  const record = normalizeCurrencyDefinition(draft.value)
  emit('save', { ...record, BASECONVRATE: props.isBase ? 1 : record.BASECONVRATE })
}

/** Desktop refuses a negative price and accepts zero (design D11). */
const addRate = () => {
  const value = parseRateEntry(rateValue.value)
  if (!rateDate.value || value === null) {
    rateError.value = t('currency.rateEntryInvalid')
    return
  }
  rateError.value = ''
  emit('add-rate', { date: rateDate.value, value })
}
</script>
