<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * Desktop's single-field name prompt — "Add Category" / "Edit Category",
 * "Add Tag" / "Edit Tag" (openspec: transaction-taxonomy, Category Creation,
 * Renaming and Moving; Tag Creation and Renaming). The refusal the repository
 * raises is shown at the entry. `prefix` names the test ids per kind. Kept apart
 * from the dialog so it renders under test.
 */

const props = withDefaults(
  defineProps<{
    prefix: 'category' | 'tag'
    title: string
    prompt: string
    initialName?: string
    /** Shown under the entry when the save was refused. */
    errorMessage?: string
    saving?: boolean
  }>(),
  { initialName: '', errorMessage: '', saving: false },
)

const emit = defineEmits<{ save: [name: string]; cancel: [] }>()

const name = ref(props.initialName)
watch(
  () => props.initialName,
  (value) => {
    name.value = value
  },
)

const submit = () => emit('save', name.value)
</script>

<template>
  <q-card style="width: 100%; max-width: 480px" :data-testid="`${prefix}-name-card`">
    <q-card-section>
      <div class="text-h6">{{ title }}</div>
      <div class="text-body2 q-mt-xs">{{ prompt }}</div>
    </q-card-section>
    <q-card-section>
      <q-input
        v-model="name"
        outlined
        dense
        autofocus
        :error="!!errorMessage"
        :error-message="errorMessage"
        :data-testid="`${prefix}-name`"
        @keyup.enter="submit"
      />
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        :label="$t('common.cancel')"
        :data-testid="`${prefix}-name-cancel`"
        @click="emit('cancel')"
      />
      <q-btn
        color="primary"
        :label="$t('common.save')"
        :loading="saving"
        :data-testid="`${prefix}-name-save`"
        @click="submit"
      />
    </q-card-actions>
  </q-card>
</template>
