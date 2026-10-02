<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" persistent>
    <q-card style="width: 100%; max-width: 600px" data-testid="account-detail">
      <q-card-section class="row items-center">
        <div class="text-h6" data-testid="account-detail-name">
          {{ account?.ACCOUNTNAME ?? $t('account.detailTitle') }}
        </div>
        <q-space />
        <q-btn
          dense
          flat
          icon="mdi-pencil"
          :label="$t('common.edit')"
          data-testid="account-detail-edit"
          @click="onEdit"
        />
        <q-btn
          dense
          flat
          round
          icon="mdi-delete"
          color="negative"
          :aria-label="$t('common.delete')"
          data-testid="account-detail-delete"
          @click="onDelete"
        />
        <q-btn dense flat round icon="mdi-close" :aria-label="$t('common.close')" v-close-popup />
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
              {{ account ? $t(typeLabelKey(account.ACCOUNTTYPE)) : '' }}
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.status') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-status">
              <q-badge :color="account && isOpen(account) ? 'positive' : 'grey'">
                {{ account ? $t(statusLabelKey(account.STATUS)) : '' }}
              </q-badge>
            </div>
          </div>
        </div>

        <div class="row q-col-gutter-sm q-mb-md">
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.currency') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-currency">
              {{ account ? store.getCurrencyCode(account) : '' }}
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
                color="amber"
                :aria-label="$t('account.favorite')"
                :aria-pressed="isAccountFav"
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
              {{ money(account?.INITIALBAL) }}
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-body2 text-grey-7">{{ $t('account.initialDate') }}</div>
            <div class="text-subtitle1" data-testid="account-detail-initial-date">
              {{ account?.INITIALDATE ?? $t('common.notSet') }}
            </div>
          </div>
        </div>

        <!-- Credit and loan planning fields, shown for every type as desktop does -->
        <div class="q-mt-md">
          <q-separator class="q-my-md" />
          <div class="text-subtitle2">{{ $t('account.creditSettings') }}</div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.creditLimit') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-credit-limit">
                {{ money(account?.CREDITLIMIT) }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.minimumBalance') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-minimum-balance">
                {{ money(account?.MINIMUMBALANCE) }}
              </div>
            </div>
          </div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.interestRate') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-interest-rate">
                {{
                  isBlank(account?.INTERESTRATE) ? $t('common.notSet') : `${account?.INTERESTRATE}%`
                }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.minimumPayment') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-minimum-payment">
                {{ money(account?.MINIMUMPAYMENT) }}
              </div>
            </div>
          </div>
          <div class="row q-col-gutter-sm q-mt-sm">
            <div class="col-12 col-sm-6">
              <div class="text-body2 text-grey-7">{{ $t('account.paymentDueDate') }}</div>
              <div class="text-subtitle1" data-testid="account-detail-payment-due">
                {{ account?.PAYMENTDUEDATE || $t('common.notSet') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Other information -->
        <div class="q-mt-md">
          <q-separator class="q-my-md" />
          <div class="text-subtitle2">{{ $t('account.otherInfo') }}</div>
          <div v-for="field in OTHER_INFO_FIELDS" :key="field.column" class="q-mt-sm">
            <div class="text-body2 text-grey-7">{{ $t(field.labelKey) }}</div>
            <div class="text-subtitle1" style="white-space: pre-wrap" :data-testid="field.testid">
              {{ account?.[field.column] || $t('common.notSet') }}
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
import { isOpen } from '../../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../../domain/records'
import { useAccountStore } from '../../stores/account-store'
import { statusLabelKey, typeLabelKey } from './account-labels'

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

const OTHER_INFO_FIELDS = [
  {
    column: 'ACCOUNTNUM',
    labelKey: 'account.accountNumber',
    testid: 'account-detail-account-number',
  },
  { column: 'HELDAT', labelKey: 'account.heldAt', testid: 'account-detail-held-at' },
  { column: 'WEBSITE', labelKey: 'account.website', testid: 'account-detail-website' },
  {
    column: 'CONTACTINFO',
    labelKey: 'account.contactInfo',
    testid: 'account-detail-contact-info',
  },
  { column: 'ACCESSINFO', labelKey: 'account.accessInfo', testid: 'account-detail-access-info' },
  { column: 'NOTES', labelKey: 'account.notes', testid: 'account-detail-notes' },
] as const

const $q = useQuasar()
const visible = ref(props.modelValue)
const store = useAccountStore()
const { t } = useI18n()

watch(
  () => props.modelValue,
  (value) => {
    visible.value = value
  },
)

watch(visible, (value) => emit('update:modelValue', value))

// The balance is read from the store's cache, which every write refreshes, so
// the detail shows what was just saved. Opening the detail fills a missing entry.
watch(
  () => [props.modelValue, props.account?.ACCOUNTID] as const,
  ([open, accountId]) => {
    if (open && accountId !== undefined) void store.getBalance(accountId).catch(() => {})
  },
  { immediate: true },
)

/** Zero is a real amount, so absence is tested, not falsiness. */
const isBlank = (value: unknown): boolean => value === null || value === undefined || value === ''

/** An amount in the account's currency, or "Not set" when the column is empty. */
const money = (value: number | null | undefined): string => {
  if (isBlank(value)) return t('common.notSet')
  const currency = props.account ? store.getCurrencyById(props.account.CURRENCYID) : null
  return currency ? formatAmount(value as number, currency) : String(value)
}

const formattedBalance = computed(() => {
  if (!props.account) return ''
  const balance = store.getCachedBalance(props.account.ACCOUNTID)
  return balance === null ? t('account.loadingBalance') : money(balance)
})

const isAccountFav = computed(() =>
  props.account ? store.isAccountFavorite(props.account) : false,
)

const isLocked = computed(() => props.account?.STATEMENTLOCKED === 1)

const onEdit = () => {
  if (props.account) emit('edit', props.account)
}

const onDelete = () => {
  if (props.account) emit('delete', props.account)
}

const onToggleFavorite = () => {
  if (props.account) emit('toggle-favorite', props.account.ACCOUNTID)
}
</script>
