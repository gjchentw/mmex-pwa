# Investment Tracking — Delta: Payee on a Trade

**Change**: `domain-write-fixes`
**Capability**: `investment-tracking`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Governed by [AGENTS.md](../../../AGENTS.md). Links are written relative to where this file is promoted, `openspec/specs/investment-tracking/spec.md`.

**Scope**: States what the cash transaction of a share trade carries as its payee. Nothing else in the requirement changes.

## MODIFIED Requirements

### Requirement: Share Trade Recording

When the application records a share trade, it SHALL produce the upstream three-record shape in one logical operation.

- A ledger transaction in the associated account whose money amount is shares × price plus commission for a buy, minus commission for a sell.
- That transaction SHALL carry the payee given for the trade, or the upstream `-1` sentinel when none is given; `PAYEEID` SHALL never be `NULL`, as the column forbids it.
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
    User->>App: Record buy/sell (shares, price, commission, optional payee)
    App->>Ledger: Write money-side transaction (payee or -1)
    App->>Link: Link TRANSID to STOCKID (LINKTYPE Stock)
    App->>Share: Write share detail (sell = negative shares)
    App->>Hist: Manual price point for trade date (unless free shares)
    App->>App: Recompute and persist position fields
```
*Caption: One share trade writes four rows and refreshes the cached position.*

Traceability: [mmex/moneymanagerex/src/sharetransactiondialog.cpp](../../../mmex/moneymanagerex/src/sharetransactiondialog.cpp), [mmex/moneymanagerex/src/usertransactionpanel.cpp](../../../mmex/moneymanagerex/src/usertransactionpanel.cpp) (the payee of the cash entry), [mmex/moneymanagerex/src/model/Model_Translink.h](../../../mmex/moneymanagerex/src/model/Model_Translink.h), [src/domain/repos/investment.ts](../../../src/domain/repos/investment.ts).

#### Scenario: Sell stores negative shares

- **WHEN** the user records a sale of 10 shares
- **THEN** the ledger row SHALL be a `Deposit` and the `SHAREINFO_V1.SHARENUMBER` SHALL be `-10`

#### Scenario: A trade without a payee stores the sentinel

- **WHEN** the user records a trade without naming a payee
- **THEN** the ledger row's `PAYEEID` SHALL be `-1`
