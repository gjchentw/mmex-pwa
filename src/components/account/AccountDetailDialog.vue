<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" persistent>
    <q-card style="width: 100%; max-width: 600px" data-testid="account-detail">
      <q-card-section class="row items-center">
        <div class="text-h6">
          {{ account?.ACCOUNTNAME ?? $t('account.detailTitle') }}
        </div>
        <q-space />
        <q-btn
          dense
          flat
          round
          icon="mdi-pencil"
          :label="$t('account.edit')"
          data-testid="account-detail-edit"
          @click="onEdit"
        />
        <q-btn
          dense
          flat
          round
          icon="mdi-delete"
          color="negative"
          data-testid="account-detail-delete"
          @click="onDelete"
        />
        <q-btn dense flat round icon="mdi-close" v-close-popup />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <!-- Balance -->
        <div class="row q-mb-md">
          <div class="col-12">
            <div class="text-h5" data-testid="account-detail-balance">
              {{ formattedBalance }}
            </div>
            <div class="text-caption text-grey-6">
              {{ $t('account.currentBalance') }}
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <!-- Account Information -->
        <div class="row q-col-gutter-sm q-mb-md">
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.type') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-type">
              {{ account?.ACCOUNTTYPE }}
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.status') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-status">
              <q-badge :color="statusColor">
                {{ account?.STATUS }}
              </q-badge>
            </div>
          </div>
        </div>

        <div class="row q-col-gutter-sm q-mb-md">
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.currency') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-currency">
              {{ currencySymbol }}
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.favorite') }}</div>
            <div class="text-subtitle1">
              <q-btn
                dense
                flat
                round
                :icon="isAccountFav ? 'mdi-star' : 'mdi-star-outline'"
                color="gold"
                data-testid="account-detail-favorite"
                @click="onToggleFavorite"
              />
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <!-- Statement Lock -->
        <div class="row q-mb-md">
          <div class="col-12">
            <div class="text-body2 text-grey-7">{{ $t('account.statementLock') }}</div>
            <div v-if="isLocked" class="text-subtitle1">
              <q-badge color="warning" data-testid="account-detail-locked">
                {{ $t('account.locked') }}: {{ account?.STATEMENTDATE }}
              </q-badge>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ $t('account.lockedHint') }}
              </div>
            </div>
            <div v-else class="text-subtitle1">
              <q-badge color="positive" data-testid="account-detail-unlocked">
                {{ $t('account.unlocked') }}
              </q-badge>
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <!-- Initial Balance -->
        <div class="row q-col-gutter-sm q-mb-md">
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.initialBalance') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-initial-balance">
              {{ formatInitialBalance }}
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.initialDate') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-initial-date">
              {{ account?.INITIALDATE ?? $t('common.notSet') }}
            </div>
          </div>
        </div>

        <!-- Account Number -->
        <div v-if="account?.ACCOUNTNUM" class="row q-mb-md">
          <div class="col-12">
            <div class="text-body2 text-grey-7">{{ $t('account.accountNumber') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-account-number">
              {{ account.ACCOUNTNUM }}
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="account?.NOTES" class="row q-mb-md">
          <div class="col-12">
            <div class="text-body2 text-grey-7">{{ $t('account.notes') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-notes">
              {{ account.NOTES }}
            </div>
          </div>
        </div>

        <!-- Type-specific fields for Credit/Loan -->
        <div v-if="showCreditFields" class="q-mt-md">
          <q-separator class="q-my-md" />
          <div class="text-subtitle2">{{ $t('account.creditSettings') }}</div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.creditLimit') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-credit-limit">
                {{ formatCreditLimit }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.minimumBalance') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-minimum-balance">
                {{ formatMinimumBalance }}
              </div>
            </div>
          </div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.interestRate') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-interest-rate">
                {{ formatInterestRate }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.minimumPayment') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-minimum-payment">
                {{ formatMinimumPayment }}
              </div>
            </div>
          </div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.paymentDueDate') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-payment-due">
                {{ account?.PAYMENTDUEDATE ?? $t('common.notSet') }}
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { formatAmount } from '../../domain/rules/currency'
import type { AccountRecord, CurrencyRecord } from '../../domain/records'
import { useAccountStore } from '../../stores/account-store'

const props = defineProps<{
  modelValue: boolean
  account: AccountRecord | null
  currencies: CurrencyRecord[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  edit: [AccountRecord]
  delete: [AccountRecord]
  'toggle-favorite': [number]
}>()

const $q = useQuasar()
const visible = ref(props.modelValue)
const store = useAccountStore()
const { t } = useI18n()

// Load balance when account changes
const balance = ref<number | null>(null)

watch(
  () => props.modelValue,
  (value) => {
    visible.value = value
    if (value && props.account) {
      loadBalance()
    }
  },
)

watch(visible, (value) => emit('update:modelValue', value))

watch(
  () => props.account,
  (account) => {
    if (account) {
      loadBalance()
    }
  },
)

const loadBalance = async () => {
  if (!props.account) return
  try {
    balance.value = await store.getBalance(props.account.ACCOUNTID)
  } catch {
    balance.value = null
  }
}

const statusColor = computed(() => {
  if (!props.account) return 'grey'
  return props.account.STATUS === 'Open' ? 'positive' : 'grey'
})

const isAccountFav = computed(() => {
  if (!props.account) return false
  return store.isAccountFavorite(props.account)
})

const currencySymbol = computed(() => {
  if (!props.account) return ''
  const currency = store.getCurrencyById(props.account.CURRENCYID)
  return currency?.CURRENCY_SYMBOL ?? ''
})

const formattedBalance = computed(() => {
  if (balance.value === null) return t('account.loadingBalance')
  const currency = store.getCurrencyById(props.account?.CURRENCYID ?? 0)
  if (!currency) return ''
  return formatAmount(balance.value, currency)
})

const formatInitialBalance = computed(() => {
  if (!props.account?.INITIALBAL) return t('common.notSet')
  const currency = store.getCurrencyById(props.account.CURRENCYID)
  if (!currency) return String(props.account.INITIALBAL)
  return formatAmount(props.account.INITIALBAL, currency)
})

const isLocked = computed(() => {
  return props.account?.STATEMENTLOCKED === 1
})

const showCreditFields = computed(() => {
  if (!props.account) return false
  const type = props.account.ACCOUNTTYPE
  return ['Credit Card', 'Loan', 'Term'].includes(type)
})

const formatCreditLimit = computed(() => {
  if (props.account?.CREDITLIMIT === null || props.account?.CREDITLIMIT === undefined) {
    return t('common.notSet')
  }
  const currency = store.getCurrencyById(props.account.CURRENCYID)
  if (!currency) return String(props.account.CREDITLIMIT)
  return formatAmount(props.account.CREDITLIMIT, currency)
})

const formatMinimumBalance = computed(() => {
  if (props.account?.MINIMUMBALANCE === null || props.account?.MINIMUMBALANCE === undefined) {
    return t('common.notSet')
  }
  const currency = store.getCurrencyById(props.account.CURRENCYID)
  if (!currency) return String(props.account.MINIMUMBALANCE)
  return formatAmount(props.account.MINIMUMBALANCE, currency)
})

const formatInterestRate = computed(() => {
  if (props.account?.INTERESTRATE === null || props.account?.INTERESTRATE === undefined) {
    return t('common.notSet')
  }
  return `${props.account.INTERESTRATE}%`
})

const formatMinimumPayment = computed(() => {
  if (props.account?.MINIMUMPAYMENT === null || props.account?.MINIMUMPAYMENT === undefined) {
    return t('common.notSet')
  }
  const currency = store.getCurrencyById(props.account.CURRENCYID)
  if (!currency) return String(props.account.MINIMUMPAYMENT)
  return formatAmount(props.account.MINIMUMPAYMENT, currency)
})

const onEdit = () => {
  if (props.account) {
    emit('edit', props.account)
  }
}

const onDelete = () => {
  if (props.account) {
    emit('delete', props.account)
  }
}

const onToggleFavorite = () => {
  if (props.account) {
    emit('toggle-favorite', props.account.ACCOUNTID)
  }
}
</script>
