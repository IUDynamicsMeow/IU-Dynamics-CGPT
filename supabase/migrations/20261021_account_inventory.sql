-- Pre-made account inventory. Credentials are server-only; browser roles have no table access.
create table if not exists public.iu_accounts (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.iu_plans(id),
 username text not null unique,
 password_value text not null,
 status text not null default 'available' check (status in ('available','claimed','disabled')),
 claimed_at timestamptz,
 claim_reference uuid unique,
 created_at timestamptz not null default now(),
 constraint iu_accounts_claim_state check ((status = 'claimed' and claimed_at is not null and claim_reference is not null) or (status <> 'claimed' and claimed_at is null and claim_reference is null))
);
create index if not exists iu_accounts_plan_status_idx on public.iu_accounts(plan_id,status);
alter table public.iu_accounts enable row level security;
revoke all on table public.iu_accounts from anon, authenticated;
grant all on table public.iu_accounts to service_role;

create or replace function public.claim_iu_account(p_session_token_hash text)
returns table(username text, password_value text, plan_slug text)
language plpgsql security definer set search_path = ''
as $$
declare
 v_session public.iu_unlock_sessions%rowtype;
 v_account public.iu_accounts%rowtype;
 v_plan_slug text;
begin
 select s.* into v_session from public.iu_unlock_sessions s where s.session_token_hash = p_session_token_hash and s.status = 'unlocked' and s.expires_at > now() for update;
 if not found then return; end if;
 select p.slug into v_plan_slug from public.iu_plans p where p.id = v_session.plan_id;
 select a.* into v_account from public.iu_accounts a where a.plan_id = v_session.plan_id and a.status = 'available' order by a.created_at, a.id for update skip locked limit 1;
 if not found then return; end if;
 update public.iu_accounts set status = 'claimed', claimed_at = now(), claim_reference = v_session.id where id = v_account.id;
 update public.iu_unlock_sessions set status = 'claimed', claimed_at = now() where id = v_session.id;
 return query select v_account.username, v_account.password_value, v_plan_slug;
end;
$$;
revoke all on function public.claim_iu_account(text) from public, anon, authenticated;
grant execute on function public.claim_iu_account(text) to service_role;
