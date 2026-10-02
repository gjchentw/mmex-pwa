import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { REFTYPE } from '../../domain/conventions'
import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import {
  PayeeValidationError,
  TaxonomyInUseError,
  TaxonomyMergeError,
  TaxonomyNameError,
  categoryRepo,
  payeeRepo,
  tagRepo,
} from '../../domain/repos/taxonomy'
import type { CategoryRecord, PayeeRecord, TagRecord } from '../../domain/records'

/**
 * Spec: transaction-taxonomy (delta: desktop fidelity), Usage-Guarded Deletion,
 * Relocate and Merge, Visibility via Active Flags, Category Tree Structure,
 * Payee Records, Payee Pattern Custody, Tags and Polymorphic Tag Links.
 *
 * The SQLite WebAssembly build cannot run under Node, so these tests assert the
 * statement batches against a fake DomainDb (design D13). The fake answers the
 * repository's reads from fixtures: entity tables by SQL prefix, the usage
 * counts by the first bound id, the trashed ids and the collapse count by alias.
 */

type Counts = {
  transactions: number
  splits: number
  series: number
  seriesSplits: number
  budgetRows: number
  payeeDefaults: number
  trashedLinks: number
  links: number
}

const zero: Counts = {
  transactions: 0,
  splits: 0,
  series: 0,
  seriesSplits: 0,
  budgetRows: 0,
  payeeDefaults: 0,
  trashedLinks: 0,
  links: 0,
}

const category = (
  id: number,
  name: string,
  parentId = -1,
  active: number | null = 1,
): CategoryRecord => ({ CATEGID: id, CATEGNAME: name, PARENTID: parentId, ACTIVE: active })

const payee = (id: number, name: string, active: number | null = 1): PayeeRecord => ({
  PAYEEID: id,
  PAYEENAME: name,
  CATEGID: -1,
  NUMBER: null,
  WEBSITE: null,
  NOTES: null,
  ACTIVE: active,
  PATTERN: null,
})

const tag = (id: number, name: string, active: number | null = 1): TagRecord => ({
  TAGID: id,
  TAGNAME: name,
  ACTIVE: active,
})

const fixture = {
  categories: [] as CategoryRecord[],
  payees: [] as PayeeRecord[],
  tags: [] as TagRecord[],
  /** Usage counts keyed by the first bound id of the counts query. */
  counts: {} as Record<number, Partial<Counts>>,
  trashed: [] as number[],
  splitIds: [] as number[],
  collapsed: 0,
}

const batches: SqlStatement[][] = []
/** Every read, flattened, in order; 'mutate' marks each batch (design R4, R6). */
const timeline: string[] = []

const firstNumber = (bind: readonly unknown[]): number =>
  bind.find((value): value is number => typeof value === 'number') ?? -1

const fakeDb: DomainDb = {
  async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
    const flat = sql.replace(/\s+/g, ' ')
    timeline.push(flat)
    const byKey = <R extends Record<string, unknown>>(rows: R[], key: string) =>
      flat.includes(`WHERE ${key} = ?`) ? rows.filter((row) => row[key] === bind[0]) : rows
    if (flat.startsWith('SELECT * FROM CATEGORY_V1'))
      return byKey(fixture.categories, 'CATEGID') as T[]
    if (flat.startsWith('SELECT * FROM PAYEE_V1')) return byKey(fixture.payees, 'PAYEEID') as T[]
    if (flat.startsWith('SELECT * FROM TAG_V1')) return byKey(fixture.tags, 'TAGID') as T[]
    if (flat.includes('AS transactions')) {
      return [{ ...zero, ...(fixture.counts[firstNumber(bind)] ?? {}) }] as T[]
    }
    if (flat.includes('AS trashedTransactionId')) {
      return fixture.trashed.map((id) => ({ trashedTransactionId: id })) as T[]
    }
    if (flat.includes('AS collapsed')) return [{ collapsed: fixture.collapsed }] as T[]
    if (flat.includes('AS links')) {
      return [{ links: fixture.counts[firstNumber(bind)]?.links ?? 0 }] as T[]
    }
    if (flat.startsWith('SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1')) {
      return fixture.splitIds.map((id) => ({ SPLITTRANSID: id })) as T[]
    }
    return [] as T[]
  },
  async mutate(statements: SqlStatement[]): Promise<void> {
    batches.push(statements)
    timeline.push('mutate')
  },
}

beforeEach(() => {
  fixture.categories = [
    category(1, 'Food'),
    category(2, 'Snacks', 1),
    category(3, 'Drinks', 1, 0),
    category(4, 'Travel', -1, 0),
    category(5, 'Bills'),
  ]
  fixture.payees = [payee(1, 'Shop'), payee(2, 'Old Shop', 0), payee(3, 'New Shop')]
  fixture.tags = [tag(1, 'travel'), tag(2, 'trip'), tag(3, 'legacy', 0)]
  fixture.counts = {}
  fixture.trashed = []
  fixture.splitIds = []
  fixture.collapsed = 0
  batches.length = 0
  timeline.length = 0
  setDomainDb(fakeDb)
})
afterEach(() => setDomainDb())

const flatSql = (statement: SqlStatement): string => statement.sql.replace(/\s+/g, ' ')
const all = (): SqlStatement[] => batches.flat()
const sqlList = (): string[] => all().map(flatSql)
const LIVE = "COALESCE(DELETEDTIME, '') = ''"
const now = new Date(Date.UTC(2026, 9, 2, 12, 0, 0))
const stamp = '2026-10-02T12:00:00'

describe('category usage', () => {
  // Requirement "Usage-Guarded Deletion": budget rows and payee defaults are
  // reported but do not make the category used; a descendant's use does.
  it('reports live references per table, trashed ids and descendant use', async () => {
    fixture.counts = {
      1: { transactions: 1, splits: 1, budgetRows: 1, payeeDefaults: 1 },
      2: { series: 1 },
    }
    fixture.trashed = [9]

    const usage = await categoryRepo.usage(1)

    expect(usage).toMatchObject({
      transactions: 1,
      splits: 1,
      series: 0,
      budgetRows: 1,
      payeeDefaults: 1,
      descendantUsed: true,
      trashedTransactionIds: [9],
      state: 'used',
    })
    // The counts query excludes trashed rows by the same predicate the ledger uses,
    // and resolves split lines through their transaction (design D2, R6).
    const counts = timeline.find((q) => q.includes('AS transactions'))!
    expect(counts).toContain(`WHERE CATEGID IN (?) AND ${LIVE}`)
    expect(counts).toContain('JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID')
    expect(counts).toContain("COALESCE(t.DELETEDTIME, '') = ''")
  })

  // Scenario "Budget entry does not block".
  it('treats a category referenced only by a budget row as unused', async () => {
    fixture.counts = { 1: { budgetRows: 1 } }
    expect((await categoryRepo.usage(1)).state).toBe('unused')
  })

  it('reports only-trashed when nothing live references it', async () => {
    fixture.trashed = [9]
    expect((await categoryRepo.usage(5)).state).toBe('onlyTrashed')
  })
})

describe('category deletion', () => {
  // Scenario "Used category cannot be deleted": a descendant's live transaction.
  it('refuses a used category and writes nothing', async () => {
    fixture.counts = { 2: { transactions: 1 } }
    await expect(categoryRepo.remove(1)).rejects.toBeInstanceOf(TaxonomyInUseError)
    expect(batches).toHaveLength(0)
  })

  // Scenario "Only trashed references are purged on confirm".
  it('refuses only-trashed references until the purge is confirmed', async () => {
    fixture.trashed = [9]
    const refusal = await categoryRepo.remove(5).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(TaxonomyInUseError)
    expect((refusal as TaxonomyInUseError).usage.state).toBe('onlyTrashed')
    expect(batches).toHaveLength(0)
  })

  it('purges the trashed transactions, then cascades over the subtree', async () => {
    fixture.trashed = [9]
    fixture.splitIds = [70]

    await categoryRepo.remove(1, { purgeTrashed: true })

    const sql = sqlList()
    const purge = sql.findIndex((s) => s.startsWith('DELETE FROM CHECKINGACCOUNT_V1'))
    const budget = sql.findIndex((s) => s.startsWith('DELETE FROM BUDGETTABLE_V1'))
    const defaults = sql.findIndex((s) => s.startsWith('UPDATE PAYEE_V1 SET CATEGID = ?'))
    const rows = sql.findIndex((s) => s.startsWith('DELETE FROM CATEGORY_V1'))
    expect(batches).toHaveLength(1)
    expect(purge).toBeGreaterThanOrEqual(0)
    expect(sql.some((s) => s.includes('DELETE FROM TAGLINK_V1') && s.includes('REFID IN'))).toBe(
      true,
    )
    expect(all()[purge]!.bind).toEqual([9])
    expect(purge).toBeLessThan(budget)
    expect(budget).toBeLessThan(defaults)
    expect(defaults).toBeLessThan(rows)
    expect(all()[budget]!.bind).toEqual([1, 2, 3])
    expect(all()[defaults]!.bind).toEqual([-1, 1, 2, 3])
    expect(all()[rows]!.bind).toEqual([1, 2, 3])
  })

  // Scenario "Unused subtree goes with the parent".
  it('deletes an unused category with its subtree without a purge', async () => {
    await categoryRepo.remove(1)

    const sql = sqlList()
    expect(sql.some((s) => s.startsWith('DELETE FROM CHECKINGACCOUNT_V1'))).toBe(false)
    expect(sql.at(-1)).toBe('DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?, ?, ?)')
    expect(all().at(-1)!.bind).toEqual([1, 2, 3])
  })

  it('removes the removable ones of a selection and reports the refused', async () => {
    fixture.counts = { 2: { transactions: 1 } }

    const result = await categoryRepo.removeMany([2, 3])

    expect(result.removed).toEqual([3])
    expect(result.refused.map((r) => r.id)).toEqual([2])
    expect(result.refused[0]!.usage.state).toBe('used')
    expect(batches).toHaveLength(1)
    expect(sqlList().at(-1)).toBe('DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?)')
    expect(all().at(-1)!.bind).toEqual([3])
  })
})

describe('category merge', () => {
  // Scenario "Merge into itself is refused".
  it('refuses the same entity and a hidden target before writing', async () => {
    await expect(categoryRepo.relocate(1, 1)).rejects.toMatchObject({ reason: 'sameEntity' })
    await expect(categoryRepo.relocate(2, 4)).rejects.toBeInstanceOf(TaxonomyMergeError)
    await expect(categoryRepo.relocate(2, 4)).rejects.toMatchObject({ reason: 'hiddenTarget' })
    expect(batches).toHaveLength(0)
  })

  // Scenarios "Live transactions are stamped" and "Budget rows of the merged
  // category are deleted" (relocatecategorydialog.cpp 150-215, Model_Checking.cpp 115-118).
  it('re-points every table, stamps live transactions only, and deletes budget rows', async () => {
    fixture.counts = {
      2: {
        transactions: 2,
        splits: 1,
        series: 1,
        seriesSplits: 1,
        budgetRows: 1,
        payeeDefaults: 1,
      },
    }

    const result = await categoryRepo.relocate(2, 1, { now })

    const sql = sqlList()
    expect(sql[0]).toBe(
      `UPDATE CHECKINGACCOUNT_V1 SET CATEGID = ?, LASTUPDATEDTIME = ? WHERE CATEGID = ? AND ${LIVE}`,
    )
    expect(all()[0]!.bind).toEqual([1, stamp, 2])
    expect(sql[1]).toBe(
      `UPDATE CHECKINGACCOUNT_V1 SET CATEGID = ? WHERE CATEGID = ? AND NOT (${LIVE})`,
    )
    expect(all()[1]!.bind).toEqual([1, 2])
    for (const table of [
      'SPLITTRANSACTIONS_V1',
      'BILLSDEPOSITS_V1',
      'BUDGETSPLITTRANSACTIONS_V1',
      'PAYEE_V1',
    ]) {
      expect(sql).toContain(`UPDATE ${table} SET CATEGID = ? WHERE CATEGID = ?`)
    }
    expect(sql).toContain('DELETE FROM BUDGETTABLE_V1 WHERE CATEGID IN (?)')
    expect(sql.some((s) => s.startsWith('UPDATE BUDGETTABLE_V1'))).toBe(false)
    expect(sql.some((s) => s.startsWith('DELETE FROM CATEGORY_V1'))).toBe(false)
    expect(result).toEqual({
      changed: 7,
      byTable: {
        transactions: 2,
        splits: 1,
        series: 1,
        seriesSplits: 1,
        budgetRows: 1,
        payeeDefaults: 1,
      },
    })
  })

  it('deletes the source on request unless it has children', async () => {
    await expect(categoryRepo.relocate(1, 5, { deleteSource: true })).rejects.toMatchObject({
      reason: 'sourceHasChildren',
    })
    expect(batches).toHaveLength(0)

    await categoryRepo.relocate(2, 5, { deleteSource: true })

    expect(sqlList().at(-1)).toBe('DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?)')
    expect(all().at(-1)!.bind).toEqual([2])
  })
})

describe('category visibility and tree edits', () => {
  // Scenario "Hiding a parent hides its subtree" (categdialog.cpp 752-763).
  it('hides and unhides the whole subtree in one statement', async () => {
    const [statement] = await categoryRepo.setHiddenStatements(1, true)
    expect(flatSql(statement!)).toBe('UPDATE CATEGORY_V1 SET ACTIVE = ? WHERE CATEGID IN (?, ?, ?)')
    expect(statement!.bind).toEqual([0, 1, 2, 3])

    const [unhide] = await categoryRepo.setHiddenStatements(2, false)
    expect(unhide!.bind).toEqual([1, 2])
  })

  // Category Tree Structure: a child under a hidden parent is visible (categdialog.cpp 367).
  it('creates a child under a hidden parent as visible', async () => {
    const statement = await categoryRepo.addStatement('Chips', 4)
    expect(statement.sql).toContain('ACTIVE')
    expect(statement.bind).toEqual(['Chips', 4, 1])
  })

  // Scenario "Move to the top level".
  it('allows a move to the top level', async () => {
    const statement = await categoryRepo.reparentStatement(2, -1)
    expect(statement.bind).toEqual([-1, 2])
  })

  // Scenarios "Case-only rename is accepted", "Colon in a name is refused",
  // "Sibling duplicate is rejected".
  it('renames with desktop name rules, allowing a case-only rename', async () => {
    const renamed = await categoryRepo.renameStatement(1, 'FOOD')
    expect(renamed.bind).toEqual(['FOOD', 1])

    await expect(categoryRepo.renameStatement(1, 'Food:1')).rejects.toMatchObject({
      reason: 'colon',
    })
    await expect(categoryRepo.renameStatement(2, 'drinks')).rejects.toMatchObject({
      reason: 'duplicate',
    })
    await expect(categoryRepo.addStatement('   ', 1)).rejects.toBeInstanceOf(TaxonomyNameError)
  })
})

describe('payee records', () => {
  // Scenario "Invalid website is refused"; Payee Records: CATEGID -1, never NULL.
  it('validates name and website and stores the sentinel default', async () => {
    await expect(payeeRepo.addStatement({ PAYEENAME: ' ' })).rejects.toBeInstanceOf(
      PayeeValidationError,
    )
    await expect(
      payeeRepo.addStatement({ PAYEENAME: 'A', WEBSITE: 'not a url' }),
    ).rejects.toMatchObject({
      field: 'website',
    })
    await expect(payeeRepo.addStatement({ PAYEENAME: 'shop' })).rejects.toMatchObject({
      reason: 'duplicate',
    })

    const statement = await payeeRepo.addStatement({ PAYEENAME: 'Baker', CATEGID: null })
    const columns = /\(([^)]*)\) VALUES/.exec(statement.sql)![1]!.split(', ')
    expect(statement.bind![columns.indexOf('CATEGID')]).toBe(-1)
    // A new payee carries desktop's empty pattern object.
    expect(statement.bind![columns.indexOf('PATTERN')]).toBe('{}')
    expect(statement.bind![columns.indexOf('ACTIVE')]).toBe(1)
  })

  // Scenario "Patterns survive editing other fields"; Pattern Custody write rules.
  it('writes PATTERN only when patterns are given, through the codec', async () => {
    const rename = await payeeRepo.updateStatement(1, { PAYEENAME: 'Shop 2' })
    expect(rename.sql).not.toContain('PATTERN')

    const withPatterns = await payeeRepo.updateStatement(1, { patterns: ['A', ''] })
    expect(withPatterns.sql).toContain('PATTERN = ?')
    expect(withPatterns.bind![0]).toBe('{\n    "0": "A"\n}')

    await expect(payeeRepo.updateStatement(1, { patterns: ['regex:('] })).rejects.toMatchObject({
      field: 'pattern',
      index: 0,
    })
  })

  it('reports only-trashed use and refuses deletion until confirmed', async () => {
    fixture.trashed = [9]
    expect((await payeeRepo.usage(1)).state).toBe('onlyTrashed')
    await expect(payeeRepo.remove(1)).rejects.toBeInstanceOf(TaxonomyInUseError)
    expect(batches).toHaveLength(0)

    await payeeRepo.remove(1, { purgeTrashed: true })

    const sql = sqlList()
    expect(sql.some((s) => s.startsWith('DELETE FROM CHECKINGACCOUNT_V1'))).toBe(true)
    // The purged transaction's own attachment rows go first (ledger hard delete),
    // then the payee's; both are REFTYPE-scoped deletes.
    const attachments = all().filter((s) => flatSql(s).startsWith('DELETE FROM ATTACHMENT_V1'))
    expect(attachments.map((s) => s.bind)).toEqual([
      [REFTYPE.transaction, 9],
      [REFTYPE.payee, 1],
    ])
    expect(sql.at(-1)).toBe('DELETE FROM PAYEE_V1 WHERE PAYEEID IN (?)')
  })

  it('hides, sets defaults and clears defaults over many payees in one statement each', () => {
    const [hide] = payeeRepo.setHiddenStatements([1, 3], true)
    expect(flatSql(hide!)).toBe('UPDATE PAYEE_V1 SET ACTIVE = ? WHERE PAYEEID IN (?, ?)')
    expect(hide!.bind).toEqual([0, 1, 3])
    const [setDefault] = payeeRepo.setDefaultCategoryStatements([1, 3], 7)
    expect(flatSql(setDefault!)).toBe('UPDATE PAYEE_V1 SET CATEGID = ? WHERE PAYEEID IN (?, ?)')
    expect(setDefault!.bind).toEqual([7, 1, 3])
    const [clear] = payeeRepo.setDefaultCategoryStatements([1], null)
    expect(clear!.bind).toEqual([-1, 1])
  })
})

describe('payee merge', () => {
  // record-extensions, "Merge leaves attachments on the source"; Relocate and
  // Merge, stamping (relocatepayeedialog.cpp 162-182).
  it('re-points transactions and series, stamps live rows, and never touches attachments', async () => {
    fixture.counts = { 1: { transactions: 1, series: 1 } }

    const result = await payeeRepo.relocate(1, 3, { now })

    const sql = sqlList()
    expect(sql[0]).toBe(
      `UPDATE CHECKINGACCOUNT_V1 SET PAYEEID = ?, LASTUPDATEDTIME = ? WHERE PAYEEID = ? AND ${LIVE}`,
    )
    expect(all()[0]!.bind).toEqual([3, stamp, 1])
    expect(sql[1]).toBe(
      `UPDATE CHECKINGACCOUNT_V1 SET PAYEEID = ? WHERE PAYEEID = ? AND NOT (${LIVE})`,
    )
    expect(sql).toContain('UPDATE BILLSDEPOSITS_V1 SET PAYEEID = ? WHERE PAYEEID = ?')
    expect(sql.some((s) => s.includes('ATTACHMENT_V1'))).toBe(false)
    expect(result).toEqual({ changed: 2, byTable: { transactions: 1, series: 1 } })
  })

  // record-extensions, "Deleting the merged source removes its attachment rows".
  it('removes the source and its attachment rows only when asked', async () => {
    await payeeRepo.relocate(1, 3, { deleteSource: true })

    const sql = sqlList()
    const attachments = sql.findIndex((s) => s.startsWith('DELETE FROM ATTACHMENT_V1'))
    expect(attachments).toBeGreaterThan(0)
    expect(all()[attachments]!.bind).toEqual([REFTYPE.payee, 1])
    expect(sql.at(-1)).toBe('DELETE FROM PAYEE_V1 WHERE PAYEEID IN (?)')
    await expect(payeeRepo.relocate(1, 2)).rejects.toMatchObject({ reason: 'hiddenTarget' })
  })
})

describe('tag usage', () => {
  // Model_Tag::is_used, the three states; decision 15 on series and orphan links.
  it('maps live, trashed-only, orphan and series links to the three states', async () => {
    fixture.counts = { 1: { transactions: 1, links: 1 } }
    expect((await tagRepo.usage(1)).state).toBe('used')

    fixture.counts = { 1: { trashedLinks: 1, links: 1 } }
    fixture.trashed = [9]
    expect(await tagRepo.usage(1)).toMatchObject({
      state: 'onlyTrashed',
      trashedTransactionIds: [9],
    })

    fixture.counts = { 1: { links: 1 } }
    fixture.trashed = []
    expect(await tagRepo.usage(1)).toMatchObject({ state: 'unused', orphanLinks: 1 })

    fixture.counts = { 1: { series: 1, links: 1 } }
    expect((await tagRepo.usage(1)).state).toBe('used')

    // Each reference type is resolved through its own table, so a link to a
    // missing record counts for nothing (R6).
    const counts = timeline.find((q) => q.includes('AS transactions'))!
    expect(counts).toContain('JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = l.REFID')
    expect(counts).toContain('JOIN SPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID')
    expect(counts).toContain('JOIN BILLSDEPOSITS_V1 b ON b.BDID = l.REFID')
    expect(counts).toContain('JOIN BUDGETSPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID')
  })
})

describe('tag deletion', () => {
  it('refuses a used tag and writes nothing', async () => {
    fixture.counts = { 1: { transactions: 1, links: 1 } }
    await expect(tagRepo.remove(1)).rejects.toBeInstanceOf(TaxonomyInUseError)
    expect(batches).toHaveLength(0)
  })

  it('purges trashed transactions on confirmation, then the links and the tag', async () => {
    fixture.counts = { 1: { trashedLinks: 1, links: 1 } }
    fixture.trashed = [9]
    await expect(tagRepo.remove(1)).rejects.toBeInstanceOf(TaxonomyInUseError)
    expect(batches).toHaveLength(0)

    await tagRepo.remove(1, { purgeTrashed: true })

    const sql = sqlList()
    expect(sql.some((s) => s.startsWith('DELETE FROM CHECKINGACCOUNT_V1'))).toBe(true)
    expect(sql.at(-2)).toBe('DELETE FROM TAGLINK_V1 WHERE TAGID = ?')
    expect(sql.at(-1)).toBe('DELETE FROM TAG_V1 WHERE TAGID = ?')
  })

  it('deletes an unused tag with its orphan links', async () => {
    fixture.counts = { 1: { links: 1 } }
    await tagRepo.remove(1)
    expect(sqlList()).toEqual([
      'DELETE FROM TAGLINK_V1 WHERE TAGID = ?',
      'DELETE FROM TAG_V1 WHERE TAGID = ?',
    ])
  })
})

describe('tag merge', () => {
  // Scenario "Merge into itself is refused" (the C2 defect deleted every link).
  it('refuses the same entity before writing', async () => {
    await expect(tagRepo.relocate(1, 1)).rejects.toMatchObject({ reason: 'sameEntity' })
    expect(batches).toHaveLength(0)
  })

  // Scenario "Tag merge collapses duplicates" (design D6).
  it('counts collisions first, re-points with OR IGNORE, deletes the rest, never stamps', async () => {
    fixture.counts = { 2: { links: 3 } }
    fixture.collapsed = 1

    const result = await tagRepo.relocate(2, 1)

    expect(sqlList()).toEqual([
      'UPDATE OR IGNORE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ?',
      'DELETE FROM TAGLINK_V1 WHERE TAGID = ?',
    ])
    expect(all()[0]!.bind).toEqual([1, 2])
    expect(result).toEqual({ moved: 2, collapsed: 1 })
    expect(timeline.findIndex((q) => q.includes('AS collapsed'))).toBeLessThan(
      timeline.indexOf('mutate'),
    )
  })

  it('deletes the source tag after the merge on request', async () => {
    await tagRepo.relocate(2, 1, { deleteSource: true })
    expect(sqlList().at(-1)).toBe('DELETE FROM TAG_V1 WHERE TAGID = ?')
    expect(all().at(-1)!.bind).toEqual([2])
  })
})

describe('tag names and visibility', () => {
  // Scenario "Reserved tag name is refused"; tags are never hidden (decision 14).
  it('validates names and always writes ACTIVE 1', async () => {
    await expect(tagRepo.addStatement('summer trip')).rejects.toMatchObject({ reason: 'space' })
    await expect(tagRepo.addStatement('&')).rejects.toMatchObject({ reason: 'reserved' })
    await expect(tagRepo.addStatement('Travel')).rejects.toMatchObject({ reason: 'duplicate' })

    const added = await tagRepo.addStatement('camp')
    expect(added.bind).toEqual(['camp', 1])

    const renamed = await tagRepo.renameStatement(3, 'old')
    expect(flatSql(renamed)).toBe('UPDATE TAG_V1 SET TAGNAME = ?, ACTIVE = ? WHERE TAGID = ?')
    expect(renamed.bind).toEqual(['old', 1, 3])
  })
})
