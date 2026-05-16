-- Latest spot price per instance_type+region for GPU families
create or replace function latest_aws_spot_prices()
returns table(instance_type text, region text, price_usd numeric)
language sql stable as $$
  select distinct on (instance_type, region)
    instance_type, region, price_usd
  from spot_price_history
  where instance_type similar to '(g4dn|g5|g6|p3|p4d|p4de|p5)\.%'
  order by instance_type, region, timestamp desc;
$$;

-- Latest retail price per arm_sku_name+region for GPU SKUs
create or replace function latest_azure_spot_prices()
returns table(arm_sku_name text, sku_name text, region text, retail_price numeric)
language sql stable as $$
  select distinct on (arm_sku_name, region)
    arm_sku_name, sku_name, region, retail_price
  from azure_spot_prices
  where
    arm_sku_name ilike '%T4%'   or
    arm_sku_name ilike '%A10%'  or
    arm_sku_name ilike '%L4%'   or
    arm_sku_name ilike '%V100%' or
    arm_sku_name ilike '%A100%' or
    arm_sku_name ilike '%H100%'
  order by arm_sku_name, region, fetched_at desc;
$$;

-- Latest eviction rate per skuName+location
create or replace function latest_azure_eviction_rates()
returns table("skuName" text, location text, "evictionRate" text)
language sql stable as $$
  select distinct on ("skuName", location)
    "skuName", location, "evictionRate"
  from azure_spot_eviction_rates
  order by "skuName", location, fetched_at desc;
$$;
