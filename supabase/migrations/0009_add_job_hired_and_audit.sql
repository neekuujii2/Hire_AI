-- 0009_add_job_hired_and_audit.sql – add total_hired column and audit_logs table

create extension if not exists "uuid-ossp";

-- Add total_hired counter to jobs
alter table public.jobs
  add column if not exists total_hired integer not null default 0;

-- Audit logs for email events and other actions
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'queued', -- queued / sent / failed
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs (org_id, created_at desc);
