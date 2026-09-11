-- The 5 public pricing/advisor tables already have RLS enabled with a
-- select-only policy for anon/authenticated (see
-- 20260518130000_enable_rls_public_tables.sql), but the underlying table
-- GRANTs were never narrowed from Supabase's schema-wide default ACL, which
-- gives anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- on every new public table. RLS's implicit "no policy = deny" currently
-- blocks those, but that's an implicit protection, not an explicit one —
-- narrow the grant itself so it doesn't depend on no one ever adding a
-- broader policy later.

revoke insert, update, delete, truncate, references, trigger
  on spot_price_history, spot_bid_advisor, azure_spot_prices,
     azure_spot_eviction_rates, gcp_spot_prices
  from anon, authenticated;

-- SELECT stays granted (matches the existing public-read RLS policies).
