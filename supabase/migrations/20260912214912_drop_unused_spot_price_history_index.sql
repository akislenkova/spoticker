-- idx_spot_price_history_matrix (added in 20260911223128) was an
-- intermediate fix for latest_aws_spot_prices() before the follow-up
-- migration (20260911223650) moved that RPC to read from the small
-- aws_spot_prices_latest table instead. No remaining query matches this
-- index's (instance_type, region, timestamp desc) shape — ui/lib/matrix.ts's
-- only direct read of spot_price_history is an unfiltered
-- `order by timestamp desc limit 1` freshness check, which this composite
-- index doesn't serve. Keeping it would just tax every scraper insert for no
-- read benefit.
drop index if exists idx_spot_price_history_matrix;
