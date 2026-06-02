alter table nebius_spot_prices enable row level security;

drop policy if exists "nebius_spot_prices_public_read" on nebius_spot_prices;
create policy "nebius_spot_prices_public_read"
  on nebius_spot_prices for select to anon, authenticated using (true);

grant select on nebius_spot_prices to anon, authenticated;
