-- Vast.ai interruptible (bid) GPU prices from the public REST API.
-- One row per (gpu_label, cloud_tier); community = unverified hosts, secure = verified.
create table if not exists vast_spot_prices (
  gpu_label              text        not null,
  cloud_tier             text        not null check (cloud_tier in ('community', 'secure')),
  gpu_name               text,
  display_name           text,
  gpu_ram_mb             integer,
  spot_price_usd_per_gpu numeric     not null,
  min_bid_usd_per_gpu    numeric,
  reliability            numeric,
  offer_count            integer,
  fetched_at             timestamptz not null,
  primary key (gpu_label, cloud_tier)
);

create index if not exists vast_spot_prices_fetched_at_idx
  on vast_spot_prices (fetched_at desc);

create index if not exists vast_spot_prices_cloud_tier_idx
  on vast_spot_prices (cloud_tier);
