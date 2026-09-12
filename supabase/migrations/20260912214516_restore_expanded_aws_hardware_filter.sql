-- 20260911223650_aws_spot_prices_latest_matrix.sql redefined
-- latest_aws_spot_prices() using the original narrow GPU-only instance-type
-- filter, accidentally reverting the hardware-family expansion from
-- 20260601000000_expand_hardware_types.sql (p5e/H200, g6e/L40S, and all CPU
-- families). The backfill and trigger in that migration were unfiltered, so
-- aws_spot_prices_latest already has the full data (verified live) — only
-- the RPC's WHERE clause needs restoring.
create or replace function latest_aws_spot_prices()
returns table(instance_type text, region text, price_usd numeric)
language sql stable as $$
  select instance_type, region, price_usd
  from aws_spot_prices_latest
  where instance_type similar to
    '(p5e|p5|p4de|p4d|p3|g6e|g6|g5|g4dn|m7a|m6a|c7a|c6a|r7a|m7i|m6i|c7i|c6i|r7i|m7g|m6g|c7g|c6g|r7g)\.%';
$$;
