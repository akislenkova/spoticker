-- Nebius preemptible GPU prices from the public Compute pricing docs.
-- One row per (platform_slug, region); prices are already per-GPU/hr.
create table if not exists nebius_spot_prices (
  platform_slug             text        not null,
  region                    text        not null,
  model_name                text,
  gpu_label                 text        not null,
  gpu_count                 integer     not null default 1,
  spot_price_usd_per_gpu    numeric     not null,
  on_demand_price_usd       numeric,
  spot_savings_pct          numeric,
  fetched_at                timestamptz not null,
  primary key (platform_slug, region)
);

create index if not exists nebius_spot_prices_fetched_at_idx
  on nebius_spot_prices (fetched_at desc);

create index if not exists nebius_spot_prices_gpu_label_idx
  on nebius_spot_prices (gpu_label);

create index if not exists nebius_spot_prices_region_idx
  on nebius_spot_prices (region);
