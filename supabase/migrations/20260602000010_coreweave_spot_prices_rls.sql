alter table coreweave_spot_prices enable row level security;

drop policy if exists "coreweave_spot_prices_public_read" on coreweave_spot_prices;
create policy "coreweave_spot_prices_public_read"
  on coreweave_spot_prices for select to anon, authenticated using (true);

grant select on coreweave_spot_prices to anon, authenticated;
