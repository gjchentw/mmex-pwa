<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TaxonomyKind } from '../../domain/repos/taxonomy'
import TaxonomyDeleteCard from './TaxonomyDeleteCard.vue'

/** Dialog shell around TaxonomyDeleteCard (design D5 of transaction-taxonomy-surfaces). */

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    kind: TaxonomyKind
    title: string
    names: readonly string[]
    lines?: readonly string[]
    purge?: boolean
    purgeName?: string
  }>(),
  { lines: () => [], purge: false, purgeName: '' },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: []; cancel: [] }>()

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
  <q-dialog v-model="visible" persistent data-testid="taxonomy-delete-dialog">
    <TaxonomyDeleteCard
      :kind="kind"
      :title="title"
      :names="names"
      :lines="lines"
      :purge="purge"
      :purge-name="purgeName"
      @confirm="emit('confirm')"
      @cancel="close"
    />
  </q-dialog>
</template>
