-- Atomic one-time claim. The caller is the server using the Supabase service key.
-- No browser role may execute this function; service_role bypasses RLS and is never exposed client-side.
create or replace function public.claim_iu_license_key(p_session_token_hash text)
returns table(key_value text, plan_slug text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.iu_unlock_sessions%rowtype;
  v_key public.iu_license_keys%rowtype;
  v_slug text;
begin
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select s.* into v_session
  from public.iu_unlock_sessions s
  where s.session_token_hash = p_session_token_hash
  for update;

  if not found or v_session.status <> 'unlocked' or v_session.expires_at <= now() then
    return;
  end if;

  select k.* into v_key
  from public.iu_license_keys k
  where k.plan_id = v_session.plan_id and k.status = 'available'
  order by k.created_at asc, k.id asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  select p.slug into v_slug from public.iu_plans p where p.id = v_session.plan_id;

  update public.iu_license_keys
  set status = 'claimed', claimed_at = now(), claim_reference = v_session.id
  where id = v_key.id and status = 'available';

  if not found then
    return;
  end if;

  update public.iu_unlock_sessions
  set status = 'claimed', claimed_at = now()
  where id = v_session.id and status = 'unlocked';

  if not found then
    raise exception 'Session claim state changed unexpectedly';
  end if;

  return query select v_key.key_value, v_slug;
end;
$$;

revoke all on function public.claim_iu_license_key(text) from public, anon, authenticated;
grant execute on function public.claim_iu_license_key(text) to service_role;
