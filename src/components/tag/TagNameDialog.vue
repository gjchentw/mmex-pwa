<script setup lang="ts">
import { ref, watch } from 'vue'
import NamePromptCard from '../taxonomy/NamePromptCard.vue'

/** Desktop's "Add Tag" / "Edit Tag" prompt as a dialog. */

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    prompt: string
    initialName?: string
    errorMessage?: string
    saving?: boolean
  }>(),
  { initialName: '', errorMessage: '', saving: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [name: string]
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
  <q-dialog v-model="visible" persistent data-testid="tag-name-dialog">
    <NamePromptCard
      prefix="tag"
      :title="title"
      :prompt="prompt"
      :initial-name="initialName"
      :error-message="errorMessage"
      :saving="saving"
      @save="emit('save', $event)"
      @cancel="close"
    />
  </q-dialog>
</template>
