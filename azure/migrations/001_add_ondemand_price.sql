-- Run once in Supabase SQL editor (or via psql) before the next Azure scraper run.
ALTER TABLE azure_spot_prices ADD COLUMN IF NOT EXISTS ondemand_price numeric;
