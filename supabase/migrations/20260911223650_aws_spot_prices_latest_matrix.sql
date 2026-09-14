-- latest_aws_spot_prices() previously ran a DISTINCT ON over the entire
-- spot_price_history table (655k+ rows and growing) on every call. Under
-- service_role (no statement_timeout) this was slow-but-invisible (~0.3-1.3s);
-- under anon (3s statement_timeout) the planner picks a parallel seq scan +
-- disk sort and it times out outright. The ~35% filter selectivity means no
-- amount of indexing the history table fixes this — it needs a bounded
-- "latest per instance_type+region" table maintained incrementally instead
-- of recomputed from full history on every read.

create table if not exists aws_spot_prices_latest (
  instance_type text not null,
  region text not null,
  price_usd numeric not null,
  updated_at timestamptz not null,
  primary key (instance_type, region)
);

alter table aws_spot_prices_latest enable row level security;

drop policy if exists "aws_spot_prices_latest_public_read" on aws_spot_prices_latest;
create policy "aws_spot_prices_latest_public_read"
  on aws_spot_prices_latest for select to anon, authenticated using (true);

grant select on aws_spot_prices_latest to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on aws_spot_prices_latest from anon, authenticated;

-- Backfill from current history.
insert into aws_spot_prices_latest (instance_type, region, price_usd, updated_at)
select distinct on (instance_type, region)
  instance_type, region, price_usd, "timestamp"
from spot_price_history
order by instance_type, region, "timestamp" desc
on conflict (instance_type, region) do update
  set price_usd = excluded.price_usd,
      updated_at = excluded.updated_at
  where excluded.updated_at >= aws_spot_prices_latest.updated_at;

-- Keep it in sync incrementally as the scraper ingests new rows.
create or replace function _sync_aws_spot_prices_latest() returns trigger
language plpgsql as $$
begin
  insert into aws_spot_prices_latest (instance_type, region, price_usd, updated_at)
  values (new.instance_type, new.region, new.price_usd, new."timestamp")
  on conflict (instance_type, region) do update
    set price_usd = excluded.price_usd,
        updated_at = excluded.updated_at
    where excluded.updated_at >= aws_spot_prices_latest.updated_at;
  return new;
end;
$$;

drop trigger if exists trg_sync_aws_spot_prices_latest on spot_price_history;
create trigger trg_sync_aws_spot_prices_latest
  after insert or update on spot_price_history
  for each row execute function _sync_aws_spot_prices_latest();

-- Same signature/filter/output as before — callers see no behavior change,
-- just a scan over a few hundred rows instead of the full history table.
create or replace function latest_aws_spot_prices()
returns table(instance_type text, region text, price_usd numeric)
language sql stable as $$
  select instance_type, region, price_usd
  from aws_spot_prices_latest
  where instance_type similar to '(g4dn|g5|g6|p3|p4d|p4de|p5)\.%';
$$;
