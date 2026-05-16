create table if not exists spot_price_history (
  az             text        not null,
  instance_type  text        not null,
  region         text        not null,
  price_usd      numeric     not null,
  timestamp      timestamptz not null,
  primary key (az, instance_type, timestamp)
);

create table if not exists spot_bid_advisor (
  fetched_at  timestamptz  primary key,
  data        jsonb        not null
);
