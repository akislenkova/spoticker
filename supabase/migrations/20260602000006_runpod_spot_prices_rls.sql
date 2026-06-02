alter table runpod_spot_prices enable row level security;

drop policy if exists "runpod_spot_prices_public_read" on runpod_spot_prices;
create policy "runpod_spot_prices_public_read"
  on runpod_spot_prices for select to anon, authenticated using (true);

grant select on runpod_spot_prices to anon, authenticated;
