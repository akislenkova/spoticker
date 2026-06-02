-- RunPod interruptible (spot) GPU prices from the public GraphQL API.
-- One row per (gpu_type_id, cloud_tier); overwritten on each scrape.
create table if not exists runpod_spot_prices (
  gpu_type_id            text        not null,
  cloud_tier             text        not null check (cloud_tier in ('community', 'secure')),
  display_name           text,
  memory_gb              integer,
  spot_price_usd_per_gpu numeric     not null,
  on_demand_price_usd    numeric,
  stock_status           text,
  fetched_at             timestamptz not null,
  primary key (gpu_type_id, cloud_tier)
);

create index if not exists runpod_spot_prices_fetched_at_idx
  on runpod_spot_prices (fetched_at desc);

create index if not exists runpod_spot_prices_cloud_tier_idx
  on runpod_spot_prices (cloud_tier);
