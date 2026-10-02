<template>
  <q-card style="width: 100%; max-width: 600px" data-testid="account-editor">
    <q-card-section class="row items-center">
      <div class="text-h6">
        {{ isNew ? $t('account.addTitle') : $t('account.editTitle') }}
      </div>
      <q-space />
      <q-badge v-if="!isNew" color="primary" data-testid="account-editor-existing">
        {{ $t('account.existingAccount') }}
      </q-badge>
    </q-card-section>

    <q-separator />

    <q-card-section class="column q-gutter-sm">
      <!-- Name -->
      <q-input
        v-model="draft.ACCOUNTNAME"
        :label="$t('account.name')"
        :hint="$t('account.nameHint')"
        data-testid="account-name"
        :error="!!nameError"
        :error-message="nameError"
        @update:model-value="nameError = ''"
        @blur="validateName"
      />

      <!-- Type: a Shares account keeps its type, and none may become Investment. -->
      <q-select
        v-model="draft.ACCOUNTTYPE"
        :options="typeOptions"
        emit-value
        map-options
        :readonly="typeOptions.length === 1"
        :hint="typeOptions.length === 1 ? $t('account.typeFixed') : undefined"
        :label="$t('account.type')"
        data-testid="account-type"
      />

      <!-- Currency -->
      <q-select
        v-model="draft.CURRENCYID"
        :options="currencyOptions"
        option-value="CURRENCYID"
        option-label="CURRENCY_SYMBOL"
        emit-value
        map-options
        :label="$t('account.currency')"
        data-testid="account-currency"
        :error="!!currencyError"
        :error-message="currencyError"
      />

      <!-- Initial Balance and Date -->
      <div class="row q-col-gutter-sm">
        <q-input
          v-model.number="draft.INITIALBAL"
          type="number"
          class="col-12 col-sm-6"
          :label="$t('account.initialBalance')"
          data-testid="account-initial-balance"
          :error="!!initialBalanceError"
          :error-message="initialBalanceError"
        />
        <q-input
          v-model="draft.INITIALDATE"
          type="date"
          class="col-12 col-sm-6"
          :label="$t('account.initialDate')"
          data-testid="account-initial-date"
          :error="!!initialDateError"
          :error-message="initialDateError"
        />
      </div>

      <!-- Status -->
      <q-select
        v-model="draft.STATUS"
        :options="statusOptions"
        emit-value
        map-options
        :label="$t('account.status')"
        data-testid="account-status"
      />

      <!-- Favorite -->
      <q-toggle
        v-model="isFavoriteValue"
        :label="$t('account.favorite')"
        data-testid="account-favorite-toggle"
      />

      <!-- Credit and loan planning fields, offered for every type as desktop does -->
      <q-separator class="q-my-md" />
      <div class="text-subtitle2">{{ $t('account.creditSettings') }}</div>

      <div class="row q-col-gutter-sm q-mt-sm">
        <q-input
          v-model.number="draft.CREDITLIMIT"
          type="number"
          class="col-12 col-sm-6"
          :label="$t('account.creditLimit')"
          data-testid="account-credit-limit"
          clearable
        />
        <q-input
          v-model.number="draft.MINIMUMBALANCE"
          type="number"
          class="col-12 col-sm-6"
          :label="$t('account.minimumBalance')"
          data-testid="account-minimum-balance"
          clearable
        />
      </div>

      <div class="row q-col-gutter-sm q-mt-sm">
        <q-input
          v-model.number="draft.INTERESTRATE"
          type="number"
          step="0.01"
          class="col-12 col-sm-6"
          :label="$t('account.interestRate')"
          data-testid="account-interest-rate"
          clearable
        />
        <q-input
          v-model.number="draft.MINIMUMPAYMENT"
          type="number"
          class="col-12 col-sm-6"
          :label="$t('account.minimumPayment')"
          data-testid="account-minimum-payment"
          clearable
        />
      </div>

      <div class="row q-col-gutter-sm q-mt-sm">
        <q-input
          v-model="draft.PAYMENTDUEDATE"
          type="date"
          class="col-12 col-sm-6"
          :label="$t('account.paymentDueDate')"
          data-testid="account-payment-due"
          clearable
        />
      </div>

      <!-- Statement Lock -->
      <q-separator class="q-my-md" />
      <div class="text-subtitle2">{{ $t('account.statementLock') }}</div>
      <div class="row q-col-gutter-sm q-mt-sm">
        <q-toggle
          v-model="isLockedValue"
          :label="$t('account.locked')"
          class="col-12 col-sm-4"
          data-testid="account-statement-lock-toggle"
        />
        <q-input
          v-model="draft.STATEMENTDATE"
          type="date"
          class="col-12 col-sm-8"
          :label="$t('account.statementDate')"
          data-testid="account-statement-date"
          :disable="!isLockedValue"
          :error="!!statementDateError"
          :error-message="statementDateError"
          clearable
        />
      </div>

      <!-- Other information -->
      <q-separator class="q-my-md" />
      <div class="text-subtitle2">{{ $t('account.otherInfo') }}</div>
      <q-input
        v-for="field in OTHER_INFO_FIELDS"
        :key="field.column"
        v-model="draft[field.column]"
        :label="$t(field.labelKey)"
        :type="field.column === 'NOTES' ? 'textarea' : 'text'"
        :rows="field.column === 'NOTES' ? 3 : undefined"
        :data-testid="field.testid"
        clearable
      />

      <div v-if="errorMessage" class="text-negative q-mt-sm" data-testid="account-editor-error">
        {{ errorMessage }}
      </div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <q-btn
        v-if="!isNew"
        flat
        color="negative"
        :label="$t('common.delete')"
        data-testid="account-delete"
        @click="emit('delete')"
      />
      <q-space />
      <q-btn
        flat
        :label="$t('common.cancel')"
        @click="emit('cancel')"
        data-testid="account-cancel"
      />
      <q-btn
        color="primary"
        :label="$t('common.save')"
        data-testid="account-save"
        :loading="saving"
        @click="onSave"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatIsoDate } from '../../domain/conventions'
import type { OpeningDateConflict } from '../../domain/repos/account'
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  encodeFavorite,
  isFavorite,
  typeChangeOptions,
} from '../../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../../domain/records'
import { useAccountStore } from '../../stores/account-store'
import { statusLabelKey, typeLabelKey } from './account-labels'

type Draft = Partial<AccountRecord> & { ACCOUNTID?: number }

const props = defineProps<{
  account: AccountRecord | null
  currencies: CurrencyRecord[]
  errorMessage: string
  /** The file's base currency, which a new account starts in. */
  baseCurrencyId?: number | null
}>()

const emit = defineEmits<{
  save: [Draft]
  cancel: []
  delete: []
}>()

const store = useAccountStore()
const { t } = useI18n()

/** The free-text columns desktop edits alongside the account (accountdialog.cpp). */
const OTHER_INFO_FIELDS = [
  { column: 'ACCOUNTNUM', labelKey: 'account.accountNumber', testid: 'account-account-number' },
  { column: 'HELDAT', labelKey: 'account.heldAt', testid: 'account-held-at' },
  { column: 'WEBSITE', labelKey: 'account.website', testid: 'account-website' },
  { column: 'CONTACTINFO', labelKey: 'account.contactInfo', testid: 'account-contact-info' },
  { column: 'ACCESSINFO', labelKey: 'account.accessInfo', testid: 'account-access-info' },
  { column: 'NOTES', labelKey: 'account.notes', testid: 'account-notes' },
] as const

/** Optional numbers and dates cleared from the keyboard arrive as '', which those columns must not store. */
const OPTIONAL_VALUE_COLUMNS = [
  'CREDITLIMIT',
  'MINIMUMBALANCE',
  'INTERESTRATE',
  'MINIMUMPAYMENT',
  'PAYMENTDUEDATE',
  'STATEMENTDATE',
] as const

const OPENING_DATE_CONFLICT_KEYS: Record<OpeningDateConflict, string> = {
  transactions: 'account.openingDateBeforeTransactions',
  stockPurchases: 'account.openingDateBeforeStockPurchases',
  scheduled: 'account.openingDateBeforeScheduled',
}

const typeOptions = computed(() =>
  (props.account ? typeChangeOptions(props.account.ACCOUNTTYPE) : [...ACCOUNT_TYPES]).map(
    (value) => ({ value, label: t(typeLabelKey(value)) }),
  ),
)

const statusOptions = computed(() =>
  ACCOUNT_STATUSES.map((value) => ({ value, label: t(statusLabelKey(value)) })),
)

const currencyOptions = computed(() => props.currencies)

const isKnownCurrency = (currencyId: number | null | undefined): boolean =>
  props.currencies.some((c) => c.CURRENCYID === currencyId)

/**
 * A new account starts as desktop's does: a favorite in the base currency,
 * opened today with a zero balance (mmAddAccountWizard, wizard_newaccount.cpp).
 */
const blank = (): Draft => ({
  ACCOUNTNAME: '',
  ACCOUNTTYPE: 'Checking',
  ACCOUNTNUM: null,
  STATUS: 'Open',
  NOTES: null,
  HELDAT: null,
  WEBSITE: null,
  CONTACTINFO: null,
  ACCESSINFO: null,
  INITIALBAL: 0,
  INITIALDATE: formatIsoDate(new Date()),
  FAVORITEACCT: encodeFavorite(true),
  CURRENCYID: isKnownCurrency(props.baseCurrencyId) ? (props.baseCurrencyId as number) : undefined,
  STATEMENTLOCKED: 0,
  STATEMENTDATE: null,
  MINIMUMBALANCE: null,
  CREDITLIMIT: null,
  INTERESTRATE: null,
  PAYMENTDUEDATE: null,
  MINIMUMPAYMENT: null,
})

const fromProps = (): Draft => (props.account ? { ...props.account } : blank())

const draft = ref<Draft>(fromProps())

const isNew = computed(() => props.account === null)

const isFavoriteValue = computed({
  get: () => isFavorite({ FAVORITEACCT: draft.value.FAVORITEACCT ?? '' }),
  set: (value: boolean) => {
    draft.value.FAVORITEACCT = encodeFavorite(value)
  },
})

// Unlocking writes 0 and keeps the date, as desktop does (accountdialog.cpp).
const isLockedValue = computed({
  get: () => draft.value.STATEMENTLOCKED === 1,
  set: (value: boolean) => {
    draft.value.STATEMENTLOCKED = value ? 1 : 0
  },
})

const nameError = ref('')
const currencyError = ref('')
const initialBalanceError = ref('')
const initialDateError = ref('')
const saving = ref(false)

/** Zero is a real initial balance, so emptiness is tested, not falsiness. */
const isBlank = (value: unknown): boolean => value === null || value === undefined || value === ''

// Requirement "Statement Lock Management": a lock without its date is refused,
// and the field says so as soon as the lock is set.
const statementDateError = computed(() =>
  isLockedValue.value && isBlank(draft.value.STATEMENTDATE)
    ? t('account.statementDateRequired')
    : '',
)

const validateName = async () => {
  const name = draft.value.ACCOUNTNAME?.trim()
  if (!name) return
  const unique = await store.validateName(name, props.account?.ACCOUNTID)
  nameError.value = unique ? '' : t('account.nameNotUnique')
}

watch(
  () => draft.value.CURRENCYID,
  (currencyId) => {
    currencyError.value =
      currencyId !== undefined && currencyId !== null && !isKnownCurrency(currencyId)
        ? t('account.currencyInvalid')
        : ''
  },
  { immediate: true },
)

// The editor can open before the page has read the file's currencies, so a new
// account still without one takes the base currency once it is known.
watch(
  () => [props.currencies, props.baseCurrencyId] as const,
  () => {
    if (isNew.value && isBlank(draft.value.CURRENCYID) && isKnownCurrency(props.baseCurrencyId)) {
      draft.value.CURRENCYID = props.baseCurrencyId as number
    }
  },
)

watch(
  () => props.account,
  () => {
    draft.value = fromProps()
    nameError.value = ''
    initialBalanceError.value = ''
    initialDateError.value = ''
  },
)

/** The draft as it is written: trimmed name, empty optionals as NULL. */
const normalized = (): Draft => {
  const values: Draft = { ...draft.value, ACCOUNTNAME: draft.value.ACCOUNTNAME?.trim() ?? '' }
  for (const column of OPTIONAL_VALUE_COLUMNS) {
    if ((values[column] as unknown) === '') values[column] = null
  }
  return values
}

/** Required-field and date rules that need no database. */
const checkFields = (values: Draft): boolean => {
  nameError.value = values.ACCOUNTNAME ? nameError.value : t('account.nameRequired')
  currencyError.value = isBlank(values.CURRENCYID)
    ? t('account.currencyRequired')
    : isKnownCurrency(values.CURRENCYID)
      ? ''
      : t('account.currencyInvalid')
  initialBalanceError.value = isBlank(values.INITIALBAL) ? t('account.initialBalanceRequired') : ''
  initialDateError.value = isBlank(values.INITIALDATE)
    ? t('account.initialDateRequired')
    : (values.INITIALDATE as string) > formatIsoDate(new Date())
      ? t('account.openingDateFuture')
      : ''
  return !(
    nameError.value ||
    currencyError.value ||
    initialBalanceError.value ||
    initialDateError.value ||
    statementDateError.value
  )
}

const onSave = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const values = normalized()
    if (!checkFields(values)) return

    // The name is checked here as well as on blur, so a click that beats the
    // blur cannot save a duplicate.
    if (!(await store.validateName(values.ACCOUNTNAME as string, props.account?.ACCOUNTID))) {
      nameError.value = t('account.nameNotUnique')
      return
    }

    if (props.account) {
      const conflict = await store.openingDateConflict(
        props.account.ACCOUNTID,
        values.INITIALDATE as string,
      )
      if (conflict) {
        initialDateError.value = t(OPENING_DATE_CONFLICT_KEYS[conflict])
        return
      }
    }

    emit('save', values)
  } finally {
    saving.value = false
  }
}
</script>
