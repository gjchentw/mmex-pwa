import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../domain/db'
import type { CategoryRecord } from '../domain/records'
import { fileFacts, settingRepo } from '../domain/repos/metadata'
import {
  TaxonomyInUseError,
  categoryRepo,
  type MergeResult,
  type RelocateOptions,
  type RemoveManyResult,
  type RemoveOptions,
  type TaxonomyUsage,
} from '../domain/repos/taxonomy'
import { SETTING_KEY, encodeSettingBoolean } from '../domain/rules/metadata'
import {
  CATEGORY_ROOT_ID,
  categoryFullName,
  categorySubtree,
  childrenOf,
  isHidden,
} from '../domain/rules/taxonomy'

/**
 * State behind the category manager (openspec: transaction-taxonomy, Category
 * Manager Display and the category requirements). Writes go through the
 * repository's builders and are followed by a reload, as the other surfaces do.
 */

export interface CategoryNode {
  id: number
  label: string
  fullName: string
  hidden: boolean
  children: CategoryNode[]
}

/** What the deletion confirmation shows; set by `requestDeletion`, cleared on confirm or cancel. */
export interface PendingDeletion {
  id: number
  names: string[]
  subcategories: string[]
  purge: boolean
}

export const useCategoryStore = defineStore('category', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const categories = ref<CategoryRecord[]>([])
  const usageCounts = ref(new Map<number, number>())
  const showHidden = ref(true)
  const delimiter = ref(':')
  const search = ref('')
  const pendingDeletion = ref<PendingDeletion | null>(null)

  const byName = (a: CategoryRecord, b: CategoryRecord) => a.CATEGNAME.localeCompare(b.CATEGNAME)

  const get = (id: number) => categories.value.find((c) => c.CATEGID === id) ?? null
  const fullName = (id: number) => categoryFullName(id, categories.value, delimiter.value)
  const hasChildren = (id: number) => childrenOf(categories.value, id).length > 0
  const subtreeNames = (id: number) =>
    categorySubtree(categories.value, id)
      .map((c) => c.CATEGNAME)
      .sort((a, b) => a.localeCompare(b))

  /** Hidden nodes are part of the tree only while the toggle is on (design D3). */
  const buildNodes = (parentId: number): CategoryNode[] =>
    childrenOf(categories.value, parentId)
      .filter((c) => showHidden.value || !isHidden(c))
      .sort(byName)
      .map((c) => ({
        id: c.CATEGID,
        label: c.CATEGNAME,
        fullName: fullName(c.CATEGID),
        hidden: isHidden(c),
        children: buildNodes(c.CATEGID),
      }))
  const nodes = computed(() => buildNodes(CATEGORY_ROOT_ID))

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [rows, counts, hidden, delim] = await Promise.all([
        categoryRepo.all(),
        categoryRepo.usageCounts(),
        fileFacts.showHiddenCategories(),
        fileFacts.categoryDelimiter(),
      ])
      categories.value = rows
      usageCounts.value = counts
      showHidden.value = hidden
      delimiter.value = delim
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** Desktop's TRUE/FALSE words, which Model_Setting::getBool reads back (design D4). */
  async function setShowHidden(value: boolean) {
    showHidden.value = value
    await settingRepo.set(SETTING_KEY.showHiddenCategories, encodeSettingBoolean(value))
  }

  async function add(name: string, parentId: number = CATEGORY_ROOT_ID) {
    await db.mutate([await categoryRepo.addStatement(name, parentId)])
    await load()
  }

  async function rename(id: number, name: string) {
    await db.mutate([await categoryRepo.renameStatement(id, name)])
    await load()
  }

  async function move(id: number, parentId: number) {
    await db.mutate([await categoryRepo.reparentStatement(id, parentId)])
    await load()
  }

  async function setHidden(id: number, hidden: boolean) {
    await db.mutate(await categoryRepo.setHiddenStatements(id, hidden))
    await load()
  }

  /** Every root of a hidden subtree is unhidden with its subtree, in one batch. */
  async function unhideAll() {
    const hidden = categories.value.filter(isHidden)
    const roots = hidden.filter((c) => !hidden.some((h) => h.CATEGID === c.PARENTID))
    const statements = []
    for (const root of roots) {
      statements.push(...(await categoryRepo.setHiddenStatements(root.CATEGID, false)))
    }
    if (statements.length > 0) await db.mutate(statements)
    await load()
  }

  const usageOf = (id: number): Promise<TaxonomyUsage> => categoryRepo.usage(id)

  /**
   * Refuses a used category (the caller shows the reason) or prepares the
   * confirmation, which always runs and carries the purge sentence when only
   * trashed transactions reference the subtree (operator decisions 2 and 3).
   */
  async function requestDeletion(id: number) {
    const usage = await categoryRepo.usage(id)
    if (usage.state === 'used') throw new TaxonomyInUseError('category', usage)
    pendingDeletion.value = {
      id,
      names: [get(id)?.CATEGNAME ?? String(id)],
      subcategories: subtreeNames(id),
      purge: usage.state === 'onlyTrashed',
    }
  }

  async function confirmDeletion() {
    const pending = pendingDeletion.value
    if (!pending) return
    try {
      await categoryRepo.remove(pending.id, { purgeTrashed: pending.purge })
    } finally {
      pendingDeletion.value = null
    }
    await load()
  }

  function cancelDeletion() {
    pendingDeletion.value = null
  }

  async function remove(id: number, options: RemoveOptions = {}) {
    await categoryRepo.remove(id, options)
    await load()
  }

  async function removeMany(ids: readonly number[], options: RemoveOptions = {}) {
    const result: RemoveManyResult = await categoryRepo.removeMany(ids, options)
    await load()
    return result
  }

  async function relocate(from: number, to: number, options: RelocateOptions = {}) {
    const result: MergeResult = await categoryRepo.relocate(from, to, options)
    await load()
    return result
  }

  return {
    loading,
    error,
    categories,
    usageCounts,
    showHidden,
    delimiter,
    search,
    pendingDeletion,
    nodes,
    get,
    fullName,
    hasChildren,
    subtreeNames,
    load,
    setShowHidden,
    add,
    rename,
    move,
    setHidden,
    unhideAll,
    usageOf,
    requestDeletion,
    confirmDeletion,
    cancelDeletion,
    remove,
    removeMany,
    relocate,
  }
})
