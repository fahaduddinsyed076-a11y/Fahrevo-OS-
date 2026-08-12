-- ============================================================================
-- Fahrevo OS — Overheads (recurring monthly fixed costs)
-- Additive migration. No existing tables/columns changed.
--
-- Overheads are a PLANNING layer only: they never insert into expenses or
-- payments, so no duplicate/automatic accounting transactions are created.
-- Actual cash impact still flows exclusively through the existing
-- expenses/payments tables when the owner records a real transaction.
-- ============================================================================

create table if not exists overheads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text not null default 'Misc',
  monthly_amount numeric(12, 2) not null check (monthly_amount >= 0),
  active_status  boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_overheads_active on overheads (active_status);

drop trigger if exists trg_overheads_updated on overheads;
create trigger trg_overheads_updated
  before update on overheads
  for each row execute function set_updated_at();

alter table overheads enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'overheads' and policyname = 'Authenticated full access'
  ) then
    create policy "Authenticated full access"
      on overheads for all
      to authenticated
      using (true) with check (true);
  end if;
end $$;
