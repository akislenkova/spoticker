-- Supabase Security Advisor: RLS disabled on public tables.
-- Pricing data: public read for anon/authenticated.
-- Telemetry + write paths: no anon/authenticated policies (service_role only via API).

-- ── Pricing / advisor (public read) ───────────────────────────────────────────

alter table spot_price_history enable row level security;
alter table spot_bid_advisor enable row level security;
alter table azure_spot_prices enable row level security;
alter table azure_spot_eviction_rates enable row level security;
alter table gcp_spot_prices enable row level security;

drop policy if exists "spot_price_history_public_read" on spot_price_history;
create policy "spot_price_history_public_read"
  on spot_price_history for select to anon, authenticated using (true);

drop policy if exists "spot_bid_advisor_public_read" on spot_bid_advisor;
create policy "spot_bid_advisor_public_read"
  on spot_bid_advisor for select to anon, authenticated using (true);

drop policy if exists "azure_spot_prices_public_read" on azure_spot_prices;
create policy "azure_spot_prices_public_read"
  on azure_spot_prices for select to anon, authenticated using (true);

drop policy if exists "azure_spot_eviction_rates_public_read" on azure_spot_eviction_rates;
create policy "azure_spot_eviction_rates_public_read"
  on azure_spot_eviction_rates for select to anon, authenticated using (true);

drop policy if exists "gcp_spot_prices_public_read" on gcp_spot_prices;
create policy "gcp_spot_prices_public_read"
  on gcp_spot_prices for select to anon, authenticated using (true);

grant select on spot_price_history, spot_bid_advisor, azure_spot_prices, azure_spot_eviction_rates, gcp_spot_prices
  to anon, authenticated;

-- ── Telemetry (no public access; server uses service_role) ──────────────────

alter table monitored_vms enable row level security;
alter table heartbeats enable row level security;
alter table eviction_events enable row level security;

revoke all on monitored_vms, heartbeats, eviction_events from anon, authenticated;

-- ── View: use invoker rights so RLS on base tables applies ───────────────────

drop view if exists eviction_rates_30d;

create view eviction_rates_30d
with (security_invoker = true)
as
select
  e.region,
  e.sku,
  count(*) as evictions,
  count(*) filter (where e.evicted_at > now() - interval '7 days') as evictions_7d,
  round(
    count(*)::numeric /
    nullif(
      extract(epoch from (now() - min(m.started_at))) / 3600,
      0
    ), 4
  ) as evictions_per_hour,
  min(m.started_at) as monitoring_since
from eviction_events e
join monitored_vms m on m.region = e.region and m.sku = e.sku
where e.evicted_at > now() - interval '30 days'
group by e.region, e.sku;

-- Read via service_role only (no grant to anon/authenticated).
