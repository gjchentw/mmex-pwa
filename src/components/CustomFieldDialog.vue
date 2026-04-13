<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input v-model="form.DESCRIPTION" :label="$t('customFields.description')" dense autofocus />

        <q-select
          v-model="form.REFTYPE"
          :options="refTypeOptions"
          :label="$t('customFields.refType')"
          dense
        />

        <q-select
          v-model="form.TYPE"
          :options="typeOptions"
          :label="$t('customFields.type')"
          emit-value
          map-options
          dense
        />

        <q-input v-model="props_.regex" :label="$t('customFields.regex')" dense />
        <q-input v-model="props_.tooltip" :label="$t('customFields.tooltip')" dense />
        <q-input v-model="props_.defaultValue" :label="$t('customFields.defaultValue')" dense />
        <q-toggle v-model="props_.autocomplete" :label="$t('customFields.autocomplete')" />

        <q-input
          v-if="form.TYPE === 'SingleChoice' || form.TYPE === 'MultiChoice'"
          v-model="choicesText"
          :label="$t('customFields.choices')"
          dense
          type="textarea"
          autogrow
          :hint="$t('customFields.oneOptionPerLine')"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn flat color="primary" :label="$t('common.save')" :disable="!form.DESCRIPTION.trim()" @click="onSubmit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useDialogPluginComponent } from 'quasar'
import { useI18n } from 'vue-i18n'
import type { CustomField, CustomFieldType, CustomFieldProperties } from '@/types/entities'

const props = defineProps<{
  title: string
  field?: CustomField
}>()

defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()
const { t } = useI18n()

const refTypeOptions = ['Transaction', 'Stock', 'Asset', 'BankAccount', 'RepeatingTransaction', 'Payee']

const typeOptions: Array<{ label: string; value: CustomFieldType }> = [
  { label: t('customFields.types.String'), value: 'String' },
  { label: t('customFields.types.Integer'), value: 'Integer' },
  { label: t('customFields.types.Decimal'), value: 'Decimal' },
  { label: t('customFields.types.Boolean'), value: 'Boolean' },
  { label: t('customFields.types.Date'), value: 'Date' },
  { label: t('customFields.types.Time'), value: 'Time' },
  { label: t('customFields.types.SingleChoice'), value: 'SingleChoice' },
  { label: t('customFields.types.MultiChoice'), value: 'MultiChoice' },
]

const existingProps = (() => {
  try {
    return props.field ? (JSON.parse(props.field.PROPERTIES) as CustomFieldProperties) : {}
  } catch {
    return {}
  }
})()

const form = reactive({
  DESCRIPTION: props.field?.DESCRIPTION ?? '',
  REFTYPE: props.field?.REFTYPE ?? 'Transaction',
  TYPE: (props.field?.TYPE ?? 'String') as CustomFieldType,
})

const props_ = reactive({
  regex: existingProps.regex ?? '',
  tooltip: existingProps.tooltip ?? '',
  autocomplete: existingProps.autocomplete ?? false,
  defaultValue: existingProps.default ?? '',
})

const choicesText = ref(existingProps.choices?.join('\n') ?? '')

const buildProperties = computed(() => {
  const p: CustomFieldProperties = {}
  if (props_.regex) p.regex = props_.regex
  if (props_.tooltip) p.tooltip = props_.tooltip
  if (props_.autocomplete) p.autocomplete = true
  if (props_.defaultValue) p.default = props_.defaultValue
  if (form.TYPE === 'SingleChoice' || form.TYPE === 'MultiChoice') {
    p.choices = choicesText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  }
  return JSON.stringify(p)
})

function onSubmit() {
  onDialogOK({
    DESCRIPTION: form.DESCRIPTION,
    REFTYPE: form.REFTYPE,
    TYPE: form.TYPE,
    PROPERTIES: buildProperties.value,
  })
}
</script>
