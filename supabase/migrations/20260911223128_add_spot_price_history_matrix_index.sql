-- latest_aws_spot_prices() does:
--   SELECT DISTINCT ON (instance_type, region) instance_type, region, price_usd
--   FROM spot_price_history WHERE instance_type SIMILAR TO '...'
--   ORDER BY instance_type, region, timestamp DESC
-- The only existing index is the PK (az, instance_type, timestamp), which
-- doesn't match this access pattern, so the planner falls back to a seq scan
-- + disk-spilling external sort over 655k rows (~1.3s as postgres; anon's
-- 3s statement_timeout makes this fail outright). This index matches the
-- DISTINCT ON / ORDER BY exactly so it can be satisfied by an index scan
-- with no separate sort step, and INCLUDEs price_usd for an index-only scan.
create index if not exists idx_spot_price_history_matrix
  on spot_price_history (instance_type, region, "timestamp" desc)
  include (price_usd);
