<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 q-mr-auto">{{ $t('menu.tags') }}</div>
      <q-btn flat round icon="mdi-plus" color="primary" :title="$t('common.add')" @click="addTag" />
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
      :rows="filteredTags"
      :columns="columns"
      row-key="TAGID"
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
          <q-btn flat round dense size="sm" icon="mdi-pencil" @click="renameTag(props.row.TAGID, props.row.TAGNAME)" />
          <q-btn
            flat round dense size="sm"
            :icon="props.row.ACTIVE === 1 ? 'mdi-eye-off' : 'mdi-eye'"
            @click="toggleActive(props.row.TAGID)"
          />
          <q-btn flat round dense size="sm" icon="mdi-delete" color="negative" @click="deleteTag(props.row.TAGID)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar, type QTableColumn } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useTags } from '@/composables/useTags'
import TagDialog from '@/components/TagDialog.vue'
import RelocateDialog from '@/components/RelocateDialog.vue'

const $q = useQuasar()
const { t } = useI18n()
const { tags, loading, refresh, create, rename, remove, toggleActive: toggleActiveFn, relocate: relocateFn, getRelocationStats } = useTags()

const search = ref('')
const showFilter = ref('all')

const columns: QTableColumn[] = [
  { name: 'name', label: t('tags.name'), field: 'TAGNAME', align: 'left', sortable: true },
  { name: 'active', label: t('common.active'), field: 'ACTIVE', align: 'center' },
  { name: 'actions', label: '', field: 'TAGID', align: 'right' },
]

const filteredTags = computed(() => {
  let list = tags.value
  if (showFilter.value === 'active') list = list.filter((t) => t.ACTIVE === 1)
  else if (showFilter.value === 'hidden') list = list.filter((t) => t.ACTIVE === 0)
  if (!search.value) return list
  const lower = search.value.toLowerCase()
  return list.filter((t) => t.TAGNAME.toLowerCase().includes(lower))
})

function addTag() {
  $q.dialog({
    component: TagDialog,
    componentProps: { title: t('common.add') },
  }).onOk(async (name: string) => {
    try {
      await create(name)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

function renameTag(tagId: number, currentName: string) {
  $q.dialog({
    component: TagDialog,
    componentProps: { title: t('tags.rename'), initialName: currentName },
  }).onOk(async (newName: string) => {
    try {
      await rename(tagId, newName)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function deleteTag(tagId: number) {
  try {
    await remove(tagId)
    $q.notify({ type: 'positive', message: t('common.success') })
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

async function toggleActive(tagId: number) {
  try {
    await toggleActiveFn(tagId)
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

onMounted(() => refresh())

function openMerge() {
  const options = tags.value.map((t) => ({ label: t.TAGNAME, value: t.TAGID }))
  $q.dialog({
    component: RelocateDialog,
    componentProps: {
      entityLabel: t('menu.tags'),
      options,
      getStats: async (id: number) => getRelocationStats(id),
      relocate: relocateFn,
    },
  }).onOk(() => refresh())
}
</script>
