create table if not exists aws_connections (
  id           uuid primary key default gen_random_uuid(),
  external_id  text unique not null default gen_random_uuid()::text,
  role_arn     text,
  account_id   text,
  status       text not null default 'pending', -- pending | connected | error
  error        text,
  connected_at timestamptz,
  created_at   timestamptz not null default now()
);
