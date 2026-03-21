<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card style="min-width: 350px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>

      <q-card-section>
        <q-input
          v-model="name"
          :label="$t('tags.name')"
          autofocus
          dense
          @keyup.enter="onSubmit"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn flat color="primary" :label="$t('common.save')" :disable="!name.trim()" @click="onSubmit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDialogPluginComponent } from 'quasar'

const props = defineProps<{
  title: string
  initialName?: string
}>()

defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()

const name = ref(props.initialName ?? '')

function onSubmit() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  onDialogOK(trimmed)
}
</script>
