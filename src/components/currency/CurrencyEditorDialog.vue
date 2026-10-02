<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" persistent>
    <CurrencyEditorForm
      :currency="currency"
      :is-base="isBase"
      :history="history"
      :history-active="historyActive"
      :error-message="errorMessage"
      :deletion-blocker="deletionBlocker"
      :latest-rate="latestRate"
      @save="(values) => emit('save', values)"
      @delete="emit('delete')"
      @add-rate="(entry) => emit('add-rate', entry)"
      @remove-rate="(id) => emit('remove-rate', id)"
      @cancel="close"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import CurrencyEditorForm from './CurrencyEditorForm.vue'
import type { CurrencyUsage } from '../../domain/repos/currency'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../../domain/records'

/** Presentation only: dialog at desktop width, full-page on mobile. */
const props = defineProps<{
  modelValue: boolean
  currency: CurrencyRecord | null
  isBase: boolean
  history: CurrencyHistoryRecord[]
  historyActive: boolean
  errorMessage: string
  deletionBlocker: CurrencyUsage | null
  latestRate: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  save: [Omit<CurrencyRecord, 'CURRENCYID'>]
  delete: []
  'add-rate': [{ date: string; value: number }]
  'remove-rate': [number]
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
