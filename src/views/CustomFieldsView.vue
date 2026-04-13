<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 q-mr-auto">{{ $t('menu.customFields') }}</div>
      <q-btn flat round icon="mdi-plus" color="primary" :title="$t('common.add')" @click="addField" />
    </div>

    <q-table
      :rows="fields"
      :columns="columns"
      row-key="FIELDID"
      flat
      bordered
      :loading="loading"
      :no-data-label="$t('common.noData')"
    >
      <template #body-cell-type="slotProps">
        <q-td :props="slotProps">
          {{ $t(`customFields.types.${slotProps.row.TYPE}`) }}
        </q-td>
      </template>
      <template #body-cell-actions="slotProps">
        <q-td :props="slotProps">
          <q-btn flat round dense size="sm" icon="mdi-pencil" @click="editField(slotProps.row)" />
          <q-btn flat round dense size="sm" icon="mdi-delete" color="negative" @click="deleteField(slotProps.row.FIELDID)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useQuasar, type QTableColumn } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useCustomFields } from '@/composables/useCustomFields'
import type { CustomField } from '@/types/entities'
import CustomFieldDialog from '@/components/CustomFieldDialog.vue'

const $q = useQuasar()
const { t } = useI18n()
const { fields, loading, refresh, create, update, remove } = useCustomFields()

const columns = computed<QTableColumn[]>(() => [
  { name: 'description', label: t('customFields.description'), field: 'DESCRIPTION', align: 'left', sortable: true },
  { name: 'refType', label: t('customFields.refType'), field: 'REFTYPE', align: 'left', sortable: true },
  { name: 'type', label: t('customFields.type'), field: 'TYPE', align: 'left' },
  { name: 'actions', label: '', field: 'FIELDID', align: 'right' },
])

function addField() {
  $q.dialog({
    component: CustomFieldDialog,
    componentProps: { title: t('common.add') },
  }).onOk(async (data: Omit<CustomField, 'FIELDID'>) => {
    try {
      await create(data)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

function editField(field: CustomField) {
  $q.dialog({
    component: CustomFieldDialog,
    componentProps: { title: t('common.edit'), field },
  }).onOk(async (data: Partial<CustomField>) => {
    try {
      await update({ FIELDID: field.FIELDID, ...data })
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function deleteField(fieldId: number) {
  $q.dialog({
    title: t('common.confirm'),
    message: t('customFields.cascadeDeleteWarning'),
    cancel: true,
  }).onOk(async () => {
    try {
      await remove(fieldId)
      $q.notify({ type: 'positive', message: t('common.success') })
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

onMounted(() => refresh())
</script>
