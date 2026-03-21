<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 q-mr-auto">{{ $t('menu.categories') }}</div>
      <q-btn flat round icon="mdi-plus" color="primary" :title="$t('categories.addRoot')" @click="addRoot" />
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

    <q-tree
      :nodes="filteredTree"
      node-key="id"
      label-key="label"
      children-key="children"
      default-expand-all
      no-connectors
    >
      <template #default-header="prop">
        <div class="row items-center full-width">
          <span :class="{ 'text-grey': !prop.node.active }">{{ prop.node.label }}</span>
          <q-space />
          <q-btn flat round dense size="sm" icon="mdi-plus" :title="$t('categories.addChild')" @click.stop="addChild(prop.node.id)" />
          <q-btn flat round dense size="sm" icon="mdi-pencil" :title="$t('categories.rename')" @click.stop="renameCategory(prop.node.id, prop.node.label)" />
          <q-btn
            flat round dense size="sm"
            :icon="prop.node.active ? 'mdi-eye-off' : 'mdi-eye'"
            :title="prop.node.active ? $t('categories.hide') : $t('categories.show')"
            @click.stop="toggleActive(prop.node.id)"
          />
          <q-btn flat round dense size="sm" icon="mdi-delete" color="negative" :title="$t('categories.delete')" @click.stop="deleteCategory(prop.node.id)" />
        </div>
      </template>
    </q-tree>

    <div v-if="!loading && filteredTree.length === 0" class="text-grey text-center q-mt-lg">
      {{ $t('common.noData') }}
    </div>

    <q-inner-loading :showing="loading" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useCategories } from '@/composables/useCategories'
import type { CategoryNode } from '@/types/entities'
import CategoryTreeDialog from '@/components/CategoryTreeDialog.vue'
import RelocateDialog from '@/components/RelocateDialog.vue'

const $q = useQuasar()
const { t } = useI18n()
const { tree, loading, refresh, create, rename, remove, toggleActive: toggleActiveFn, categories, getRelocationStats, relocate: relocateFn } = useCategories()

const search = ref('')

function filterNodes(nodes: CategoryNode[], query: string): CategoryNode[] {
  if (!query) return nodes
  const lower = query.toLowerCase()
  return nodes.reduce<CategoryNode[]>((acc, node) => {
    const childMatches = filterNodes(node.children, query)
    if (node.label.toLowerCase().includes(lower) || childMatches.length > 0) {
      acc.push({ ...node, children: childMatches })
    }
    return acc
  }, [])
}

const filteredTree = computed(() => filterNodes(tree.value, search.value))

async function addRoot() {
  $q.dialog({
    component: CategoryTreeDialog,
    componentProps: { title: t('categories.addRoot') },
  }).onOk(async (name: string) => {
    try {
      await create(name, -1)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function addChild(parentId: number) {
  $q.dialog({
    component: CategoryTreeDialog,
    componentProps: { title: t('categories.addChild') },
  }).onOk(async (name: string) => {
    try {
      await create(name, parentId)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function renameCategory(categId: number, currentName: string) {
  $q.dialog({
    component: CategoryTreeDialog,
    componentProps: { title: t('categories.rename'), initialName: currentName },
  }).onOk(async (newName: string) => {
    try {
      await rename(categId, newName)
    } catch (err: unknown) {
      $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

async function deleteCategory(categId: number) {
  try {
    await remove(categId)
    $q.notify({ type: 'positive', message: t('common.success') })
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

async function toggleActive(categId: number) {
  try {
    await toggleActiveFn(categId)
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : String(err) })
  }
}

onMounted(() => refresh())

function openMerge() {
  const options = categories.value.map((c) => ({ label: c.CATEGNAME, value: c.CATEGID }))
  $q.dialog({
    component: RelocateDialog,
    componentProps: {
      entityLabel: t('menu.categories'),
      options,
      getStats: async (id: number) => getRelocationStats(id),
      relocate: relocateFn,
    },
  }).onOk(() => refresh())
}
</script>
