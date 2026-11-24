-- Sign-in no longer uses email. /connect signs visitors in anonymously, so a
-- Supabase user id is free to mint and can't be the unit of the free-tier
-- quota. The quota is now keyed on a server-derived subject string:
--   'aws:<account_id>'  the verified AWS account behind the user's connection
--   'ip:<address>'      visitors without a connected AWS account
-- plan_usage was first applied on 2026-11-23 and never used (nobody could sign in),
-- so it is recreated rather than migrated.

drop function if exists consume_plan_quota(uuid, integer);
drop function if exists refund_plan_quota(uuid);
drop table if exists plan_usage;

create table plan_usage (
  subject text not null check (subject ~ '^(aws|ip):.+$'),
  day     date not null,
  count   integer not null default 0 check (count >= 0),
  primary key (subject, day)
);

-- Written and read only through the functions below, by the Next.js server
-- with the service-role key. RLS on with no policies: nobody else gets rows.
alter table plan_usage enable row level security;
revoke all on plan_usage from anon, authenticated;

-- Atomically takes one unit of today's quota. Returns allowed=false (and the
-- current count) once the subject has reached p_limit; concurrent calls can't
-- both take the last unit because the increment is a single conditional upsert.
create or replace function consume_plan_quota(p_subject text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into public.plan_usage as u (subject, day, count)
  values (p_subject, v_day, 1)
  on conflict (subject, day)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into v_count;

  if v_count is not null then
    return query select true, v_count;
  else
    return query
      select false, u.count from public.plan_usage u
      where u.subject = p_subject and u.day = v_day;
  end if;
end;
$$;

-- Gives back one unit when an analysis fails on our side (plan service error).
create or replace function refund_plan_quota(p_subject text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.plan_usage
  set count = count - 1
  where subject = p_subject
    and day = (now() at time zone 'utc')::date
    and count > 0;
$$;

revoke execute on function consume_plan_quota(text, integer) from public, anon, authenticated;
revoke execute on function refund_plan_quota(text) from public, anon, authenticated;
grant execute on function consume_plan_quota(text, integer) to service_role;
grant execute on function refund_plan_quota(text) to service_role;

-- aws_connections: with anonymous sign-in, anyone can hold the authenticated
-- role, and the old insert/update policies let a user write any column of
-- their own rows, e.g. status='connected' with someone else's account_id.
-- All writes already go through the server (service role), which sets
-- account_id only after AssumeRole succeeds, so users keep read access only.
drop policy if exists "aws_connections_insert_own" on aws_connections;
drop policy if exists "aws_connections_update_own" on aws_connections;
revoke insert, update, delete on aws_connections from anon, authenticated;
