# CHAMAK STORE NEXT — Replacement bundle

## Added in this replacement
- Customer search by name/phone/notes.
- Supplier search by name/phone/notes.
- Customer and supplier editing (name, phone, notes) using existing PATCH APIs.
- Per-customer current receivable and per-supplier current payable, calculated from their ledgers.
- Ledger screen shows party-wise balances plus recent transactions.
- Existing sale, purchase, cash, collection, supplier payment, stock-count and reports flows retained.

## Critical deployment safety
This package is not a guarantee of zero data loss and has not been end-to-end tested against your live D1. Make a fresh Cloudflare D1 backup before changing files or applying migrations.

1. Extract this ZIP on your PC.
2. Copy `src/index.js`, `public/index.html`, `public/app.js`, `public/app.css`, `package.json`, and `wrangler.toml` into your repository. Review diffs first.
3. **Do not overwrite or edit the repository's already-applied `migrations/0001_core.sql`.** Keep its existing content and migration history.
4. Add `migrations/0002_integrity_indexes.sql` only if it is not already present/applied. It adds indexes only; it does not delete rows. Check `npx wrangler d1 migrations list chamak-store-next-db --remote` first.
5. Run `npm install` then `npm run check`. Stop if any command fails.
6. Confirm Worker secrets `APP_PASSWORD` and `SESSION_SECRET` are set; use a strong session secret (32+ random characters).
7. After backup and review, apply only pending migrations with `npx wrangler d1 migrations apply chamak-store-next-db --remote`.
8. Deploy with `npm run deploy` only after checks succeed.
9. Verify search, edit, each party's balance, collection/payment, and dashboard with small controlled test records. Remember: live test transactions become real business data; record and reverse them using normal accounting operations, never by manually deleting ledger rows.

The app's browser backup export is not a replacement for a Cloudflare D1 backup. This bundle does not push to GitHub; you control all repository changes.
