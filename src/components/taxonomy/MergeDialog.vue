<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TaxonomyKind, TaxonomyUsage } from '../../domain/repos/taxonomy'
import MergeForm, { type MergeOption, type MergeOutcome } from './MergeForm.vue'

/** Dialog shell around MergeForm (design D7 of transaction-taxonomy-surfaces). */

const props = defineProps<{
  modelValue: boolean
  kind: TaxonomyKind
  options: readonly MergeOption[]
  initialSource?: number | null
  usageOf: (id: number) => Promise<TaxonomyUsage>
  relocate: (from: number, to: number, options: { deleteSource: boolean }) => Promise<MergeOutcome>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  merged: [outcome: MergeOutcome]
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
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" persistent data-testid="merge-dialog">
    <MergeForm
      :kind="kind"
      :options="options"
      :initial-source="initialSource ?? null"
      :usage-of="usageOf"
      :relocate="relocate"
      @merged="emit('merged', $event)"
      @cancel="visible = false"
    />
  </q-dialog>
</template>
