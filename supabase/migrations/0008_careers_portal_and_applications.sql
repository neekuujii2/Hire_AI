-- 0008_careers_portal_and_applications.sql — Careers portal and application pipeline
--
-- Adds:
-- 1. applications — tracks public and manual application submission
-- 2. candidate_profiles — global candidate profiles (not org-scoped)
-- 3. application_status_history — audit trail for application status changes
-- 4. career_page_views — analytics for career page visits
--
-- Updates jobs table with publication and salary fields
--
-- Candidate profiles are globally accessible (candidates apply without org login)
-- Applications enforce org-scoped RLS when tracking assigned opportunities

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- UPDATE EXISTING: jobs table — add publication and salary fields
-- =============================================================================

alter table public.jobs
  add column if not exists salary_min integer,
  add column if not exists salary_max integer,
  add column if not exists salary_currency text not null default 'USD'
    check (salary_currency in ('USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD')),
  add column if not exists salary_visible boolean not null default false,
  add column if not exists location_type text not null default 'onsite'
    check (location_type in ('onsite', 'remote', 'hybrid')),
  add column if not exists responsibilities text,
  add column if not exists requirements text,
  add column if not exists nice_to_have text;

-- Publish status tracking
alter table public.jobs
  add column if not exists public_apply_enabled boolean not null default false,
  add column if not exists public_apply_token text unique default encode(gen_random_bytes(16), 'hex'),
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists application_deadline timestamptz,
  add column if not exists skills_required text[] default '{}'::text[],
  add column if not exists total_applications integer not null default 0;

-- =============================================================================
-- NEW TABLE: candidate_profiles (global, not org-scoped)
-- =============================================================================

create table if not exists public.candidate_profiles (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  name text,
  phone text,
  linkedin_url text,
  portfolio_url text,
  location text,
  cv_url text,
  cv_text text,
  cv_parsed jsonb,
  total_experience_years numeric(4,1),
  skills text[] default '{}'::text[],
  clerk_user_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidate_profiles_email_idx
  on public.candidate_profiles (email);

-- =============================================================================
-- NEW TABLE: applications (org-scoped, tracks public and manual applications)
-- =============================================================================

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete set null,
  candidate_profile_id uuid not null references public.candidate_profiles(id) on delete restricted,
  status text not null default 'applied'
    check (status in (
      'applied', 'screening', 'ai_screening', 'ai_interview', 'hr_review',
      'shortlisted', 'rejected', 'hired'
    )),
  source text not null default 'careers_portal'
    check (source in ('careers_portal', 'manual_invite', 'csv_import', 'public_link')),
  cover_letter text,
  applied_at timestamptz not null default now(),
  status_changed_at timestamptz,
  status_changed_by uuid references public.users(id) on delete set null,
  session_id text references public.sessions(id) on delete set null,  -- session.id is text
  ai_score numeric(5,2),
  ai_recommendation text,
  ai_screening_result jsonb,
  ai_screening_at timestamptz,
  auto_invited boolean not null default false,
  hr_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_job_status_idx
  on public.applications (org_id, job_id, status);
create index if not exists applications_candidate_profile_id_idx
  on public.applications (candidate_profile_id);
create index if not exists applications_job_id_idx
  on public.applications (org_id, job_id);
create index if not exists applications_status_created_idx
  on public.applications (org_id, status, created_at desc);

-- =============================================================================
-- NEW TABLE: application_status_history (audit trail)
-- =============================================================================

create table if not exists public.application_status_history (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  changed_by uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists application_status_history_application_idx
  on public.application_status_history (application_id, created_at desc);

-- =============================================================================
-- NEW TABLE: career_page_views (analytics)
-- =============================================================================

create table if not exists public.career_page_views (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  session_token text not null,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists career_page_views_org_idx
  on public.career_page_views (org_id, created_at desc);
create index if not exists career_page_views_job_session_idx
  on public.career_page_views (job_id, session_token);
create index if not exists career_page_views_session_token_idx
  on public.career_page_views (session_token);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at on applications and candidate_profiles
create or replace function public.touch_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger if not exists applications_before_update
  before update on public.applications
  for each row
  execute function public.touch_applications_updated_at();

create or replace function public.touch_candidate_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger if not exists candidate_profiles_before_update
  before update on public.candidate_profiles
  for each row
  execute function public.touch_candidate_profiles_updated_at();

-- On applications.status change, insert into application_status_history
create or replace function public.watch_applications_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    insert into public.application_status_history (
      application_id,
      from_status,
      to_status,
      changed_by,
      reason
    ) values (
      new.id,
      old.status,
      new.status,
      case when new.status_changed_by is not null then new.status_changed_by else null end,
      case
        when new.ai_recommendation is not null and new.status = 'rejected'
          then 'Auto-rejected based on AI assessment'
        when new.status_changed_by is not null
          then null
        else null
      end
    );
  end if;
  return new;
end;
$$;

create trigger if not exists applications_status_change_watch
  after update on public.applications
  for each row
  execute function public.watch_applications_status_change();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- candidate_profiles: global access (candidates don't need org login to create profile)
alter table public.candidate_profiles enable row level security;

-- Anyone can search candidate_profiles (by email or skills for matching)
drop policy if exists candidate_profiles_search on public.candidate_profiles;
create policy candidate_profiles_search on public.candidate_profiles
  for select
  using (true);

-- Candidates can update only their own profile
drop policy if exists candidate_profiles_own_write on public.candidate_profiles;
create policy candidate_profiles_own_write on public.candidate_profiles
  for update
  using (auth.jwt() ->> 'user_id' = clerk_user_id)
  with check (auth.jwt() ->> 'user_id' = clerk_user_id);

-- Applications: org-scoped RLS
alter table public.applications enable row level security;

drop policy if exists applications_org_scoped on public.applications;
create policy applications_org_scoped on public.applications
  for all
  using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

-- application_status_history: org-scoped (linked to org's applications)
alter table public.application_status_history enable row level security;

drop policy if exists application_status_history_org_scoped on public.application_status_history;
create policy application_status_history_org_scoped on public.application_status_history
  for all
  using (
    application_id in (
      select id from public.applications
      where public.has_clerk_org(org_id)
    )
  )
  with check (
    application_id in (
      select id from public.applications
      where public.has_clerk_org(org_id)
    )
  );

-- career_page_views: org-scoped
alter table public.career_page_views enable row level security;

drop policy if exists career_page_views_org_scoped on public.career_page_views;
create policy career_page_views_org_scoped on public.career_page_views
  for all
  using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

-- =============================================================================
-- AUTO-PUBLISH: when job is created with public_apply_enabled in request data
-- This is handled by the app layer; optionally auto-set published_at
-- =============================================================================

-- =============================================================================
-- INDEXES (additional for query performance)
-- =============================================================================

create index if not exists applications_ai_score_idx
  on public.applications (org_id, ai_score desc);

create index if not exists candidate_profiles_skills_idx
  on public.candidate_profiles using gist (skills gin_trgm_ops);

create index if not exists candidate_profiles_location_idx
  on public.candidate_profiles (location);

create index if not exists applications_updated_at_idx
  on public.applications (status_changed_at desc);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

create or replace function public.increment_job_applications(job_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update public.jobs
  set
    total_applications = total_applications + 1,
    updated_at = now()
  where id = job_id;
end;
$$;

-- Validation function for state transitions
create or replace function public.validate_application_status_transition(
  current_status text,
  new_status text
)
returns boolean
language plpgsql
stable
as $$
begin
  -- Validation rules for state transitions
  if new_status = 'screening' then
    if current_status not in ('applied', 'screening', 'ai_screening') then
      raise exception 'Invalid transition from % to %', current_status, new_status;
    end if;
  elsif new_status = 'ai_screening' then
    if current_status not in ('applied', 'screening', 'ai_screening') then
      raise exception 'Invalid transition from % to %', current_status, new_status;
    end if;
  elsif new_status = 'ai_interview' then
    if current_status not in ('ai_screening', 'hr_review', 'screening') then
      raise exception 'Invalid transition from % to %', current_status, new_status;
    end if;
  elsif new_status = 'shortlisted' then
    if current_status not in ('screening', 'ai_screening', 'ai_interview', 'hr_review') then
      raise exception 'Invalid transition from % to %', current_status, new_status;
    end if;
  elsif new_status = 'rejected' then
    if current_status = 'hired' then
      raise exception 'Cannot reject an hired applicant';
    end if;
  elsif new_status = 'hired' then
    if current_status = 'rejected' then
      raise exception 'Cannot hire a rejected applicant';
    end if;
  end if;
  
  return true;
end;
$$;

-- Trigger function that uses the validation
create or replace function public.watch_applications_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    -- Validate the transition
    perform public.validate_application_status_transition(old.status, new.status);
    
    insert into public.application_status_history (
      application_id,
      from_status,
      to_status,
      changed_by,
      reason
    ) values (
      new.id,
      old.status,
      new.status,
      case when new.status_changed_by is not null then new.status_changed_by else null end,
      case
        when new.ai_recommendation is not null and new.status = 'rejected'
          then 'Auto-rejected based on AI assessment'
        when new.status_changed_by is not null
          then null
        else null
      end
    );
  end if;
  return new;
end;
$$;

-- =============================================================================
-- INSERT EXAMPLE DATA (optional, commented out)
-- =============================================================================

/*
-- Uncomment to seed test data:
insert into public.candidate_profiles (email, name, phone, location, skills, total_experience_years)
values (
  'candidate@example.com',
  'Jane Doe',
  '+1-555-0123',
  'San Francisco, CA',
  array['python', 'machine-learning', 'sql', 'typescript'],
  5.0
) returning id;

-- This would return a new candidate profile ID for testing applications
*/
