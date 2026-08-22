-- 家事分担アプリ v10 用
create table if not exists public.chores (
  household_id text not null,
  item_id text not null,
  name text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (household_id, item_id)
);

create table if not exists public.records (
  household_id text not null,
  item_id text not null,
  date date not null,
  person_index integer not null,
  chore_id text,
  chore_name text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (household_id, item_id)
);

create table if not exists public.household_settings (
  household_id text not null,
  setting_key text not null,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, setting_key)
);

alter table public.chores enable row level security;
alter table public.records enable row level security;
alter table public.household_settings enable row level security;

drop policy if exists "public chores access" on public.chores;
create policy "public chores access" on public.chores for all to anon using (true) with check (true);

drop policy if exists "public records access" on public.records;
create policy "public records access" on public.records for all to anon using (true) with check (true);

drop policy if exists "public settings access" on public.household_settings;
create policy "public settings access" on public.household_settings for all to anon using (true) with check (true);

alter publication supabase_realtime add table public.chores;
alter publication supabase_realtime add table public.records;
alter publication supabase_realtime add table public.household_settings;
