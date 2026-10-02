import {
  PayeeValidationError,
  TaxonomyInUseError,
  TaxonomyMergeError,
  TaxonomyNameError,
  type TaxonomyKind,
} from '../../domain/repos/taxonomy'

/**
 * Turns the taxonomy repository's typed refusals into the user's language
 * (openspec: transaction-taxonomy, Refusal Presentation). The wording is
 * desktop's; the reason codes never reach the user.
 */

export type Translate = (key: string, params?: Record<string, unknown>) => string

const KIND_SUFFIX: Record<TaxonomyKind, 'Category' | 'Payee' | 'Tag'> = {
  category: 'Category',
  payee: 'Payee',
  tag: 'Tag',
}

export const describeTaxonomyError = (
  err: unknown,
  t: Translate,
  context: { name?: string } = {},
): string | null => {
  if (err instanceof TaxonomyNameError) {
    return err.reason === 'duplicate'
      ? t(`taxonomy.name.duplicate${KIND_SUFFIX[err.kind]}`)
      : t(`taxonomy.name.${err.reason}`)
  }
  if (err instanceof TaxonomyInUseError) {
    const usage = err.usage
    const ownUse = usage.transactions + usage.splits + usage.series + usage.seriesSplits > 0
    const head =
      err.kind === 'category'
        ? t(ownUse ? 'category.inUse' : 'category.subcategoryInUse')
        : err.kind === 'payee'
          ? t('payee.inUse')
          : t('tag.inUse', { name: context.name ?? '' })
    const counts = t('taxonomy.inUse.counts', {
      transactions: usage.transactions,
      splits: usage.splits,
      series: usage.series,
      seriesSplits: usage.seriesSplits,
    })
    const tip = err.kind === 'category' ? ` ${t('category.mergeTip')}` : ''
    return `${head} ${counts}${tip}`
  }
  if (err instanceof TaxonomyMergeError) return t(`taxonomy.merge.${err.reason}`)
  if (err instanceof PayeeValidationError) {
    return err.field === 'pattern'
      ? t('payee.invalid.pattern', { line: (err.index ?? 0) + 1 })
      : t(`payee.invalid.${err.field}`)
  }
  return null
}
