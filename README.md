# CHAMAK STORE NEXT — full replacement bundle

This bundle targets the existing Cloudflare Worker + D1 database. It preserves migration `0001_core.sql` and adds only migration `0002_integrity_indexes.sql`.

## Files
- `src/index.js`: authenticated API and business transaction handlers
- `public/index.html`, `public/app.css`, `public/app.js`: responsive Bengali UI
- `migrations/0002_integrity_indexes.sql`: additive indexes only
- `wrangler.toml`: existing Worker/D1 bindings

## Critical accounting behavior
- Money is stored as integer paisa; quantities as integer milli-units.
- Purchase uses weighted-average cost and records stock, cash payment, supplier payable and audit records in a D1 batch.
- Itemized sales reduce stock, record cost, cash receipts and customer receivable in a D1 batch.
- Total-only sales intentionally do not adjust quantity because item-level quantities are unknown. Use itemized sales whenever stock accuracy matters.
- Physical stock count records a snapshot and variance; it does not silently change book stock.
- Web restore is disabled to prevent accidental destruction of live ledger data. Use Cloudflare D1 backup/restore procedures after making a backup.
- Account transfer endpoint deliberately returns 501: current schema has a single cash ledger and no separate account ledger, so pretending to transfer between accounts would be inaccurate.

## Apply
1. Download/inspect the bundle and retain a copy of the current repository and D1 backup.
2. Replace `src/index.js`, `public/index.html`, `public/app.js`, `public/app.css`, `wrangler.toml`, and `package.json` with these files. Keep `migrations/0001_core.sql` unchanged; add `migrations/0002_integrity_indexes.sql`.
3. Run `npm install`.
4. Run `npm run check`.
5. Run `npx wrangler d1 migrations apply chamak-store-next-db --remote`.
6. Verify `APP_PASSWORD` and `SESSION_SECRET` are configured as Worker secrets; SESSION_SECRET must be at least 32 characters.
7. Deploy with `npm run deploy`.
8. Test `/api/health`, login/logout, product create/edit, supplier/customer creation, purchase with partial payment, itemized sale, customer collection, supplier payment, expense, income, stock count, reports, audit and backup. Start with small non-production test entries; take a D1 backup before any real ledger use.

## Important review notes
This is a substantial implementation bundle but has not been deployed against your live D1 instance in this environment. Do not treat it as production-verified until the end-to-end checks above pass. Existing data is not migrated or deleted by this bundle, but test transactions created after deployment are real records and should not be entered against live accounts casually.
