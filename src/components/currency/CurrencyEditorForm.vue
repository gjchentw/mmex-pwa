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

    <q-card-section class="column q-gutter-sm">
      <div class="row q-col-gutter-sm">
        <q-input
          v-model="draft.CURRENCYNAME"
          class="col-12 col-sm-7"
          :label="$t('currency.name')"
          data-testid="currency-name"
        />
        <q-input
          v-model="draft.CURRENCY_SYMBOL"
          class="col-12 col-sm-5"
          :label="$t('currency.symbol')"
          data-testid="currency-symbol"
        />
      </div>

      <div class="row q-col-gutter-sm">
        <q-input v-model="draft.PFX_SYMBOL" class="col-6" :label="$t('currency.prefix')" />
        <q-input v-model="draft.SFX_SYMBOL" class="col-6" :label="$t('currency.suffix')" />
      </div>

      <div class="row q-col-gutter-sm">
        <q-input v-model="draft.DECIMAL_POINT" class="col-6" :label="$t('currency.decimalPoint')" />
        <q-input
          v-model="draft.GROUP_SEPARATOR"
          class="col-6"
          :label="$t('currency.groupSeparator')"
        />
      </div>

      <div class="row q-col-gutter-sm">
        <q-input v-model="draft.UNIT_NAME" class="col-6" :label="$t('currency.unitName')" />
        <q-input v-model="draft.CENT_NAME" class="col-6" :label="$t('currency.centName')" />
      </div>

      <div class="row q-col-gutter-sm">
        <q-input
          v-model.number="draft.SCALE"
          type="number"
          class="col-6"
          :label="$t('currency.scale')"
          :hint="$t('currency.scaleHint')"
          data-testid="currency-scale"
        />
        <q-select
          v-model="draft.CURRENCY_TYPE"
          :options="typeOptions"
          class="col-6"
          :label="$t('currency.type')"
        />
      </div>

      <!-- The base currency is what every rate is measured against, so its own
           rate is definitionally one (design D4). -->
      <q-input
        v-model.number="draft.BASECONVRATE"
        type="number"
        :label="$t('currency.conversionRate')"
        :hint="isBase ? $t('currency.baseRateFixed') : $t('currency.conversionRateHint')"
        :readonly="isBase"
        data-testid="currency-rate"
      />

      <q-banner dense class="bg-grey-2" data-testid="currency-preview">
        <template #avatar><q-icon name="mdi-eye-outline" /></template>
        {{ $t('currency.preview') }}: <strong>{{ preview }}</strong>
      </q-banner>

      <div v-if="errorMessage" class="text-negative" data-testid="currency-editor-error">
        {{ errorMessage }}
      </div>
    </q-card-section>

    <!-- Recorded rates belong to a currency that is not the base one. -->
    <template v-if="!isNew && !isBase">
      <q-separator />
      <q-card-section>
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle2">{{ $t('currency.historyTitle') }}</div>
          <q-space />
          <q-badge v-if="!historyActive" color="grey-7" data-testid="currency-history-inactive">
            {{ $t('currency.historyInactive') }}
          </q-badge>
        </div>

        <div class="row q-col-gutter-sm items-end">
          <q-input
            v-model="rateDate"
            type="date"
            class="col-5"
            :label="$t('currency.rateDate')"
            data-testid="rate-date"
          />
          <q-input
            v-model.number="rateValue"
            type="number"
            class="col-5"
            :label="$t('currency.rateValue')"
            data-testid="rate-value"
          />
          <div class="col-2">
            <q-btn
              dense
              color="primary"
              icon="mdi-plus"
              :disable="!rateDate || rateValue === null"
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
                @click="emit('remove-rate', row.CURRHISTID)"
              />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-caption text-grey-7 q-mt-sm">{{ $t('currency.noRates') }}</div>
      </q-card-section>
    </template>

    <q-separator />

    <q-card-actions align="right">
      <q-btn
        v-if="!isNew"
        flat
        color="negative"
        :label="$t('common.delete')"
        data-testid="currency-delete"
        @click="emit('delete')"
      />
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
import { CURRENCY_TYPES, formatAmount } from '../../domain/rules/currency'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../../domain/records'

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
}>()

const emit = defineEmits<{
  save: [Omit<CurrencyRecord, 'CURRENCYID'>]
  cancel: []
  delete: []
  'add-rate': [{ date: string; value: number }]
  'remove-rate': [number]
}>()

const typeOptions = [...CURRENCY_TYPES]

const blank = (): Omit<CurrencyRecord, 'CURRENCYID'> => ({
  CURRENCYNAME: '',
  PFX_SYMBOL: '',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: 1,
  CURRENCY_SYMBOL: '',
  CURRENCY_TYPE: 'Fiat',
})

const fromProps = (): Omit<CurrencyRecord, 'CURRENCYID'> => {
  const source = props.currency
  const next = source ? { ...source } : blank()
  if (props.isBase) next.BASECONVRATE = 1
  return next
}

const draft = ref<Omit<CurrencyRecord, 'CURRENCYID'>>(fromProps())
const rateDate = ref('')
const rateValue = ref<number | null>(null)

const isNew = computed(() => props.currency === null)

/** A representative amount, so scale and separators are visible before saving. */
const preview = computed(() => formatAmount(1234567.89, draft.value))

watch(
  () => props.currency,
  () => {
    draft.value = fromProps()
    rateDate.value = ''
    rateValue.value = null
  },
)

const onSave = () => {
  emit('save', { ...draft.value, BASECONVRATE: props.isBase ? 1 : draft.value.BASECONVRATE })
}

const addRate = () => {
  if (!rateDate.value || rateValue.value === null) return
  emit('add-rate', { date: rateDate.value, value: rateValue.value })
  rateValue.value = null
}

defineExpose({ draft, preview, onSave, addRate, rateDate, rateValue })
</script>
