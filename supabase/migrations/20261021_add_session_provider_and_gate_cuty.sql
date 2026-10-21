alter table public.iu_unlock_sessions
  add column if not exists provider text not null default 'workink'
  check (provider in ('workink', 'cuty'));

insert into public.iu_settings (key, value, updated_at, updated_by)
values ('provider_cuty_enabled', 'false'::jsonb, now(), 'system-safety-gate')
on conflict (key) do update
set value = 'false'::jsonb, updated_at = now(), updated_by = 'system-safety-gate';
