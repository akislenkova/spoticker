-- One row per region+sku we're monitoring
create table if not exists monitored_vms (
  id             uuid primary key default gen_random_uuid(),
  vm_id          text unique,           -- Azure resource ID, null until provisioned
  region         text not null,
  sku            text not null default 'Standard_B1s',
  status         text not null default 'pending', -- pending|running|evicted|reprovisioning
  started_at     timestamptz,
  last_heartbeat timestamptz,
  unique (region, sku)
);

-- Rolling heartbeat log (prune after 7 days — only need recent liveness)
create table if not exists heartbeats (
  id          bigserial primary key,
  vm_id       text not null,
  region      text not null,
  sku         text not null,
  received_at timestamptz not null default now()
);

create index if not exists heartbeats_vm_id_idx on heartbeats (vm_id, received_at desc);

-- Every detected eviction event
create table if not exists eviction_events (
  id               bigserial primary key,
  vm_id            text not null,
  region           text not null,
  sku              text not null,
  evicted_at       timestamptz not null default now(),
  detection_method text not null, -- 'scheduled_event' | 'missed_heartbeat'
  uptime_seconds   int            -- seconds from started_at to eviction
);

create index if not exists eviction_events_region_idx on eviction_events (region, sku, evicted_at desc);

-- View: eviction rate per region+sku over last 30 days
create or replace view eviction_rates_30d as
select
  e.region,
  e.sku,
  count(*)                                     as evictions,
  count(*) filter (where e.evicted_at > now() - interval '7 days')  as evictions_7d,
  round(
    count(*)::numeric /
    nullif(
      extract(epoch from (now() - min(m.started_at))) / 3600,
      0
    ), 4
  )                                            as evictions_per_hour,
  min(m.started_at)                            as monitoring_since
from eviction_events e
join monitored_vms m on m.region = e.region and m.sku = e.sku
where e.evicted_at > now() - interval '30 days'
group by e.region, e.sku;
