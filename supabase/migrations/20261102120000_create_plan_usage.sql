-- Per-user daily Plan Mode usage, for the free-tier limit (N analyses per UTC day).
-- Written only through the functions below, which the Next.js server calls
-- with the service-role key; users may read their own rows.

create table if not exists plan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table plan_usage enable row level security;

create policy "plan_usage_select_own"
  on plan_usage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on plan_usage from anon, authenticated;
grant select on plan_usage to authenticated;

-- Atomically takes one unit of today's quota. Returns allowed=false (and the
-- current count) once the user has reached p_limit; concurrent calls can't
-- both take the last unit because the increment is a single conditional upsert.
create or replace function consume_plan_quota(p_user_id uuid, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into public.plan_usage as u (user_id, day, count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, day)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into v_count;

  if v_count is not null then
    return query select true, v_count;
  else
    return query
      select false, u.count from public.plan_usage u
      where u.user_id = p_user_id and u.day = v_day;
  end if;
end;
$$;

-- Gives back one unit when an analysis fails on our side (plan service error),
-- so users don't lose quota to outages.
create or replace function refund_plan_quota(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.plan_usage
  set count = count - 1
  where user_id = p_user_id
    and day = (now() at time zone 'utc')::date
    and count > 0;
$$;

revoke execute on function consume_plan_quota(uuid, integer) from public, anon, authenticated;
revoke execute on function refund_plan_quota(uuid) from public, anon, authenticated;
grant execute on function consume_plan_quota(uuid, integer) to service_role;
grant execute on function refund_plan_quota(uuid) to service_role;
