-- Additive only: does not delete or rewrite existing business data.
CREATE INDEX IF NOT EXISTS idx_transactions_customer_date ON transactions(customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transactions_supplier_date ON transactions(supplier_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON cash_ledger(occurred_at);
CREATE INDEX IF NOT EXISTS idx_stock_counts_created ON stock_counts(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
