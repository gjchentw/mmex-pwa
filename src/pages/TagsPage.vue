<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaxonomyUsage } from '../domain/repos/taxonomy'
import { useTagStore } from '../stores/tag-store'
import TagNameDialog from '../components/tag/TagNameDialog.vue'
import MergeDialog from '../components/taxonomy/MergeDialog.vue'
import TaxonomyDeleteDialog from '../components/taxonomy/TaxonomyDeleteDialog.vue'
import { describeTaxonomyError } from '../components/taxonomy/taxonomy-messages'

/**
 * Tag manager (openspec: transaction-taxonomy, Tag Manager Display, Tag
 * Creation and Renaming, Tag Deletion from the Surface, Merge Screens).
 * Desktop's Tag Manager: a check list with search, Add, Edit, Delete, and the
 * merge dialog; tags are never hidden, so there is no hide action.
 */

const { t } = useI18n()
const store = useTagStore()

const actionError = ref('')
const describe = (err: unknown, name?: string): string =>
  describeTaxonomyError(err, t, { name }) ?? (err instanceof Error ? err.message : String(err))

const hasSelection = computed(() => store.selectedIds.length > 0)
const singleSelection = computed(() => store.selectedIds.length === 1)
const selectedOne = computed(() =>
  singleSelection.value ? store.get(store.selectedIds[0]!) : null,
)

const isSelected = (id: number) => store.selectedIds.includes(id)
const setSelected = (id: number, value: boolean) => {
  store.selectedIds = value
    ? [...store.selectedIds.filter((other) => other !== id), id]
    : store.selectedIds.filter((other) => other !== id)
}

const run = async (action: () => Promise<unknown>) => {
  actionError.value = ''
  try {
    await action()
  } catch (err) {
    actionError.value = describe(err, selectedOne.value?.TAGNAME)
  }
}

// --- Add and Edit -------------------------------------------------------------

type NameMode = { kind: 'add' } | { kind: 'edit'; id: number; name: string }
const nameMode = ref<NameMode | null>(null)
const nameError = ref('')
const nameSaving = ref(false)
const openAdd = () => {
  nameError.value = ''
  nameMode.value = { kind: 'add' }
}
const openEdit = () => {
  if (!selectedOne.value) return
  nameError.value = ''
  nameMode.value = { kind: 'edit', id: selectedOne.value.TAGID, name: selectedOne.value.TAGNAME }
}
const nameTitle = computed(() =>
  nameMode.value?.kind === 'edit' ? t('tag.editTitle') : t('tag.addTitle'),
)
const namePrompt = computed(() =>
  nameMode.value?.kind === 'edit'
    ? t('tag.renamePrompt', { name: nameMode.value.name })
    : t('tag.namePrompt'),
)
const onNameSave = async (name: string) => {
  const mode = nameMode.value
  if (!mode) return
  nameSaving.value = true
  nameError.value = ''
  try {
    if (mode.kind === 'add') await store.add(name)
    else await store.rename(mode.id, name)
    nameMode.value = null
  } catch (err) {
    nameError.value = describe(err)
  } finally {
    nameSaving.value = false
  }
}

// --- Delete -------------------------------------------------------------------

const onDelete = () =>
  run(async () => {
    store.keptNames = []
    await store.requestDeletion(store.selectedIds)
  })
const confirmDelete = () =>
  run(async () => {
    await store.confirmDeletion()
  })

// --- Merge --------------------------------------------------------------------

const mergeOpen = ref(false)
const mergeOptions = computed(() =>
  store.tags.map((tag) => ({
    id: tag.TAGID,
    label: tag.TAGNAME,
    hidden: false,
    used: (store.usageCounts.get(tag.TAGID) ?? 0) > 0,
  })),
)
const mergeSource = computed(() => (singleSelection.value ? store.selectedIds[0]! : null))
const usageOf = (id: number): Promise<TaxonomyUsage> => store.usageOf(id)
const relocate = (from: number, to: number, options: { deleteSource: boolean }) =>
  store.relocate(from, to, options)

onMounted(() => store.load())
</script>

<template>
  <q-page class="q-pa-md" data-testid="tags-page">
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-h5">{{ $t('tag.title') }}</div>
      <q-space />
      <q-btn
        color="primary"
        icon="mdi-plus"
        :label="$t('tag.add')"
        data-testid="tag-add"
        @click="openAdd"
      />
    </div>

    <q-banner
      v-if="actionError"
      class="bg-negative text-white q-mb-md"
      data-testid="tag-action-error"
    >
      {{ actionError }}
      <template #action>
        <q-btn flat :label="$t('common.close')" @click="actionError = ''" />
      </template>
    </q-banner>
    <q-banner
      v-if="store.keptNames.length > 0"
      class="bg-warning text-dark q-mb-md"
      data-testid="tag-kept"
    >
      {{ $t('tag.kept', { names: store.keptNames.join(', ') }) }}
      <template #action>
        <q-btn flat :label="$t('common.close')" @click="store.keptNames = []" />
      </template>
    </q-banner>

    <div class="row items-center q-gutter-md q-mb-md">
      <q-input
        v-model="store.search"
        dense
        outlined
        clearable
        :label="$t('tag.search')"
        class="col-12 col-sm-5"
        data-testid="tag-search"
      >
        <template #prepend><q-icon name="mdi-magnify" /></template>
      </q-input>
    </div>

    <div class="row items-center q-gutter-sm q-mb-sm">
      <span class="text-caption" data-testid="tag-selected">
        {{ $t('tag.selected', { count: store.selectedIds.length }) }}
      </span>
      <q-btn
        flat
        dense
        icon="mdi-pencil"
        :disable="!singleSelection"
        :label="$t('tag.edit')"
        data-testid="tag-edit"
        @click="openEdit"
      />
      <q-btn
        flat
        dense
        icon="mdi-merge"
        :disable="!singleSelection"
        :label="$t('tag.merge')"
        data-testid="tag-merge"
        @click="mergeOpen = true"
      />
      <q-btn
        flat
        dense
        color="negative"
        icon="mdi-delete-outline"
        :disable="!hasSelection"
        :label="$t('tag.delete')"
        data-testid="tag-delete"
        @click="onDelete"
      />
    </div>

    <div v-if="store.loading" class="q-pa-md"><q-spinner size="md" /></div>
    <div v-else-if="store.error" class="text-negative" data-testid="tag-error">
      {{ store.error }}
    </div>
    <q-list v-else bordered separator data-testid="tag-list">
      <q-item v-for="row in store.rows" :key="row.id" :data-tag-id="row.id">
        <q-item-section side>
          <q-checkbox
            :model-value="isSelected(row.id)"
            dense
            data-testid="tag-select"
            @update:model-value="(value) => setSelected(row.id, value)"
          />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ row.name }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge outline :label="row.used" data-testid="tag-used">
            <q-tooltip>{{ $t('tag.used') }}</q-tooltip>
          </q-badge>
        </q-item-section>
      </q-item>
      <q-item v-if="store.rows.length === 0" data-testid="tag-empty">
        <q-item-section class="text-grey">
          {{ store.search ? $t('tag.noResults') : $t('tag.empty') }}
        </q-item-section>
      </q-item>
    </q-list>

    <TagNameDialog
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

    <TaxonomyDeleteDialog
      :model-value="store.pendingDeletion !== null"
      kind="tag"
      :title="$t('tag.deleteTitle')"
      :names="store.pendingDeletion?.names ?? []"
      :purge="store.pendingDeletion?.purge ?? false"
      :purge-name="store.pendingDeletion?.purgeName ?? ''"
      @update:model-value="(open) => (open ? undefined : store.cancelDeletion())"
      @confirm="confirmDelete"
      @cancel="store.cancelDeletion()"
    />

    <MergeDialog
      v-model="mergeOpen"
      kind="tag"
      :options="mergeOptions"
      :initial-source="mergeSource"
      :usage-of="usageOf"
      :relocate="relocate"
    />
  </q-page>
</template>
