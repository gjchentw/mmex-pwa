# Investment Tracking — Delta: New Capability

**Change**: `domain-model-baseline`
**Capability**: `investment-tracking`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

**Scope**: Stock positions (`STOCK_V1`), symbol-keyed price history (`STOCKHISTORY_V1`), per-trade share detail (`SHAREINFO_V1`), and the stock side of `TRANSLINK_V1`: how trades are recorded, how positions are derived and cached, and how holdings are valued. Non-scope: the ledger row semantics and link representation (`transaction-ledger`); online quote fetching (future); the asset side of `TRANSLINK_V1` (`asset-tracking`). All rules inherit `domain-data-conventions`.

## ADDED Requirements

### Requirement: Schema Fidelity for Investment Tables

The application SHALL persist `STOCK_V1`, `STOCKHISTORY_V1`, `SHAREINFO_V1`, and stock-side `TRANSLINK_V1` rows in conformance with `domain-data-conventions`.

- `STOCKHISTORY_V1` rows SHALL be unique per `(SYMBOL, DATE)` with `UPDTYPE` `1` (online) or `2` (manual); the join to positions is by symbol string, not identifier.
- Stock-side `TRANSLINK_V1` rows SHALL carry `LINKTYPE` exactly `Stock`.

Traceability: [mmex/database/tables.sql](../../../mmex/database/tables.sql), [mmex/moneymanagerex/src/model/Model_StockHistory.h](../../../mmex/moneymanagerex/src/model/Model_StockHistory.h).

#### Scenario: Investment rows round-trip

- **WHEN** a desktop-created database with linked share trades and price history is opened and persisted
- **THEN** all investment rows the user did not edit SHALL be unchanged

### Requirement: Share Trade Recording

When the application records a share trade, it SHALL produce the upstream three-record shape in one logical operation.

- A ledger transaction in the associated account whose money amount is shares × price plus commission for a buy, minus commission for a sell.
- A `TRANSLINK_V1` row linking that transaction to the position.
- A `SHAREINFO_V1` row on the same transaction carrying share number, share price, commission, and lot; a sell is a `Deposit` whose `SHARENUMBER` is negative, a buy is a `Withdrawal` with a positive `SHARENUMBER`.
- Unless the shares were free (price zero), a manual price-history point SHALL be written for the trade date.

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Ledger as CHECKINGACCOUNT_V1
    participant Link as TRANSLINK_V1
    participant Share as SHAREINFO_V1
    participant Hist as STOCKHISTORY_V1
    User->>App: Record buy/sell (shares, price, commission)
    App->>Ledger: Write money-side transaction
    App->>Link: Link TRANSID to STOCKID (LINKTYPE Stock)
    App->>Share: Write share detail (sell = negative shares)
    App->>Hist: Manual price point for trade date (unless free shares)
    App->>App: Recompute and persist position fields
```
*Caption: One share trade writes four rows and refreshes the cached position.*

Traceability: [mmex/moneymanagerex/src/sharetransactiondialog.cpp](../../../mmex/moneymanagerex/src/sharetransactiondialog.cpp), [mmex/moneymanagerex/src/model/Model_Translink.h](../../../mmex/moneymanagerex/src/model/Model_Translink.h).

#### Scenario: Sell stores negative shares

- **WHEN** the user records a sale of 10 shares
- **THEN** the ledger row SHALL be a `Deposit` and the `SHAREINFO_V1.SHARENUMBER` SHALL be `-10`

### Requirement: Position Fields Are Derived Caches

The application SHALL treat the position summary fields (`NUMSHARES`, `PURCHASEPRICE`, `VALUE`, `COMMISSION`, `PURCHASEDATE`) as derived caches over the linked ledger transactions, recomputed by the upstream moving-average cost book and **persisted** whenever a linked transaction is created, edited, deleted, restored, or purged.

- The recomputation walks linked transactions in date order, skipping void and soft-deleted rows: buys add shares × price plus commission to the cost book; sells relieve shares at the running average cost; the share total never goes below zero.
- After the walk: `PURCHASEDATE` is the earliest linked transaction date, `PURCHASEPRICE` the average cost, `NUMSHARES` the total, `VALUE` the book cost, `COMMISSION` the commission total.
- Persisting the recomputed fields is mandatory even if the application computes live values reactively — desktop MoneyManagerEx reads these cached columns.

Traceability: [mmex/moneymanagerex/src/model/Model_Stock.cpp](../../../mmex/moneymanagerex/src/model/Model_Stock.cpp) (`UpdatePosition`).

#### Scenario: Editing a linked trade refreshes the cache

- **WHEN** the user edits the price on a linked buy transaction
- **THEN** the position's cached fields SHALL be recomputed and written to `STOCK_V1` in the same logical operation

#### Scenario: Sells relieve at average cost

- **WHEN** a position holds 20 shares at average cost `5` and the user records a sale of 10 shares at `8`
- **THEN** the recomputed book cost SHALL decrease by `50` (10 × average cost `5`), not by the sale proceeds

### Requirement: Positions Without Linked Transactions

The application SHALL honor legacy positions that have no `TRANSLINK_V1` rows: the user-entered share count and value stand, and the purchase price mirrors the current price on recomputation.

Traceability: [mmex/moneymanagerex/src/model/Model_Stock.cpp](../../../mmex/moneymanagerex/src/model/Model_Stock.cpp).

#### Scenario: Legacy position is not zeroed

- **WHEN** the application recomputes a position that has no linked transactions
- **THEN** the stored share count and value SHALL be left as entered

### Requirement: Symbol-Keyed Price History

The application SHALL treat price history as shared per symbol across accounts and positions.

- Updating a symbol's current price SHALL propagate to every position with that symbol.
- Deleting a position SHALL delete the symbol's history only when no other position uses the symbol.
- Valuing a position at a date SHALL use the exact-date history point, else the nearest earlier one, falling back per upstream rules when none exists.

Traceability: [mmex/moneymanagerex/src/model/Model_Stock.cpp](../../../mmex/moneymanagerex/src/model/Model_Stock.cpp) (`UpdateCurrentPrice`, `getDailyBalanceAt`).

#### Scenario: Price update propagates by symbol

- **WHEN** the user updates the current price of symbol `AAPL` held in two accounts
- **THEN** both positions' current prices SHALL change

#### Scenario: Shared history survives one position's deletion

- **WHEN** the user deletes one of two positions holding the same symbol
- **THEN** the symbol's price history SHALL be retained

### Requirement: Valuation and Gain Definitions

When the application values holdings, it SHALL use the upstream definitions.

- Market value is shares × current price; invested value is the cached book cost; unrealized gain is their difference.
- Realized gain accumulates on each sell as shares × (sale price − average cost) minus commission, with currency conversion at each trade date's rate per `currency-management`.

Traceability: [mmex/moneymanagerex/src/model/Model_Stock.cpp](../../../mmex/moneymanagerex/src/model/Model_Stock.cpp) (`CurrentValue`, `RealGainLoss`).

#### Scenario: Unrealized gain is market minus book

- **WHEN** a position's market value is `1200` and its book cost is `1000`
- **THEN** the reported unrealized gain SHALL be `200`

### Requirement: Share Quantity Precision

The application SHALL render share quantities with the file's share-precision setting (default `4`), independent of any currency's scale.

Traceability: [mmex/moneymanagerex/src/model/Model_Shareinfo.h](../../../mmex/moneymanagerex/src/model/Model_Shareinfo.h), [mmex/moneymanagerex/src/option.h](../../../mmex/moneymanagerex/src/option.h) (`SHARE_PRECISION`).

#### Scenario: Fractional shares render at share precision

- **WHEN** the application displays a holding of `10.12345` shares under the default share precision
- **THEN** the quantity SHALL render with four decimal places
- **AND** the persisted value SHALL be unchanged
