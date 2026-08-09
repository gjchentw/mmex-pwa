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

    <div v-else>
      <q-list bordered separator data-testid="account-list">
        <q-item
          v-for="account in store.sortedAccounts"
          :key="account.ACCOUNTID"
          v-ripple
          clickable
          :data-account-id="account.ACCOUNTID"
          @click="openDetail(account)"
        >
          <q-item-section>
            <q-item-label>
              {{ account.ACCOUNTNAME }}
              <q-badge
                v-if="store.isAccountFavorite(account)"
                color="gold"
                class="q-ml-sm"
                icon="mdi-star"
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
            <q-item-label caption>
              {{ store.getTypeDisplay(account) }} |
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

        <q-item v-if="store.sortedAccounts.length === 0">
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
      @save="onSave"
      @delete="onDelete"
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
            :label="$t('account.cancel')"
            v-close-popup
            data-testid="account-delete-cancel"
          />
          <q-btn
            flat
            :label="$t('account.delete')"
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
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountStore } from '../stores/account-store'
import { formatAmount } from '../domain/rules/currency'
import { holdsSecurities } from '../domain/rules/account'
import type { AccountRecord } from '../domain/records'
import AccountDetailDialog from '../components/account/AccountDetailDialog.vue'
import AccountEditorDialog from '../components/account/AccountEditorDialog.vue'

const store = useAccountStore()
const { t } = useI18n()

const detailOpen = ref(false)
const editorOpen = ref(false)
const deleteDialogOpen = ref(false)
const selectedAccount = ref<AccountRecord | null>(null)
const editingAccount = ref<AccountRecord | null>(null)
const editorError = ref('')

/** Check if account type holds securities (Investment/Shares) */
const isInvestmentType = (account: AccountRecord | null): boolean => {
  if (!account) return false
  return holdsSecurities({ ACCOUNTTYPE: account.ACCOUNTTYPE })
}

/** Format balance for display */
const formatBalance = (account: AccountRecord): string => {
  const currency = store.getCurrencyById(account.CURRENCYID)
  if (!currency) return ''
  const cached = store.getCachedBalance(account.ACCOUNTID)
  if (cached !== null) {
    return formatAmount(cached, currency)
  }
  // Loading state - show placeholder
  return t('account.loadingBalance')
}

const openDetail = (account: AccountRecord) => {
  selectedAccount.value = account
  detailOpen.value = true
}

const openEditor = (account: AccountRecord | null) => {
  editingAccount.value = account
  editorError.value = ''
  editorOpen.value = true
}

const openDeleteDialog = (account: AccountRecord) => {
  selectedAccount.value = account
  deleteDialogOpen.value = true
}

const onToggleFavorite = async (accountId: number) => {
  await store.toggleFavorite(accountId)
}

const onSave = async (values: Partial<AccountRecord> & { ACCOUNTID?: number }) => {
  editorError.value = ''
  try {
    await store.save(values)
    editorOpen.value = false
    editingAccount.value = null
  } catch (err: unknown) {
    editorError.value = err instanceof Error ? err.message : String(err)
  }
}

const confirmDelete = async () => {
  if (!selectedAccount.value) return
  deleteDialogOpen.value = false
  try {
    await store.remove(selectedAccount.value.ACCOUNTID)
    selectedAccount.value = null
  } catch (err: unknown) {
    editorError.value = err instanceof Error ? err.message : String(err)
  }
}

// For now, onDelete from editor just opens the delete dialog
const onDelete = (account: AccountRecord) => {
  openDeleteDialog(account)
}

onMounted(async () => {
  await store.load()
  await store.loadBalances()
})
</script>
