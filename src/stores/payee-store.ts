import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../domain/db'
import type { CategoryRecord, PayeeRecord } from '../domain/records'
import { fileFacts, settingRepo } from '../domain/repos/metadata'
import {
  TaxonomyInUseError,
  categoryRepo,
  payeeRepo,
  type MergeResult,
  type PayeeDraft,
  type RelocateOptions,
  type RemoveManyResult,
  type TaxonomyUsage,
} from '../domain/repos/taxonomy'
import { SETTING_KEY, encodeSettingBoolean } from '../domain/rules/metadata'
import {
  categoryFullName,
  isHidden,
  parsePayeePatterns,
  payeeDefaultCategory,
  type DefaultCategoryMode,
} from '../domain/rules/taxonomy'

/**
 * State behind the payee manager (openspec: transaction-taxonomy, Payee Manager
 * Display, Payee Editing, Payee Selection Actions, Payee Deletion from the
 * Surface). The selection lives here so the toolbar and the dialogs share it.
 */

export interface PayeeRow {
  id: number
  name: string
  hidden: boolean
  categoryId: number | null
  categoryName: string
  reference: string
  website: string
  notes: string
  patterns: string[]
  patternText: string
  used: number
}

export interface KeptPayee {
  id: number
  name: string
  usage: TaxonomyUsage
}

/** What the deletion confirmation shows; the used payees are kept aside, as desktop keeps them. */
export interface PendingPayeeDeletion {
  ids: number[]
  names: string[]
  purge: boolean
  kept: KeptPayee[]
}

export const usePayeeStore = defineStore('payee', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const payees = ref<PayeeRecord[]>([])
  const categories = ref<CategoryRecord[]>([])
  const usageCounts = ref(new Map<number, number>())
  const showHidden = ref(true)
  const mode = ref<DefaultCategoryMode>('lastUsed')
  const delimiter = ref(':')
  const search = ref('')
  const selectedIds = ref<number[]>([])
  const pendingDeletion = ref<PendingPayeeDeletion | null>(null)
  /** Names reported after a deletion for the payees that were kept because in use. */
  const keptNames = ref<string[]>([])

  const get = (id: number) => payees.value.find((p) => p.PAYEEID === id) ?? null

  const categoryName = (categoryId: number | null) =>
    categoryId === null ? '' : categoryFullName(categoryId, categories.value, delimiter.value)

  const rows = computed<PayeeRow[]>(() => {
    const term = search.value.trim().toLocaleLowerCase()
    return payees.value
      .filter((p) => showHidden.value || !isHidden(p))
      .filter((p) => term === '' || p.PAYEENAME.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.PAYEENAME.localeCompare(b.PAYEENAME))
      .map((p) => {
        const patterns = parsePayeePatterns(p)
        const categoryId = payeeDefaultCategory(p)
        return {
          id: p.PAYEEID,
          name: p.PAYEENAME,
          hidden: isHidden(p),
          categoryId,
          categoryName: categoryName(categoryId),
          reference: p.NUMBER ?? '',
          website: p.WEBSITE ?? '',
          notes: p.NOTES ?? '',
          patterns,
          patternText: patterns.join(' '),
          used: usageCounts.value.get(p.PAYEEID) ?? 0,
        }
      })
  })

  /** Desktop titles the column by the default-category mode (payeedialog.cpp). */
  const categoryColumnTitleKey = computed(() =>
    mode.value === 'lastUsed' ? 'payee.columns.lastUsedCategory' : 'payee.columns.defaultCategory',
  )

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [rowsRead, counts, cats, hidden, defaultMode, delim] = await Promise.all([
        payeeRepo.all(),
        payeeRepo.usageCounts(),
        categoryRepo.all(),
        fileFacts.showHiddenPayees(),
        fileFacts.defaultCategoryMode(),
        fileFacts.categoryDelimiter(),
      ])
      payees.value = rowsRead
      usageCounts.value = counts
      categories.value = cats
      showHidden.value = hidden
      mode.value = defaultMode
      delimiter.value = delim
      selectedIds.value = selectedIds.value.filter((id) => rowsRead.some((p) => p.PAYEEID === id))
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** Desktop's TRUE/FALSE words, which Model_Setting::getBool reads back (design D4). */
  async function setShowHidden(value: boolean) {
    showHidden.value = value
    await settingRepo.set(SETTING_KEY.showHiddenPayees, encodeSettingBoolean(value))
  }

  async function add(draft: PayeeDraft) {
    await db.mutate([await payeeRepo.addStatement(draft)])
    await load()
  }

  async function save(id: number, draft: Partial<PayeeDraft>) {
    await db.mutate([await payeeRepo.updateStatement(id, draft)])
    await load()
  }

  /** The selection actions clear the selection they acted on, so the next gesture starts from none. */
  async function setHidden(ids: readonly number[], hidden: boolean) {
    await db.mutate(payeeRepo.setHiddenStatements(ids, hidden))
    selectedIds.value = []
    await load()
  }

  async function setDefaultCategory(ids: readonly number[], categoryId: number | null) {
    await db.mutate(payeeRepo.setDefaultCategoryStatements(ids, categoryId))
    selectedIds.value = []
    await load()
  }

  const usageOf = (id: number): Promise<TaxonomyUsage> => payeeRepo.usage(id)

  /**
   * Keeps the used payees aside and prepares the confirmation for the rest; when
   * nothing is deletable the first refusal is raised for the caller to show.
   */
  async function requestDeletion(ids: readonly number[]) {
    const usages = await Promise.all(ids.map((id) => payeeRepo.usage(id)))
    const kept: KeptPayee[] = []
    const deletable: number[] = []
    ids.forEach((id, index) => {
      const usage = usages[index]!
      if (usage.state === 'used') kept.push({ id, name: get(id)?.PAYEENAME ?? String(id), usage })
      else deletable.push(id)
    })
    if (deletable.length === 0) throw new TaxonomyInUseError('payee', usages[0]!)
    pendingDeletion.value = {
      ids: deletable,
      names: deletable.map((id) => get(id)?.PAYEENAME ?? String(id)),
      purge: deletable.some((id) => usages[ids.indexOf(id)]!.state === 'onlyTrashed'),
      kept,
    }
  }

  async function confirmDeletion(): Promise<RemoveManyResult | null> {
    const pending = pendingDeletion.value
    if (!pending) return null
    try {
      const result = await payeeRepo.removeMany(pending.ids, { purgeTrashed: pending.purge })
      keptNames.value = [
        ...pending.kept.map((k) => k.name),
        ...result.refused.map((r) => get(r.id)?.PAYEENAME ?? String(r.id)),
      ]
      return result
    } finally {
      pendingDeletion.value = null
      selectedIds.value = []
      await load()
    }
  }

  function cancelDeletion() {
    pendingDeletion.value = null
  }

  async function relocate(from: number, to: number, options: RelocateOptions = {}) {
    const result: MergeResult = await payeeRepo.relocate(from, to, options)
    await load()
    return result
  }

  return {
    loading,
    error,
    payees,
    categories,
    usageCounts,
    showHidden,
    mode,
    delimiter,
    search,
    selectedIds,
    pendingDeletion,
    keptNames,
    rows,
    categoryColumnTitleKey,
    get,
    load,
    setShowHidden,
    add,
    save,
    setHidden,
    setDefaultCategory,
    usageOf,
    requestDeletion,
    confirmDeletion,
    cancelDeletion,
    relocate,
  }
})
