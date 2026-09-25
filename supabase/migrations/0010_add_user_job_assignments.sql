-- 0010_add_user_job_assignments.sql — job-level permission for Hiring Managers

create table if not exists public.user_job_assignments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists user_job_assignments_user_idx on public.user_job_assignments(user_id);
create index if not exists user_job_assignments_job_idx on public.user_job_assignments(job_id);

-- Enable RLS (Hiring Managers only see assigned jobs)
alter table public.user_job_assignments enable row level security;
