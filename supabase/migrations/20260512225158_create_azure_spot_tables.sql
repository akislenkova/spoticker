-- spot VM price snapshots from the Azure Retail Prices API (full history retained)
create table if not exists azure_spot_prices (
  fetched_at           timestamptz  not null,
  sku_name             text         not null,  -- e.g. "D2s v3 Spot"
  arm_sku_name         text,                   -- e.g. "Standard_D2s_v3"
  region               text         not null,  -- armRegionName, e.g. "eastus"
  location             text,                   -- human-readable, e.g. "East US"
  retail_price         numeric,
  unit_price           numeric,
  currency_code        text,
  meter_name           text,
  product_name         text,
  unit_of_measure      text,
  effective_start_date text,
  primary key (sku_name, region, fetched_at)
);

create index if not exists azure_spot_prices_region_idx
  on azure_spot_prices (region, fetched_at desc);

create index if not exists azure_spot_prices_sku_idx
  on azure_spot_prices (arm_sku_name, region, fetched_at desc);

-- eviction rate snapshots from Resource Graph SpotResources (full history retained)
create table if not exists azure_spot_eviction_rates (
  fetched_at     timestamptz  not null,
  location       text         not null,  -- Azure region, e.g. "eastus"
  "skuName"      text         not null,  -- VM size, e.g. "Standard_D2s_v3"
  "evictionRate" text         not null,  -- bucket e.g. "0-5%", "5-10%", ">80%"
  primary key ("skuName", location, fetched_at)
);

create index if not exists azure_eviction_rates_location_idx
  on azure_spot_eviction_rates (location, fetched_at desc);
