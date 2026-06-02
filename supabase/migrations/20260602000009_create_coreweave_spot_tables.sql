-- CoreWeave spot/preemptible prices scraped from the public pricing page.
-- One row per (product_slug, region); GPU prices normalized to per-GPU/hr.
create table if not exists coreweave_spot_prices (
  product_slug              text        not null,
  region                    text        not null check (region in ('us', 'eu')),
  model_name                text,
  gpu_label                 text        not null,
  gpu_count                 integer,
  spot_price_usd_per_gpu    numeric     not null,
  spot_price_usd_instance   numeric,
  on_demand_price_usd       numeric,
  spot_savings_pct          numeric,
  fetched_at                timestamptz not null,
  primary key (product_slug, region)
);

create index if not exists coreweave_spot_prices_fetched_at_idx
  on coreweave_spot_prices (fetched_at desc);

create index if not exists coreweave_spot_prices_gpu_label_idx
  on coreweave_spot_prices (gpu_label);

create index if not exists coreweave_spot_prices_region_idx
  on coreweave_spot_prices (region);
