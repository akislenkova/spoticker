alter table vast_spot_prices enable row level security;

drop policy if exists "vast_spot_prices_public_read" on vast_spot_prices;
create policy "vast_spot_prices_public_read"
  on vast_spot_prices for select to anon, authenticated using (true);

grant select on vast_spot_prices to anon, authenticated;
