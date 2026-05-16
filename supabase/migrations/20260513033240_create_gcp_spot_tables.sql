-- GCP spot/preemptible VM prices from the Cloud Billing Catalog API
-- Upserted on sku_id — one row per SKU, overwritten when price changes
create table if not exists gcp_spot_prices (
  sku_id            text        primary key,
  description       text,
  resource_family   text,        -- e.g. "Compute", "Memory"
  resource_group    text,        -- e.g. "CPU", "RAM", "GPU"
  usage_type        text,        -- "Preemptible" or "Spot"
  regions           jsonb,       -- array of region strings
  price_usd_per_hour numeric,
  effective_time    text         -- ISO timestamp of last price change
);

create index if not exists gcp_spot_prices_usage_type_idx
  on gcp_spot_prices (usage_type);
