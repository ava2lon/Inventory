-- Inventory's compatibility persistence layer.
-- Additive only: does not alter any existing Merca, n8n, or MediaRouter objects.

create table public.inv_kv (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key like 'inv:%' and key not like 'inv:op:v1:%'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index inv_kv_user_updated_idx
  on public.inv_kv (user_id, updated_at desc);

alter table public.inv_kv enable row level security;

create policy "Inventory KV: read own data"
  on public.inv_kv for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Inventory KV: insert own data"
  on public.inv_kv for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Inventory KV: update own data"
  on public.inv_kv for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Inventory KV: delete own data"
  on public.inv_kv for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.inv_kv from public, anon, authenticated;
grant select, insert, update, delete on table public.inv_kv to authenticated;

create table public.inv_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  clock bigint not null check (clock > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index inv_operations_user_clock_idx
  on public.inv_operations (user_id, clock, id);

alter table public.inv_operations enable row level security;

create policy "Inventory operations: read own journal"
  on public.inv_operations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Inventory operations: append own journal"
  on public.inv_operations for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- The operation journal is append-only for authenticated clients.
revoke all on table public.inv_operations from public, anon, authenticated;
grant select, insert on table public.inv_operations to authenticated;
