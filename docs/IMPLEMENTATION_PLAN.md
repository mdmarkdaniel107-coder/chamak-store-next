# Implementation checklist

## Stage 0 — Foundation
- [x] New app shell, D1 schema scaffold, health endpoint and dashboard read API
- [ ] Create GitHub repository and new D1
- [ ] Deploy and verify
- [ ] Authentication/authorization before real use

## Stage 1 — Product master
- [ ] SKU and product CRUD/archive
- [ ] Unit precision, opening stock and stock ledger

## Stage 2 — Purchases/suppliers
- [ ] Cash/credit purchase, weighted average cost
- [ ] Supplier ledger/payment and return policy

## Stage 3 — Sales/customers
- [ ] Item sale, stock and historical COGS
- [ ] Total sale clearly uncosted
- [ ] Customer due/collection, returns and reversals

## Stage 4 — Cash/expenses
- [ ] Opening cash, cash in/out, expenses, owner draw
- [ ] Cash reconciliation

## Stage 5 — Stock count
- [ ] Saved physical count, valuation and variance
- [ ] Separate confirmed stock adjustment and audit trail

## Stage 6 — Reports/release
- [ ] Daily/monthly sales, COGS, gross/net profit
- [ ] Customer/supplier balance reports
- [ ] Backup/restore rehearsal and mobile/concurrency tests
