-- GPU-filtered eviction rates (avoids PostgREST 1000-row cap returning only A-series SKUs)

create or replace function latest_azure_eviction_rates()
returns table("skuName" text, location text, "evictionRate" text)
language sql stable as $$
  select distinct on ("skuName", location)
    "skuName", location, "evictionRate"
  from azure_spot_eviction_rates
  where
    "skuName" ilike '%t4%'   or
    "skuName" ilike '%a10%'  or
    "skuName" ilike '%l4%'   or
    "skuName" ilike '%v100%' or
    "skuName" ilike '%a100%' or
    "skuName" ilike '%h100%' or
    "skuName" ilike '%nc%'   or
    "skuName" ilike '%nd%'   or
    "skuName" ilike '%nv%'
  order by "skuName", location, fetched_at desc;
$$;
