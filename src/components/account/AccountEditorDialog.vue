<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" persistent>
    <AccountEditorForm
      :account="account"
      :currencies="currencies"
      :error-message="errorMessage"
      @save="(values) => emit('save', values)"
      @delete="() => account && emit('delete', account)"
      @cancel="close"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import AccountEditorForm from './AccountEditorForm.vue'
import type { AccountRecord, CurrencyRecord } from '../../domain/records'

/**
 * Presentation only: dialog at desktop width, full-page on mobile
 * (consistent with currency editor design).
 */
const props = defineProps<{
  modelValue: boolean
  account: AccountRecord | null
  currencies: CurrencyRecord[]
  errorMessage: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  save: [Partial<AccountRecord> & { ACCOUNTID?: number }]
  delete: [AccountRecord]
}>()

const $q = useQuasar()
const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    visible.value = value
  },
)

watch(visible, (value) => emit('update:modelValue', value))

const close = () => {
  visible.value = false
}
</script>
