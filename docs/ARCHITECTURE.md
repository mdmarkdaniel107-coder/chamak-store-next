# Architecture and accounting rules

- UI: Bengali, mobile-first, presentation only.
- API: request validation, safe errors, authentication before production.
- DB: D1, schema migrations, foreign keys, indexed ledgers.
- Money is integer paisa; quantity stored in thousandths and validated by unit precision.
- Item sales must persist sale price and historical unit cost; reduce stock and write cash/customer ledger in the same atomic posting.
- Purchases update weighted average cost and stock; cash purchases lower cash, credit purchases increase supplier payable, not cash outflow.
- `sale_total` does not identify items: do not reduce stock or call profit actual.
- Stock count records physical count and valuation only; it must not mutate stock. Separate reasoned adjustment posts stock movement and audit log.
- Posted transactions should be reversed/corrected with traceable entries, not hard-deleted.
- Must implement authentication, duplicate-submit protection, audit logs, backup/restore test and error handling before production.
