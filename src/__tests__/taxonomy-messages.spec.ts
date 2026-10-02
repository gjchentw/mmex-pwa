import { describe, it, expect, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../workers/sqlite.worker?worker', () => ({ default: MockWorker }))
import { i18n } from '../i18n'
import { describeTaxonomyError } from '../components/taxonomy/taxonomy-messages'
import {
  PayeeValidationError,
  TaxonomyInUseError,
  TaxonomyMergeError,
  TaxonomyNameError,
  type TaxonomyUsage,
} from '../domain/repos/taxonomy'

/** Spec: transaction-taxonomy, Requirement "Refusal Presentation" (design D6). */

const t = (key: string, params?: Record<string, unknown>) =>
  params ? i18n.global.t(key, params) : i18n.global.t(key)

const usage = (extra: Partial<TaxonomyUsage> = {}): TaxonomyUsage => ({
  transactions: 0,
  splits: 0,
  series: 0,
  seriesSplits: 0,
  budgetRows: 0,
  payeeDefaults: 0,
  descendantUsed: false,
  trashedTransactionIds: [],
  orphanLinks: 0,
  state: 'used',
  ...extra,
})

afterEach(() => {
  i18n.global.locale.value = 'en-US'
})

describe('name refusals', () => {
  it.each([
    ['category', 'empty', 'A name is required'],
    ['category', 'colon', 'colon (:) character'],
    ['tag', 'space', "space (' ') character"],
    ['tag', 'reserved', "'&' or '|'"],
    ['category', 'duplicate', 'already exists for the parent'],
    ['payee', 'duplicate', 'A payee with this name already exists'],
    ['tag', 'duplicate', 'A tag with this name already exists'],
  ] as const)('translates %s/%s with desktop wording', (kind, reason, expected) => {
    expect(describeTaxonomyError(new TaxonomyNameError(kind, reason), t)).toContain(expected)
  })
})

describe('in-use refusals', () => {
  it('names the kind and shows the live counts', () => {
    const text = describeTaxonomyError(
      new TaxonomyInUseError('payee', usage({ transactions: 2, series: 1 })),
      t,
    )
    expect(text).toContain('Payee in use.')
    expect(text).toContain('Transactions: 2')
    expect(text).toContain('scheduled transactions: 1')
  })

  it('distinguishes a used category from a used subcategory and adds the merge tip', () => {
    expect(
      describeTaxonomyError(new TaxonomyInUseError('category', usage({ transactions: 1 })), t),
    ).toContain('Category in use.')
    const sub = describeTaxonomyError(
      new TaxonomyInUseError('category', usage({ descendantUsed: true })),
      t,
    )
    expect(sub).toContain('Subcategory in use.')
    expect(sub).toContain('merge command')
  })

  it('names the tag when the caller gives its name', () => {
    expect(
      describeTaxonomyError(new TaxonomyInUseError('tag', usage({ transactions: 1 })), t, {
        name: 'travel',
      }),
    ).toContain("Tag 'travel' in use")
  })
})

describe('merge and payee refusals', () => {
  it.each([
    ['sameEntity', 'must differ'],
    ['hiddenTarget', 'hidden'],
    ['sourceHasChildren', 'subcategories'],
  ] as const)('translates merge/%s', (reason, expected) => {
    expect(describeTaxonomyError(new TaxonomyMergeError(reason), t)).toContain(expected)
  })

  it('translates payee fields and names the pattern line', () => {
    expect(describeTaxonomyError(new PayeeValidationError({ field: 'name' }), t)).toContain(
      'name is required',
    )
    expect(describeTaxonomyError(new PayeeValidationError({ field: 'website' }), t)).toBe(
      'Please enter a valid URL',
    )
    expect(
      describeTaxonomyError(new PayeeValidationError({ field: 'pattern', index: 1 }), t),
    ).toContain('Line 2')
  })

  it('returns null for an error it does not own', () => {
    expect(describeTaxonomyError(new Error('disk full'), t)).toBeNull()
  })
})

// Scenario "A refusal is translated".
describe('translation', () => {
  it('speaks the active locale and leaks no reason code', () => {
    i18n.global.locale.value = 'zh-TW'
    const text = describeTaxonomyError(new TaxonomyNameError('tag', 'space'), t)!
    expect(text).toContain('空格')
    expect(text).not.toContain('space')
    expect(text).not.toContain('taxonomy.')
  })
})
