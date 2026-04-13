<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card style="min-width: 400px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input v-model="form.label" :label="$t('dateRanges.label')" dense autofocus />

        <q-select
          v-model="form.spec"
          :options="specOptions"
          :label="$t('dateRanges.spec')"
          emit-value
          map-options
          dense
        />

        <div v-if="preview" class="q-mt-sm text-caption">
          <div>{{ $t('dateRanges.startDate') }}: {{ formatDate(preview.start) }}</div>
          <div>{{ $t('dateRanges.endDate') }}: {{ formatDate(preview.end) }}</div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn flat color="primary" :label="$t('common.save')" :disable="!form.label.trim() || !form.spec" @click="onSubmit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useDialogPluginComponent } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useDateRanges } from '@/composables/useDateRanges'
import type { DateRangeSpec } from '@/types/entities'

const props = defineProps<{
  title: string
  range?: DateRangeSpec
}>()

defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()
const { t } = useI18n()
const { resolve } = useDateRanges()

const specOptions = [
  { label: t('dateRanges.specOptions.M'), value: 'M' },
  { label: t('dateRanges.specOptions.M-1'), value: 'M-1' },
  { label: t('dateRanges.specOptions.Q'), value: 'Q' },
  { label: t('dateRanges.specOptions.Q-1'), value: 'Q-1' },
  { label: t('dateRanges.specOptions.Y'), value: 'Y' },
  { label: t('dateRanges.specOptions.Y-1'), value: 'Y-1' },
]

const form = reactive({
  label: props.range?.label ?? '',
  spec: props.range?.spec ?? 'M',
  isDefault: props.range?.isDefault ?? false,
})

const preview = computed(() => {
  if (!form.spec) return null
  return resolve(form.spec)
})

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function onSubmit() {
  onDialogOK({
    label: form.label.trim(),
    spec: form.spec,
    isDefault: form.isDefault,
  })
}
</script>
