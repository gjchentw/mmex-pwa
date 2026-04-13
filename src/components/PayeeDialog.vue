<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card style="min-width: 400px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input v-model="form.PAYEENAME" :label="$t('payees.name')" dense autofocus />
        <q-select
          v-model="form.CATEGID"
          :options="categoryOptions"
          :label="$t('payees.defaultCategory')"
          emit-value
          map-options
          dense
          clearable
        />
        <q-input v-model="form.NUMBER" :label="$t('payees.number')" dense />
        <q-input v-model="form.WEBSITE" :label="$t('payees.website')" dense />
        <q-input v-model="form.NOTES" :label="$t('payees.notes')" dense type="textarea" autogrow />
        <q-input v-model="form.PATTERN" :label="$t('payees.pattern')" dense type="textarea" autogrow />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn flat color="primary" :label="$t('common.save')" :disable="!form.PAYEENAME.trim()" @click="onSubmit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, onMounted, ref } from 'vue'
import { useDialogPluginComponent } from 'quasar'
import { useCategories } from '@/composables/useCategories'
import type { Payee } from '@/types/entities'

const props = defineProps<{
  title: string
  payee?: Payee
}>()

defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()

const { categories, refresh: refreshCategories } = useCategories()
const categoryOptions = ref<Array<{ label: string; value: number }>>([])

const form = reactive({
  PAYEENAME: props.payee?.PAYEENAME ?? '',
  CATEGID: props.payee?.CATEGID ?? null as number | null,
  NUMBER: props.payee?.NUMBER ?? '',
  WEBSITE: props.payee?.WEBSITE ?? '',
  NOTES: props.payee?.NOTES ?? '',
  PATTERN: props.payee?.PATTERN ?? '',
})

function onSubmit() {
  onDialogOK({ ...form })
}

onMounted(async () => {
  await refreshCategories()
  categoryOptions.value = categories.value.map((c) => ({
    label: c.CATEGNAME,
    value: c.CATEGID,
  }))
})
</script>
