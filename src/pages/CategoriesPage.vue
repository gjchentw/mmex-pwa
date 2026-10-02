<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { QTree } from 'quasar'
import { CATEGORY_ROOT_ID } from '../domain/rules/taxonomy'
import type { TaxonomyUsage } from '../domain/repos/taxonomy'
import { useCategoryStore, type CategoryNode } from '../stores/category-store'
import CategoryNameDialog from '../components/category/CategoryNameDialog.vue'
import CategoryPicker from '../components/taxonomy/CategoryPicker.vue'
import MergeDialog from '../components/taxonomy/MergeDialog.vue'
import TaxonomyDeleteDialog from '../components/taxonomy/TaxonomyDeleteDialog.vue'
import { describeTaxonomyError } from '../components/taxonomy/taxonomy-messages'

/**
 * Category manager (openspec: transaction-taxonomy, Category Manager Display;
 * Category Creation, Renaming and Moving; Category Visibility Actions; Category
 * Deletion from the Surface; Merge Screens). Desktop's Category Manager: the
 * tree, a search over full names, Show All, New/Edit/Delete/Merge, Hide and
 * Unhide, with a Move to… picker in place of drag-and-drop (operator decision
 * 17, 2026-10-02).
 */

const { t } = useI18n()
const store = useCategoryStore()

const treeRef = ref<InstanceType<typeof QTree> | null>(null)
const selectedId = ref<number | null>(null)
const actionError = ref('')

const selected = computed(() => (selectedId.value === null ? null : store.get(selectedId.value)))
const selectedHidden = computed(() => selected.value?.ACTIVE === 0)

const describe = (err: unknown): string =>
  describeTaxonomyError(err, t) ?? (err instanceof Error ? err.message : String(err))

/** The search matches the full name, so a leaf is found by any part of its path. */
const filterNode = (node: CategoryNode, filter: string): boolean =>
  node.fullName.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())

const onShowHidden = async (value: boolean) => {
  actionError.value = ''
  try {
    await store.setShowHidden(value)
  } catch (err) {
    actionError.value = describe(err)
  }
}

// --- New and Edit -----------------------------------------------------------

type NameMode = { kind: 'add'; parentId: number } | { kind: 'edit'; id: number; name: string }
const nameMode = ref<NameMode | null>(null)
const nameError = ref('')
const nameSaving = ref(false)

const openAdd = () => {
  nameError.value = ''
  nameMode.value = { kind: 'add', parentId: selectedId.value ?? CATEGORY_ROOT_ID }
}
const openEdit = () => {
  if (!selected.value) return
  nameError.value = ''
  nameMode.value = { kind: 'edit', id: selected.value.CATEGID, name: selected.value.CATEGNAME }
}
const nameTitle = computed(() =>
  nameMode.value?.kind === 'edit' ? t('category.editTitle') : t('category.addTitle'),
)
const namePrompt = computed(() => {
  const mode = nameMode.value
  if (!mode) return ''
  if (mode.kind === 'edit') return t('category.renamePrompt', { name: mode.name })
  const parent = mode.parentId === CATEGORY_ROOT_ID ? null : store.fullName(mode.parentId)
  return parent
    ? `${t('category.namePrompt')} ${t('category.underParent', { parent })}`
    : t('category.namePrompt')
})
const onNameSave = async (name: string) => {
  const mode = nameMode.value
  if (!mode) return
  nameSaving.value = true
  nameError.value = ''
  try {
    if (mode.kind === 'add') await store.add(name, mode.parentId)
    else await store.rename(mode.id, name)
    nameMode.value = null
  } catch (err) {
    nameError.value = describe(err)
  } finally {
    nameSaving.value = false
  }
}

// --- Move to… ---------------------------------------------------------------

const moveOpen = ref(false)
const moveTarget = ref<number | null>(null)
const openMove = () => {
  moveTarget.value = null
  moveOpen.value = true
}
const moveText = computed(() => {
  if (!selected.value || moveTarget.value === null) return ''
  const from =
    selected.value.PARENTID === CATEGORY_ROOT_ID
      ? t('category.topLevel')
      : store.fullName(selected.value.PARENTID)
  const to =
    moveTarget.value === CATEGORY_ROOT_ID
      ? t('category.topLevel')
      : store.fullName(moveTarget.value)
  return t('category.moveConfirm', { name: selected.value.CATEGNAME, from, to })
})
const confirmMove = async () => {
  if (!selected.value || moveTarget.value === null) return
  actionError.value = ''
  try {
    await store.move(selected.value.CATEGID, moveTarget.value)
    moveOpen.value = false
  } catch (err) {
    actionError.value = describe(err)
  }
}

// --- Hide, Unhide -------------------------------------------------------------

const setHidden = async (hidden: boolean) => {
  if (!selected.value) return
  actionError.value = ''
  try {
    await store.setHidden(selected.value.CATEGID, hidden)
  } catch (err) {
    actionError.value = describe(err)
  }
}
const unhideAll = async () => {
  actionError.value = ''
  try {
    await store.unhideAll()
  } catch (err) {
    actionError.value = describe(err)
  }
}

// --- Delete -------------------------------------------------------------------

const onDelete = async () => {
  if (!selected.value) return
  actionError.value = ''
  try {
    await store.requestDeletion(selected.value.CATEGID)
  } catch (err) {
    actionError.value = describe(err)
  }
}
const deleteLines = computed(() => {
  const pending = store.pendingDeletion
  if (!pending) return []
  const lines: string[] = []
  if (pending.subcategories.length > 0) {
    lines.push(t('category.deleteSubcategories', { names: pending.subcategories.join(', ') }))
  }
  lines.push(t('category.deleteBudget'), t('category.deleteDefaults'))
  return lines
})
const confirmDelete = async () => {
  try {
    await store.confirmDeletion()
    selectedId.value = null
  } catch (err) {
    actionError.value = describe(err)
  }
}

// --- Merge --------------------------------------------------------------------

const mergeOpen = ref(false)
const mergeOptions = computed(() =>
  store.categories.map((c) => ({
    id: c.CATEGID,
    label: store.fullName(c.CATEGID),
    hidden: c.ACTIVE === 0,
    used: (store.usageCounts.get(c.CATEGID) ?? 0) > 0,
    hasChildren: store.hasChildren(c.CATEGID),
  })),
)
const usageOf = (id: number): Promise<TaxonomyUsage> => store.usageOf(id)
const relocate = (from: number, to: number, options: { deleteSource: boolean }) =>
  store.relocate(from, to, options)

onMounted(() => store.load())
</script>

<template>
  <q-page class="q-pa-md" data-testid="categories-page">
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-h5">{{ $t('category.title') }}</div>
      <q-space />
      <q-btn
        flat
        dense
        icon="mdi-arrow-expand-vertical"
        :label="$t('category.expandAll')"
        data-testid="category-expand"
        @click="treeRef?.expandAll()"
      />
      <q-btn
        flat
        dense
        icon="mdi-arrow-collapse-vertical"
        :label="$t('category.collapseAll')"
        data-testid="category-collapse"
        @click="treeRef?.collapseAll()"
      />
      <q-btn
        flat
        dense
        icon="mdi-eye-outline"
        :label="$t('category.unhideAll')"
        data-testid="category-unhide-all"
        @click="unhideAll"
      />
      <q-btn
        flat
        dense
        icon="mdi-merge"
        :label="$t('category.merge')"
        data-testid="category-merge-open"
        @click="mergeOpen = true"
      />
      <q-btn
        color="primary"
        icon="mdi-plus"
        :label="$t('category.new')"
        data-testid="category-new"
        @click="openAdd"
      />
    </div>

    <q-banner
      v-if="actionError"
      class="bg-negative text-white q-mb-md"
      data-testid="category-action-error"
    >
      {{ actionError }}
      <template #action>
        <q-btn flat :label="$t('common.close')" @click="actionError = ''" />
      </template>
    </q-banner>

    <div class="row items-center q-gutter-md q-mb-md">
      <q-input
        v-model="store.search"
        dense
        outlined
        clearable
        :label="$t('category.search')"
        class="col-12 col-sm-5"
        data-testid="category-search"
      >
        <template #prepend><q-icon name="mdi-magnify" /></template>
      </q-input>
      <q-toggle
        :model-value="store.showHidden"
        :label="$t('category.showAll')"
        data-testid="category-show-hidden"
        @update:model-value="onShowHidden"
      >
        <q-tooltip>{{ $t('category.showAllHint') }}</q-tooltip>
      </q-toggle>
    </div>

    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-btn
        flat
        dense
        icon="mdi-pencil"
        :label="$t('category.edit')"
        :disable="!selected"
        data-testid="category-edit"
        @click="openEdit"
      />
      <q-btn
        flat
        dense
        icon="mdi-folder-move-outline"
        :label="$t('category.moveTo')"
        :disable="!selected"
        data-testid="category-move"
        @click="openMove"
      />
      <q-btn
        v-if="selectedHidden"
        flat
        dense
        icon="mdi-eye-outline"
        :label="$t('category.unhide')"
        :disable="!selected"
        data-testid="category-unhide"
        @click="setHidden(false)"
      />
      <q-btn
        v-else
        flat
        dense
        icon="mdi-eye-off-outline"
        :label="$t('category.hide')"
        :disable="!selected"
        data-testid="category-hide"
        @click="setHidden(true)"
      />
      <q-btn
        flat
        dense
        color="negative"
        icon="mdi-delete-outline"
        :label="$t('category.delete')"
        :disable="!selected"
        data-testid="category-delete"
        @click="onDelete"
      />
    </div>

    <div v-if="store.loading" class="q-pa-md"><q-spinner size="md" /></div>
    <div v-else-if="store.error" class="text-negative" data-testid="category-error">
      {{ store.error }}
    </div>
    <q-card v-else flat bordered>
      <q-tree
        ref="treeRef"
        v-model:selected="selectedId"
        :nodes="store.nodes"
        node-key="id"
        label-key="label"
        children-key="children"
        :filter="store.search"
        :filter-method="filterNode"
        default-expand-all
        no-selection-unset
        :no-nodes-label="$t('category.empty')"
        :no-results-label="$t('category.noResults')"
        data-testid="category-tree"
      >
        <template #default-header="prop">
          <span
            :data-testid="`category-node-${prop.node.id}`"
            :data-category-id="prop.node.id"
            :class="{ 'text-grey': prop.node.hidden }"
          >
            {{ prop.node.label }}
            <q-icon v-if="prop.node.hidden" name="mdi-eye-off-outline" class="q-ml-xs" />
          </span>
        </template>
      </q-tree>
    </q-card>

    <CategoryNameDialog
      :model-value="nameMode !== null"
      :title="nameTitle"
      :prompt="namePrompt"
      :initial-name="nameMode?.kind === 'edit' ? nameMode.name : ''"
      :error-message="nameError"
      :saving="nameSaving"
      @update:model-value="(open) => (open ? undefined : (nameMode = null))"
      @save="onNameSave"
      @cancel="nameMode = null"
    />

    <q-dialog v-model="moveOpen" persistent data-testid="category-move-dialog">
      <q-card style="width: 100%; max-width: 480px">
        <q-card-section>
          <div class="text-h6">{{ $t('category.moveTitle') }}</div>
        </q-card-section>
        <q-card-section>
          <CategoryPicker
            v-model="moveTarget"
            :categories="store.categories"
            :delimiter="store.delimiter"
            :exclude-subtree-of="selectedId"
            allow-top-level
          />
          <div v-if="moveText" class="q-mt-md" data-testid="category-move-text">{{ moveText }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="$t('common.cancel')" @click="moveOpen = false" />
          <q-btn
            color="primary"
            :label="$t('category.moveTo')"
            :disable="moveTarget === null"
            data-testid="category-move-confirm"
            @click="confirmMove"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <TaxonomyDeleteDialog
      :model-value="store.pendingDeletion !== null"
      kind="category"
      :title="$t('category.deleteTitle')"
      :names="store.pendingDeletion?.names ?? []"
      :lines="deleteLines"
      :purge="store.pendingDeletion?.purge ?? false"
      @update:model-value="(open) => (open ? undefined : store.cancelDeletion())"
      @confirm="confirmDelete"
      @cancel="store.cancelDeletion()"
    />

    <MergeDialog
      v-model="mergeOpen"
      kind="category"
      :options="mergeOptions"
      :usage-of="usageOf"
      :relocate="relocate"
    />
  </q-page>
</template>
