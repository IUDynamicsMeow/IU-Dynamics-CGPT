-- Reproducible baseline schema for a fresh IU Dynamics Supabase project.
-- Existing rows and administrator allowlist entries are preserved on re-run.

create table if not exists public.iu_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('super_basic','basic','epic','ultimate')),
  display_name text not null,
  required_links integer not null default 2 check (required_links > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.iu_license_keys (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.iu_plans(id),
  key_value text not null unique,
  status text not null default 'available' check (status in ('available','claimed','disabled')),
  claimed_at timestamptz,
  claim_reference uuid unique,
  created_at timestamptz not null default now(),
  constraint iu_license_keys_claim_state check (
    (status = 'claimed' and claimed_at is not null and claim_reference is not null)
    or (status <> 'claimed' and claimed_at is null and claim_reference is null)
  )
);

create table if not exists public.iu_unlock_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.iu_plans(id),
  session_token_hash text not null unique,
  required_links integer not null check (required_links > 0),
  status text not null default 'in_progress' check (status in ('in_progress','unlocked','expired','claimed')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  unlocked_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  provider text not null default 'workink' check (provider in ('workink','cuty')),
  constraint iu_unlock_session_state check (status <> 'unlocked' or unlocked_at is not null)
);

create table if not exists public.iu_link_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.iu_unlock_sessions(id) on delete cascade,
  provider text not null default 'workink' check (provider in ('workink','cuty')),
  provider_reference text,
  short_url text,
  status text not null default 'created' check (status in ('created','pending','verified','failed')),
  verification_method text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  constraint iu_link_attempts_state check (
    (status = 'verified' and verified_at is not null)
    or (status <> 'verified' and verified_at is null)
  ),
  constraint iu_link_attempts_provider_provider_reference_key unique (provider, provider_reference)
);

create table if not exists public.iu_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.iu_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.iu_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists iu_license_keys_plan_status_idx on public.iu_license_keys(plan_id,status);
create index if not exists iu_link_attempts_session_status_idx on public.iu_link_attempts(session_id,status);
create index if not exists iu_unlock_sessions_expiry_idx on public.iu_unlock_sessions(expires_at);
create index if not exists iu_unlock_sessions_plan_id_idx on public.iu_unlock_sessions(plan_id);

alter table public.iu_plans enable row level security;
alter table public.iu_license_keys enable row level security;
alter table public.iu_unlock_sessions enable row level security;
alter table public.iu_link_attempts enable row level security;
alter table public.iu_admins enable row level security;
alter table public.iu_settings enable row level security;
alter table public.iu_admin_audit enable row level security;

revoke all on table public.iu_plans, public.iu_license_keys, public.iu_unlock_sessions,
  public.iu_link_attempts, public.iu_admins, public.iu_settings, public.iu_admin_audit
  from anon, authenticated;
grant all on table public.iu_plans, public.iu_license_keys, public.iu_unlock_sessions,
  public.iu_link_attempts, public.iu_admins, public.iu_settings, public.iu_admin_audit
  to service_role;

insert into public.iu_plans (slug,display_name,required_links,is_active) values
  ('super_basic','Super Basic',1,true),
  ('basic','Basic',2,true),
  ('epic','Epic',5,true),
  ('ultimate','Ultimate',10,true)
on conflict (slug) do nothing;

insert into public.iu_settings (key,value) values
  ('provider_workink_enabled','true'::jsonb),
  ('provider_cuty_enabled','false'::jsonb)
on conflict (key) do nothing;
