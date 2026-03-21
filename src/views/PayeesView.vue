<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 q-mr-auto">{{ $t('menu.payees') }}</div>
      <q-btn flat round icon="mdi-plus" color="primary" :title="$t('common.add')" @click="addPayee" />
      <q-btn flat round icon="mdi-call-merge" color="accent" :title="$t('relocation.mergeTitle')" @click="openMerge" />
    </div>

    <q-input
      v-model="search"
      dense
      outlined
      :placeholder="$t('common.search')"
      class="q-mb-md"
      clearable
    >
      <template #prepend>
        <q-icon name="mdi-magnify" />
      </template>
    </q-input>

    <q-btn-toggle
      v-model="showFilter"
      toggle-color="primary"
      :options="[
        { label: $t('common.filter'), value: 'all' },
        { label: $t('common.active'), value: 'active' },
        { label: $t('common.hidden'), value: 'hidden' },
      ]"
      class="q-mb-md"
      dense
      no-caps
    />

    <q-table
      :rows="filteredPayees"
      :columns="columns"
      row-key="PAYEEID"
      flat
      bordered
      :loading="loading"
      :no-data-label="$t('common.noData')"
    >
      <template #body-cell-active="props">
        <q-td :props="props">
          <q-icon :name="props.row.ACTIVE === 1 ? 'mdi-check-circle' : 'mdi-minus-circle'" :color="props.row.ACTIVE === 1 ? 'positive' : 'grey'" />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat round dense size="sm" icon="mdi-pencil" @click="editPayee(props.row)" />
          <q-btn
            flat round dense size="sm"
            :icon="props.row.ACTIVE === 1 ? 'mdi-eye-off' : 'mdi-eye'"
            @click="toggleActive(props.row.PAYEEID)"
          />
          <q-btn flat round dense size="sm" icon="mdi-delete" color="negative" @click="deletePayee(props.row.PAYEEID)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar, type QTableColumn } from 'quasar'
import { useI18n } from 'vue-i18n'
import { usePayees } from '@/composables/usePayees'
import type { Payee } from '@/types/entities'
import PayeeDialog from '@/components/PayeeDialog.vue'
import RelocateDialog from '@/components/RelocateDialog.vue'

const $q = useQuasar()
const { t } = useI18n()
const { payees, loading, refresh, create, update, remove, toggleActive: toggleActiveFn, getRelocationStats, relocate: relocateFn } = usePayees()

const search = ref('')
const showFilter = ref('all')

const columns: QTableColumn[] = [
  { name: 'name', label: t('payees.name'), field: 'PAYEENAME', align: 'left', sortable: true },
  { name: 'category', label: t('payees.defaultCategory'), field: 'CATEGID', align: 'left' },
  { name: 'active', label: t('common.active'), field: 'ACTIVE', align: 'center' },
  { name: 'actions', label: '', field: 'PAYEEID', align: 'right' },
]

const filteredPayees = computed(() => {
  let list = payees.value
  if (showFilter.value === 'active') list = list.filter((p) => p.ACTIVE === 1)
  else if (showFilter.value === 'hidden') list = list.filter((p) => p.ACTIVE === 0)
  if (!search.value) return list
  const lower = search.value.toLowerCase()
  return list.filter((p) => p.PAYEENAME.toLowerCase().includes(lower))
})

function addPayee() {
  $q.dialog({
    component: PayeeDialog,
    componentProps: { title: t('common.add') },
  }).onOk(async (form: Partial<Payee>) => {
    try {
      const id = await create(form.PAYEENAME ?? '')
      if (form.CATEGID || form.NUMBER || form.WEBSITE || form.NOTES || form.PATTERN) {
        await update({ PAYEEID: id, ...form })
      }
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

function editPayee(payee: Payee) {
  $q.dialog({
    component: PayeeDialog,
    componentProps: { title: t('common.edit'), payee },
  }).onOk(async (form: Partial<Payee>) => {
    try {
      await update({ PAYEEID: payee.PAYEEID, ...form })
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function deletePayee(payeeId: number) {
  try {
    await remove(payeeId)
    $q.notify({ type: 'positive', message: t('common.success') })
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

async function toggleActive(payeeId: number) {
  try {
    await toggleActiveFn(payeeId)
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

onMounted(() => refresh())

function openMerge() {
  const options = payees.value.map((p) => ({ label: p.PAYEENAME, value: p.PAYEEID }))
  $q.dialog({
    component: RelocateDialog,
    componentProps: {
      entityLabel: t('menu.payees'),
      options,
      getStats: async (id: number) => getRelocationStats(id),
      relocate: relocateFn,
    },
  }).onOk(() => refresh())
}
</script>
