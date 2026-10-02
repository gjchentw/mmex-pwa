import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../domain/db'
import type { TagRecord } from '../domain/records'
import {
  TaxonomyInUseError,
  tagRepo,
  type RelocateOptions,
  type RemoveManyResult,
  type TaxonomyUsage,
} from '../domain/repos/taxonomy'
import type { MergeOutcome } from '../components/taxonomy/MergeForm.vue'

/**
 * State behind the tag manager (openspec: transaction-taxonomy, Tag Manager
 * Display, Tag Creation and Renaming, Tag Deletion from the Surface). Tags are
 * never hidden, so there is no show-hidden state here.
 */

export interface TagRow {
  id: number
  name: string
  used: number
}

export interface KeptTag {
  id: number
  name: string
  usage: TaxonomyUsage
}

/** What the deletion confirmation shows; used tags are kept aside, as desktop continues past them. */
export interface PendingTagDeletion {
  ids: number[]
  names: string[]
  purge: boolean
  /** The tag desktop names in its purge sentence. */
  purgeName: string
  kept: KeptTag[]
}

export const useTagStore = defineStore('tag', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const tags = ref<TagRecord[]>([])
  const usageCounts = ref(new Map<number, number>())
  const search = ref('')
  const selectedIds = ref<number[]>([])
  const pendingDeletion = ref<PendingTagDeletion | null>(null)
  const keptNames = ref<string[]>([])

  const get = (id: number) => tags.value.find((t) => t.TAGID === id) ?? null

  const rows = computed<TagRow[]>(() => {
    const term = search.value.trim().toLocaleLowerCase()
    return tags.value
      .filter((t) => term === '' || t.TAGNAME.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.TAGNAME.localeCompare(b.TAGNAME))
      .map((t) => ({ id: t.TAGID, name: t.TAGNAME, used: usageCounts.value.get(t.TAGID) ?? 0 }))
  })

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [rowsRead, counts] = await Promise.all([tagRepo.all(), tagRepo.usageCounts()])
      tags.value = rowsRead
      usageCounts.value = counts
      selectedIds.value = selectedIds.value.filter((id) => rowsRead.some((t) => t.TAGID === id))
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function add(name: string) {
    await db.mutate([await tagRepo.addStatement(name)])
    await load()
  }

  async function rename(id: number, name: string) {
    await db.mutate([await tagRepo.renameStatement(id, name)])
    await load()
  }

  const usageOf = (id: number): Promise<TaxonomyUsage> => tagRepo.usage(id)

  /** Keeps the used tags aside and prepares the confirmation for the rest. */
  async function requestDeletion(ids: readonly number[]) {
    const usages = await Promise.all(ids.map((id) => tagRepo.usage(id)))
    const kept: KeptTag[] = []
    const deletable: number[] = []
    ids.forEach((id, index) => {
      const usage = usages[index]!
      if (usage.state === 'used') kept.push({ id, name: get(id)?.TAGNAME ?? String(id), usage })
      else deletable.push(id)
    })
    if (deletable.length === 0) throw new TaxonomyInUseError('tag', usages[0]!)
    const purged = deletable.find((id) => usages[ids.indexOf(id)]!.state === 'onlyTrashed')
    pendingDeletion.value = {
      ids: deletable,
      names: deletable.map((id) => get(id)?.TAGNAME ?? String(id)),
      purge: purged !== undefined,
      purgeName: purged === undefined ? '' : (get(purged)?.TAGNAME ?? String(purged)),
      kept,
    }
  }

  async function confirmDeletion(): Promise<RemoveManyResult | null> {
    const pending = pendingDeletion.value
    if (!pending) return null
    try {
      const result = await tagRepo.removeMany(pending.ids, { purgeTrashed: pending.purge })
      keptNames.value = [
        ...pending.kept.map((k) => k.name),
        ...result.refused.map((r) => get(r.id)?.TAGNAME ?? String(r.id)),
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

  /** The merge screen's outcome: moved links as "changed", plus the collapsed count. */
  async function relocate(
    from: number,
    to: number,
    options: Pick<RelocateOptions, 'deleteSource'> = {},
  ): Promise<MergeOutcome> {
    const result = await tagRepo.relocate(from, to, options)
    await load()
    return { changed: result.moved, collapsed: result.collapsed }
  }

  return {
    loading,
    error,
    tags,
    usageCounts,
    search,
    selectedIds,
    pendingDeletion,
    keptNames,
    rows,
    get,
    load,
    add,
    rename,
    usageOf,
    requestDeletion,
    confirmDeletion,
    cancelDeletion,
    relocate,
  }
})
