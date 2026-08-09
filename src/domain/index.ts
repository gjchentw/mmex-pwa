/**
 * The typed domain layer: the only path from application code to domain tables
 * (openspec: domain-data-access, Single Typed Access Path).
 *
 * Modules split into `rules/` -- pure functions over loaded records, testable
 * without a database -- and `repos/`, which read through the message-passing
 * client and emit atomic statement lists.
 */

export * from './conventions'
export * from './records'
export { db, setDomainDb, type DomainDb, type SqlStatement } from './db'

export * as metadataRules from './rules/metadata'
export * as currencyRules from './rules/currency'
export * as accountRules from './rules/account'
export * as taxonomyRules from './rules/taxonomy'
export * as ledgerRules from './rules/ledger'
export * as scheduledRules from './rules/scheduled'
export * as budgetRules from './rules/budget'
export * as investmentRules from './rules/investment'
export * as assetRules from './rules/asset'
export * as extensionRules from './rules/extensions'

export {
  infoRepo,
  settingRepo,
  fileFacts,
  reportCustodyRepo,
  usageCustodyRepo,
} from './repos/metadata'
export { currencyRepo, currencyHistoryRepo, dayRateFor, rateContext } from './repos/currency'
export { accountRepo } from './repos/account'
export { categoryRepo, payeeRepo, tagRepo } from './repos/taxonomy'
export { ledgerRepo, type LedgerQuery } from './repos/ledger'
export { scheduledRepo } from './repos/scheduled'
export { budgetPeriodRepo, budgetRepo } from './repos/budget'
export { stockRepo, stockHistoryRepo } from './repos/investment'
export { assetRepo } from './repos/asset'
export {
  attachmentsRepo,
  customFieldsRepo,
  extensionCleanupStatements,
  updateCustomFieldDefinition,
} from './repos/extensions'
