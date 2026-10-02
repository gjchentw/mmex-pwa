<template>
  <q-page class="q-pa-md" data-testid="accounts-page">
    <div class="row items-center q-mb-md">
      <div class="text-h5">{{ $t('account.title') }}</div>
      <q-space />
      <q-btn
        color="primary"
        icon="mdi-plus"
        :label="$t('account.add')"
        data-testid="account-add"
        @click="openEditor(null)"
      />
    </div>

    <div v-if="store.loading" class="text-center q-pa-lg">
      <q-spinner size="32px" color="primary" />
    </div>

    <div v-else-if="store.error" class="text-negative" data-testid="account-error">
      {{ store.error }}
    </div>

    <q-banner
      v-if="actionError"
      dense
      class="bg-negative text-white q-mb-md"
      data-testid="account-action-error"
    >
      {{ actionError }}
      <template #action>
        <q-btn flat dense :label="$t('common.close')" @click="actionError = ''" />
      </template>
    </q-banner>

    <div v-if="!store.loading && !store.error">
      <!-- Grouped by type in desktop's tree order, by name within each group (design D1). -->
      <q-list bordered separator data-testid="account-list">
        <template v-for="group in store.groupedAccounts" :key="group.type">
          <q-item-label header data-testid="account-group">
            {{ $t(typeLabelKey(group.type)) }}
          </q-item-label>
          <q-item
            v-for="account in group.accounts"
            :key="account.ACCOUNTID"
            v-ripple
            clickable
            :data-account-id="account.ACCOUNTID"
            @click="openDetail(account)"
          >
            <q-item-section>
              <q-item-label>
                {{ account.ACCOUNTNAME }}
                <q-icon
                  v-if="store.isAccountFavorite(account)"
                  name="mdi-star"
                  color="amber"
                  size="xs"
                  class="q-ml-xs"
                  role="img"
                  :aria-label="$t('account.favorite')"
                  data-testid="account-favorite-badge"
                />
                <q-badge
                  v-if="store.isClosed(account)"
                  color="grey"
                  class="q-ml-sm"
                  :label="$t('account.closed')"
                  data-testid="account-closed-badge"
                />
              </q-item-label>
              <q-item-label caption data-testid="account-currency-code">
                {{ store.getCurrencyCode(account) }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <div class="text-right">
                <div class="text-no-wrap" data-testid="account-balance">
                  {{ formatBalance(account) }}
                </div>
              </div>
            </q-item-section>
          </q-item>
        </template>

        <q-item v-if="store.accounts.length === 0">
          <q-item-section class="text-grey-7" data-testid="account-empty">
            {{ $t('account.noAccounts') }}
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <!-- Account Detail Dialog -->
    <AccountDetailDialog
      v-model="detailOpen"
      :account="selectedAccount"
      :currencies="store.currencies"
      @edit="openEditor"
      @delete="openDeleteDialog"
      @toggle-favorite="onToggleFavorite"
    />

    <!-- Account Editor Dialog -->
    <AccountEditorDialog
      v-model="editorOpen"
      :account="editingAccount"
      :currencies="store.currencies"
      :error-message="editorError"
      :base-currency-id="store.baseCurrencyId"
      @save="onSave"
      @delete="openDeleteDialog"
    />

    <!-- Delete Confirmation Dialog -->
    <q-dialog v-model="deleteDialogOpen" persistent data-testid="account-delete-dialog">
      <q-card>
        <q-card-section class="row items-center">
          <q-avatar icon="mdi-alert-circle" color="negative" text-color="white" />
          <span class="q-ml-sm text-h6">{{ $t('account.deleteTitle') }}</span>
        </q-card-section>

        <q-card-section>
          <p v-if="selectedAccount">
            {{ $t('account.deleteConfirm', { name: selectedAccount.ACCOUNTNAME }) }}
          </p>
          <ul>
            <li>{{ $t('account.deleteWillRemoveAccount') }}</li>
            <li>{{ $t('account.deleteWillRemoveTransactions') }}</li>
            <li>{{ $t('account.deleteWillRemoveScheduled') }}</li>
            <li v-if="isInvestmentType(selectedAccount)">
              {{ $t('account.deleteWillRemoveStockPositions') }}
            </li>
          </ul>
          <p class="text-negative">
            {{ $t('account.deleteCannotBeUndone') }}
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn
            flat
            :label="$t('common.cancel')"
            v-close-popup
            data-testid="account-delete-cancel"
          />
          <q-btn
            flat
            :label="$t('common.delete')"
            color="negative"
            @click="confirmDelete"
            data-testid="account-delete-confirm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountStore } from '../stores/account-store'
import { formatAmount } from '../domain/rules/currency'
import { holdsSecurities } from '../domain/rules/account'
import type { AccountRecord } from '../domain/records'
import AccountDetailDialog from '../components/account/AccountDetailDialog.vue'
import AccountEditorDialog from '../components/account/AccountEditorDialog.vue'
import { typeLabelKey } from '../components/account/account-labels'

const store = useAccountStore()
const { t } = useI18n()

const detailOpen = ref(false)
const editorOpen = ref(false)
const deleteDialogOpen = ref(false)
const editingAccount = ref<AccountRecord | null>(null)
const editorError = ref('')
/** A failed action taken outside the editor, which has no other place to show it. */
const actionError = ref('')

// The detail reads its account from the store by ID, so it shows what a save
// or a toggle has just written rather than the row it was opened with.
const selectedAccountId = ref<number | null>(null)
const selectedAccount = computed(() =>
  selectedAccountId.value === null ? null : store.getById(selectedAccountId.value),
)

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const isInvestmentType = (account: AccountRecord | null): boolean =>
  account !== null && holdsSecurities(account)

const formatBalance = (account: AccountRecord): string => {
  const currency = store.getCurrencyById(account.CURRENCYID)
  if (!currency) return ''
  const cached = store.getCachedBalance(account.ACCOUNTID)
  return cached === null ? t('account.loadingBalance') : formatAmount(cached, currency)
}

const openDetail = (account: AccountRecord) => {
  selectedAccountId.value = account.ACCOUNTID
  detailOpen.value = true
}

const openEditor = (account: AccountRecord | null) => {
  editingAccount.value = account
  editorError.value = ''
  editorOpen.value = true
}

const openDeleteDialog = (account: AccountRecord) => {
  selectedAccountId.value = account.ACCOUNTID
  deleteDialogOpen.value = true
}

const onToggleFavorite = async (accountId: number) => {
  actionError.value = ''
  try {
    await store.toggleFavorite(accountId)
  } catch (err: unknown) {
    actionError.value = messageOf(err)
  }
}

const onSave = async (values: Partial<AccountRecord> & { ACCOUNTID?: number }) => {
  editorError.value = ''
  try {
    await store.save(values)
    editorOpen.value = false
    editingAccount.value = null
  } catch (err: unknown) {
    editorError.value = messageOf(err)
  }
}

// Requirement "Account Deletion from Surface": a confirmed deletion returns the
// user to the list, so neither the detail nor the editor stays open on an
// account that no longer exists.
const confirmDelete = async () => {
  const accountId = selectedAccountId.value
  if (accountId === null) return
  deleteDialogOpen.value = false
  actionError.value = ''
  try {
    await store.remove(accountId)
    detailOpen.value = false
    editorOpen.value = false
    editingAccount.value = null
    selectedAccountId.value = null
  } catch (err: unknown) {
    actionError.value = messageOf(err)
  }
}

onMounted(async () => {
  await store.load()
  await store.loadBalances()
})
</script>
