-- Default table privileges left anon/authenticated with TRUNCATE, TRIGGER and
-- REFERENCES on aws_connections (TRUNCATE ignores RLS). Users only ever need
-- to read their own rows; anon needs nothing.
revoke all on aws_connections from anon, authenticated;
grant select on aws_connections to authenticated;
