-- Restore the optimised latest_azure_spot_prices() that joins on max(fetched_at)
-- so it only scans the latest scrape batch and stays well under the PostgREST 1000-row cap.
-- CPU SKUs are now fetched via the direct-query path in matrix.ts instead of this RPC.
create or replace function latest_azure_spot_prices()
returns table(arm_sku_name text, sku_name text, region text, retail_price numeric)
language sql stable
set search_path = public
as $$
  with latest_ts as (
    select max(fetched_at) as ts from azure_spot_prices
  )
  select distinct on (p.arm_sku_name, p.region)
    p.arm_sku_name,
    p.sku_name,
    p.region,
    p.retail_price
  from azure_spot_prices p
  inner join latest_ts lb on p.fetched_at = lb.ts
  where p.arm_sku_name is not null
    and (
      p.arm_sku_name ilike '%T4%'    or
      p.arm_sku_name ilike '%A10%'   or
      p.arm_sku_name ilike '%L4%'    or
      p.arm_sku_name ilike '%L40S%'  or
      p.arm_sku_name ilike '%V100%'  or
      p.arm_sku_name ilike '%A100%'  or
      p.arm_sku_name ilike '%H100%'  or
      p.arm_sku_name ilike '%H200%'
    )
  order by p.arm_sku_name, p.region, p.fetched_at desc;
$$;

-- Also update latest_azure_eviction_rates() to include L40S, H200
create or replace function latest_azure_eviction_rates()
returns table("skuName" text, location text, "evictionRate" text)
language sql stable
set search_path = public
as $$
  with latest_ts as (
    select max(fetched_at) as ts from azure_spot_eviction_rates
  )
  select distinct on (e."skuName", e.location)
    e."skuName",
    e.location,
    e."evictionRate"
  from azure_spot_eviction_rates e
  inner join latest_ts lb on e.fetched_at = lb.ts
  where
    e."skuName" ilike '%t4%'    or
    e."skuName" ilike '%a10%'   or
    e."skuName" ilike '%l4%'    or
    e."skuName" ilike '%l40s%'  or
    e."skuName" ilike '%v100%'  or
    e."skuName" ilike '%a100%'  or
    e."skuName" ilike '%h100%'  or
    e."skuName" ilike '%h200%'  or
    e."skuName" ilike '%nc%'    or
    e."skuName" ilike '%nd%'    or
    e."skuName" ilike '%nv%'
  order by e."skuName", e.location, e.fetched_at desc;
$$;
