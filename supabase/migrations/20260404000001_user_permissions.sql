-- app_users: mirrors auth.users so the UI can list users without service role
create table app_users (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  name      text not null default '',
  is_admin  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table app_users enable row level security;
create policy "authenticated read app_users"  on app_users for select to authenticated using (true);
create policy "authenticated write app_users" on app_users for all    to authenticated using (true) with check (true);

-- user_permissions: per-page access per user
create table user_permissions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references app_users(id) on delete cascade,
  page      text not null,
  can_view  boolean not null default true,
  can_edit  boolean not null default true,
  unique(user_id, page)
);

alter table user_permissions enable row level security;
create policy "authenticated read user_permissions"  on user_permissions for select to authenticated using (true);
create policy "authenticated write user_permissions" on user_permissions for all    to authenticated using (true) with check (true);

-- trigger: auto-populate app_users when an auth user is created/updated
create or replace function public.sync_app_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.app_users(id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do update set
    email = excluded.email,
    name  = excluded.name;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.sync_app_user();

-- Backfill existing auth users into app_users
insert into public.app_users(id, email, name)
select
  id,
  email,
  coalesce(
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;
