<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CategoryRecord, PayeeRecord } from '../../domain/records'
import type { PayeeDraft } from '../../domain/repos/taxonomy'
import type { DefaultCategoryMode } from '../../domain/rules/taxonomy'
import PayeeEditorForm from './PayeeEditorForm.vue'

/** Dialog shell around PayeeEditorForm. */

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    payee: PayeeRecord | null
    categories: readonly CategoryRecord[]
    delimiter?: string
    mode: DefaultCategoryMode
    errorMessage?: string
    saving?: boolean
  }>(),
  { delimiter: ':', errorMessage: '', saving: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [draft: PayeeDraft | Partial<PayeeDraft>]
  cancel: []
}>()

const visible = ref(props.modelValue)
watch(
  () => props.modelValue,
  (value) => {
    visible.value = value
  },
)
watch(visible, (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value)
})

const close = () => {
  visible.value = false
  emit('cancel')
}
</script>

<template>
  <q-dialog
    v-model="visible"
    :maximized="$q.screen.lt.sm"
    persistent
    data-testid="payee-editor-dialog"
  >
    <PayeeEditorForm
      :payee="payee"
      :categories="categories"
      :delimiter="delimiter"
      :mode="mode"
      :error-message="errorMessage"
      :saving="saving"
      @save="emit('save', $event)"
      @cancel="close"
    />
  </q-dialog>
</template>
