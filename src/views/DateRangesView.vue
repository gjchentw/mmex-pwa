<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 q-mr-auto">{{ $t('menu.dateRanges') }}</div>
      <q-btn flat round icon="mdi-plus" color="primary" :title="$t('common.add')" @click="addRange" />
    </div>

    <q-table
      :rows="ranges"
      :columns="columns"
      row-key="sortOrder"
      flat
      bordered
      :loading="loading"
      :no-data-label="$t('common.noData')"
    >
      <template #body-cell-resolved="slotProps">
        <q-td :props="slotProps">
          {{ formatResolved(slotProps.row.spec) }}
        </q-td>
      </template>
      <template #body-cell-isDefault="slotProps">
        <q-td :props="slotProps">
          <q-icon v-if="slotProps.row.isDefault" name="mdi-star" color="warning" />
        </q-td>
      </template>
      <template #body-cell-actions="slotProps">
        <q-td :props="slotProps">
          <q-btn flat round dense size="sm" icon="mdi-pencil" @click="editRange(slotProps.rowIndex)" />
          <q-btn flat round dense size="sm" icon="mdi-star-outline" :title="$t('dateRanges.setDefault')" @click="makeDefault(slotProps.rowIndex)" />
          <q-btn flat round dense size="sm" icon="mdi-arrow-up" :disable="slotProps.rowIndex === 0" @click="moveUp(slotProps.rowIndex)" />
          <q-btn flat round dense size="sm" icon="mdi-arrow-down" :disable="slotProps.rowIndex === ranges.length - 1" @click="moveDown(slotProps.rowIndex)" />
          <q-btn flat round dense size="sm" icon="mdi-delete" color="negative" @click="deleteRange(slotProps.rowIndex)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useQuasar, type QTableColumn } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useDateRanges } from '@/composables/useDateRanges'
import type { DateRangeSpec } from '@/types/entities'
import DateRangeDialog from '@/components/DateRangeDialog.vue'

const $q = useQuasar()
const { t } = useI18n()
const { ranges, loading, refresh, create, update, remove, reorder, setDefault, resolve } = useDateRanges()

const columns: QTableColumn[] = [
  { name: 'label', label: t('dateRanges.label'), field: 'label', align: 'left', sortable: true },
  { name: 'spec', label: t('dateRanges.spec'), field: 'spec', align: 'left' },
  { name: 'resolved', label: t('dateRanges.startDate') + ' / ' + t('dateRanges.endDate'), field: 'spec', align: 'left' },
  { name: 'isDefault', label: '', field: 'isDefault', align: 'center' },
  { name: 'actions', label: '', field: 'sortOrder', align: 'right' },
]

function formatResolved(spec: string): string {
  const r = resolve(spec)
  return `${r.start.toISOString().slice(0, 10)} ~ ${r.end.toISOString().slice(0, 10)}`
}

function addRange() {
  $q.dialog({
    component: DateRangeDialog,
    componentProps: { title: t('common.add') },
  }).onOk(async (data: Omit<DateRangeSpec, 'sortOrder'>) => {
    try {
      await create(data)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

function editRange(index: number) {
  $q.dialog({
    component: DateRangeDialog,
    componentProps: { title: t('common.edit'), range: ranges.value[index] },
  }).onOk(async (data: Partial<DateRangeSpec>) => {
    try {
      await update(index, data)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function deleteRange(index: number) {
  try {
    await remove(index)
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

async function makeDefault(index: number) {
  await setDefault(index)
}

async function moveUp(index: number) {
  if (index > 0) await reorder(index, index - 1)
}

async function moveDown(index: number) {
  if (index < ranges.value.length - 1) await reorder(index, index + 1)
}

onMounted(() => refresh())
</script>
