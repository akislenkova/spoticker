-- Expand latest_aws_spot_prices() to cover all hardware categories:
--   GPU:  p5e (H200), p5 (H100), p4de (A100 80GB), p4d (A100 40GB),
--         g6e (L40S), g6 (L4), g5 (A10G), g4dn (T4)
--   CPU:  m7a/m6a/c7a/c6a/r7a (AMD), m7i/m6i/c7i/c6i/r7i (Intel),
--         m7g/m6g/c7g/c6g/r7g (Graviton)
create or replace function latest_aws_spot_prices()
returns table(instance_type text, region text, price_usd numeric)
language sql stable as $$
  select distinct on (instance_type, region)
    instance_type, region, price_usd
  from spot_price_history
  where instance_type similar to
    '(p5e|p5|p4de|p4d|p3|g6e|g6|g5|g4dn|m7a|m6a|c7a|c6a|r7a|m7i|m6i|c7i|c6i|r7i|m7g|m6g|c7g|c6g|r7g)\.%'
  order by instance_type, region, timestamp desc;
$$;

-- Expand latest_azure_spot_prices() to include H200, L40S, and CPU SKUs
create or replace function latest_azure_spot_prices()
returns table(arm_sku_name text, sku_name text, region text, retail_price numeric)
language sql stable as $$
  select distinct on (arm_sku_name, region)
    arm_sku_name, sku_name, region, retail_price
  from azure_spot_prices
  where
    arm_sku_name ilike '%T4%'     or
    arm_sku_name ilike '%A10%'    or
    arm_sku_name ilike '%L4%'     or
    arm_sku_name ilike '%L40S%'   or
    arm_sku_name ilike '%V100%'   or
    arm_sku_name ilike '%A100%'   or
    arm_sku_name ilike '%H100%'   or
    arm_sku_name ilike '%H200%'   or
    -- AMD EPYC: Standard_D4as_v5 / Standard_E4as_v4 pattern
    arm_sku_name similar to 'Standard_[A-Za-z][0-9]+a[sd]?s_v[45]%' or
    -- ARM Ampere: Standard_D4ps_v5 pattern
    arm_sku_name similar to 'Standard_[A-Za-z][0-9]+p[ls]?s_v[45]%' or
    -- Intel: Standard_D4s_v5 / Standard_D4ds_v5 (no a/p modifier)
    arm_sku_name similar to 'Standard_[A-Za-z][0-9]+d?s_v5%'
  order by arm_sku_name, region, fetched_at desc;
$$;
