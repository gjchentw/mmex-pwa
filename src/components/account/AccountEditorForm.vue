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
        @blur="validateName"
      />

      <!-- Type -->
      <q-select
        v-model="draft.ACCOUNTTYPE"
        :options="typeOptions"
        :label="$t('account.type')"
        data-testid="account-type"
        @update:model-value="onTypeChange"
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
        />
        <q-input
          v-model="draft.INITIALDATE"
          type="date"
          class="col-12 col-sm-6"
          :label="$t('account.initialDate')"
          data-testid="account-initial-date"
        />
      </div>

      <!-- Status -->
      <q-select
        v-model="draft.STATUS"
        :options="statusOptions"
        :label="$t('account.status')"
        data-testid="account-status"
      />

      <!-- Favorite -->
      <q-toggle
        v-model="isFavoriteValue"
        :label="$t('account.favorite')"
        data-testid="account-favorite-toggle"
      />

      <!-- Account Number -->
      <q-input
        v-model="draft.ACCOUNTNUM"
        :label="$t('account.accountNumber')"
        data-testid="account-account-number"
        clearable
      />

      <!-- Notes -->
      <q-input
        v-model="draft.NOTES"
        :label="$t('account.notes')"
        data-testid="account-notes"
        type="textarea"
        rows="3"
        clearable
      />

      <!-- Type-specific fields for Credit Card, Loan, Term -->
      <template v-if="showCreditFields">
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
      </template>

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
          clearable
        />
      </div>

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
        @click="onSave"
        :disable="!isValid"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../../domain/records'
import { useAccountStore } from '../../stores/account-store'

const props = defineProps<{
  account: AccountRecord | null
  currencies: CurrencyRecord[]
  errorMessage: string
}>()

const emit = defineEmits<{
  save: [Partial<AccountRecord> & { ACCOUNTID?: number }]
  cancel: []
  delete: []
}>()

const store = useAccountStore()

const typeOptions = [...ACCOUNT_TYPES]
const statusOptions = [...ACCOUNT_STATUSES]

const currencyOptions = computed(() => props.currencies)

const blank = (): Omit<AccountRecord, 'ACCOUNTID'> => ({
  ACCOUNTNAME: '',
  ACCOUNTTYPE: 'Checking',
  ACCOUNTNUM: null,
  STATUS: 'Open',
  NOTES: null,
  HELDAT: null,
  WEBSITE: null,
  CONTACTINFO: null,
  ACCESSINFO: null,
  INITIALBAL: null,
  INITIALDATE: null,
  FAVORITEACCT: 'FALSE',
  CURRENCYID: props.currencies[0]?.CURRENCYID ?? 1,
  STATEMENTLOCKED: null,
  STATEMENTDATE: null,
  MINIMUMBALANCE: null,
  CREDITLIMIT: null,
  INTERESTRATE: null,
  PAYMENTDUEDATE: null,
  MINIMUMPAYMENT: null,
})

const fromProps = (): Partial<AccountRecord> & { ACCOUNTID?: number } => {
  const source = props.account
  if (!source) return { ...blank(), ACCOUNTID: undefined }
  return { ...source }
}

const draft = ref<Partial<AccountRecord> & { ACCOUNTID?: number }>(fromProps())

const isNew = computed(() => props.account === null)

// Favorite toggle uses the FAVORITEACCT field
const isFavoriteValue = computed({
  get: () => draft.value.FAVORITEACCT === 'TRUE' || draft.value.FAVORITEACCT === 'true',
  set: (value: boolean) => {
    draft.value.FAVORITEACCT = value ? 'TRUE' : 'FALSE'
  },
})

// Statement lock toggle
const isLockedValue = computed({
  get: () => draft.value.STATEMENTLOCKED === 1,
  set: (value: boolean) => {
    draft.value.STATEMENTLOCKED = value ? 1 : null
    // Clear date if unlocking
    if (!value) {
      draft.value.STATEMENTDATE = null
    }
  },
})

// Show credit fields for Credit Card, Loan, Term
const showCreditFields = computed(() => {
  return ['Credit Card', 'Loan', 'Term'].includes(draft.value.ACCOUNTTYPE ?? '')
})

// Validation
const nameError = ref('')
const currencyError = ref('')

const isValid = computed(() => {
  return (
    draft.value.ACCOUNTNAME?.trim() !== '' &&
    nameError.value === '' &&
    currencyError.value === '' &&
    draft.value.ACCOUNTTYPE !== undefined &&
    draft.value.CURRENCYID !== undefined
  )
})

const validateName = async () => {
  if (!draft.value.ACCOUNTNAME?.trim()) {
    nameError.value = ''
    return
  }
  const unique = await store.validateName(draft.value.ACCOUNTNAME, props.account?.ACCOUNTID)
  if (!unique) {
    nameError.value = 'Account name must be unique'
  } else {
    nameError.value = ''
  }
}

// Validate currency exists
watch(
  () => draft.value.CURRENCYID,
  (currencyId) => {
    if (currencyId && !props.currencies.some((c) => c.CURRENCYID === currencyId)) {
      currencyError.value = 'Please select a valid currency'
    } else {
      currencyError.value = ''
    }
  },
)

// Warn when type changes
const onTypeChange = () => {
  // Could emit an event to show confirmation dialog in parent
  // For now, just let it change
}

// Update draft when props change
watch(
  () => props.account,
  () => {
    draft.value = fromProps()
    nameError.value = ''
    currencyError.value = ''
  },
)

const onSave = () => {
  // Final validation
  if (!draft.value.ACCOUNTNAME?.trim()) {
    nameError.value = 'Account name is required'
    return
  }

  if (!draft.value.CURRENCYID) {
    currencyError.value = 'Currency is required'
    return
  }

  // Clear errors if valid
  nameError.value = ''
  currencyError.value = ''

  emit('save', { ...draft.value })
}
</script>
