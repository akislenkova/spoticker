-- Per-user AWS connections with row-level security

alter table aws_connections
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Drop orphaned anonymous connections from pre-auth flow
delete from aws_connections where user_id is null;

alter table aws_connections
  alter column user_id set not null;

alter table aws_connections enable row level security;

create policy "aws_connections_select_own"
  on aws_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "aws_connections_insert_own"
  on aws_connections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "aws_connections_update_own"
  on aws_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on aws_connections to authenticated;
