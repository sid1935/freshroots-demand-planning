-- Run once in the Supabase SQL editor.
-- RLS is on with no policies: only the server (service-role key) can read or write.

create table if not exists planner_decisions (
  as_of       date    not null,
  sku_id      text    not null,
  status      text    not null check (status in ('accepted', 'overridden')),
  qty         integer check (qty is null or qty >= 0),
  reason      text,
  decided_at  timestamptz not null default now(),
  primary key (as_of, sku_id)
);

create table if not exists recommendation_runs (
  as_of       date primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table planner_decisions   enable row level security;
alter table recommendation_runs enable row level security;
