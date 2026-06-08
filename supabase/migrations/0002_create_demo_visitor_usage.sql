create table if not exists public.demo_visitor_usage (
  visitor_key_hash text primary key,
  turns_used integer not null default 0 check (turns_used >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.demo_visitor_usage enable row level security;

create or replace function public.consume_demo_chat_turn(
  p_visitor_key_hash text,
  p_limit integer
)
returns table (
  turns_used integer,
  remaining integer,
  exhausted boolean
)
language plpgsql
set search_path = public
as $$
declare
  consumed_turns integer;
begin
  if p_visitor_key_hash is null or length(trim(p_visitor_key_hash)) = 0 then
    raise exception 'visitor key hash is required';
  end if;

  if p_limit < 1 then
    raise exception 'demo chat turn limit must be positive';
  end if;

  insert into public.demo_visitor_usage (
    visitor_key_hash,
    turns_used
  )
  values (
    p_visitor_key_hash,
    1
  )
  on conflict (visitor_key_hash) do update
    set turns_used = public.demo_visitor_usage.turns_used + 1,
        last_seen_at = now()
    where public.demo_visitor_usage.turns_used < p_limit
  returning public.demo_visitor_usage.turns_used into consumed_turns;

  if consumed_turns is null then
    select public.demo_visitor_usage.turns_used
      into consumed_turns
      from public.demo_visitor_usage
      where public.demo_visitor_usage.visitor_key_hash = p_visitor_key_hash;

    return query
      select consumed_turns, 0, true;
    return;
  end if;

  return query
    select consumed_turns, greatest(p_limit - consumed_turns, 0), false;
end;
$$;
