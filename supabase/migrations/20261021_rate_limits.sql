-- Server-side fixed-window rate limiting. Store only a keyed hash, never raw IPs.
create table if not exists public.iu_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_start)
);
create index if not exists iu_rate_limits_window_idx on public.iu_rate_limits(window_start);
alter table public.iu_rate_limits enable row level security;
revoke all on table public.iu_rate_limits from public, anon, authenticated;
grant all on table public.iu_rate_limits to service_role;

create or replace function public.consume_iu_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_window_seconds < 60 or p_window_seconds > 3600
    or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'Invalid rate limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.iu_rate_limits(key_hash, window_start, request_count, updated_at)
  values (p_key_hash, v_window_start, 1, now())
  on conflict (key_hash, window_start) do update
    set request_count = public.iu_rate_limits.request_count + 1,
        updated_at = now()
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_iu_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_iu_rate_limit(text, integer, integer) to service_role;

-- Keep new attempts attributed to Work.ink unless explicitly set by trusted server code.
alter table public.iu_link_attempts alter column provider set default 'workink';
