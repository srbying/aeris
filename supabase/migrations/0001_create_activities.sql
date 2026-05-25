create extension if not exists pgcrypto;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_date timestamptz not null,
  activity_type text not null,
  distance_km numeric not null,
  duration_seconds integer not null,
  avg_pace_sec_per_km integer,
  avg_hr integer,
  max_hr integer,
  calories integer,
  ascent_m integer,
  vo2max_estimate numeric,
  raw_csv_row jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists activities_dedup_idx
  on public.activities (activity_date, activity_type, distance_km);
