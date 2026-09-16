-- 0007_hireai_schema.sql — HireAI multi-tenant interview schema.
--
-- Clerk organization membership is represented by the `org_id` claim in the
-- Supabase JWT. The agent continues to use the service-role key, which bypasses
-- RLS; browser queries are restricted by the policies below.
--
-- The existing DeepInterview sessions table uses text ids such as
-- `sess_<uuid>`. Its id type is intentionally preserved so this migration does
-- not break the current Python agent. All new tables use UUID primary keys.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations and tenant configuration
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  clerk_org_id text not null unique,
  name text not null,
  slug text not null unique,
  logo_url text,
  plan text not null default 'starter'
    check (plan in ('starter', 'pro', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_configs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  max_warning_limit integer not null default 3 check (max_warning_limit > 0),
  interview_duration_min integer not null default 30 check (interview_duration_min > 0),
  proctoring_enabled boolean not null default true,
  recording_enabled boolean not null default true,
  recording_retention_days integer not null default 90 check (recording_retention_days > 0),
  custom_branding boolean not null default false,
  max_concurrent_interviews integer not null default 10 check (max_concurrent_interviews > 0),
  allowed_languages text[] not null default array['en']::text[],
  auto_score_enabled boolean not null default true,
  notify_hr_on_complete boolean not null default true,
  notify_hr_on_terminate boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text not null unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs, question banks, and candidates
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  department text,
  location text,
  job_description text not null,
  jd_file_url text,
  seniority_level text not null default 'mid'
    check (seniority_level in ('intern', 'junior', 'mid', 'senior', 'lead', 'principal')),
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'freelance')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'closed')),
  interview_duration_min integer not null default 30 check (interview_duration_min > 0),
  language text not null default 'en',
  persona_name text not null default 'Alex',
  persona_tone text not null default 'professional'
    check (persona_tone in ('professional', 'conversational', 'technical', 'friendly')),
  max_warning_limit integer not null default 3 check (max_warning_limit > 0),
  proctoring_enabled boolean not null default true,
  invite_expiry_hours integer not null default 72 check (invite_expiry_hours > 0),
  require_cv_upload boolean not null default false,
  instant_feedback boolean not null default false,
  interview_config jsonb not null default '{}'::jsonb,
  public_apply_enabled boolean not null default false,
  public_apply_token text unique default encode(gen_random_bytes(16), 'hex'),
  total_invited integer not null default 0,
  total_completed integer not null default 0,
  total_shortlisted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_banks (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  name text not null,
  category text,
  questions jsonb not null default '[]'::jsonb,
  rubric jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  email text not null,
  name text,
  phone text,
  cv_url text,
  cv_text text,
  linkedin_url text,
  pipeline_status text not null default 'invited'
    check (pipeline_status in (
      'invited', 'link_opened', 'interview_started', 'interview_completed',
      'interview_terminated', 'shortlisted', 'rejected', 'on_hold', 'hired'
    )),
  invite_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invite_sent_at timestamptz,
  invite_expires_at timestamptz,
  link_opened_at timestamptz,
  invited_by uuid references public.users(id) on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'csv_bulk', 'public_apply', 'ats_sync')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, email)
);

-- ---------------------------------------------------------------------------
-- Sessions and interview artifacts
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists candidate_id uuid references public.candidates(id) on delete set null,
  add column if not exists livekit_room_name text,
  add column if not exists livekit_token text,
  add column if not exists prep_started_at timestamptz,
  add column if not exists prep_completed_at timestamptz,
  add column if not exists interview_started_at timestamptz,
  add column if not exists interview_ended_at timestamptz,
  add column if not exists duration_seconds integer,
  add column if not exists question_plan jsonb,
  add column if not exists questions_asked integer not null default 0,
  add column if not exists questions_total integer not null default 0,
  add column if not exists warning_count integer not null default 0,
  add column if not exists max_warning_limit integer not null default 3,
  add column if not exists termination_reason text,
  add column if not exists config_snapshot jsonb not null default '{}'::jsonb;

create unique index if not exists sessions_livekit_room_name_idx
  on public.sessions (livekit_room_name)
  where livekit_room_name is not null;

create table if not exists public.proctoring_events (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null references public.sessions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'tab_switch', 'no_face_visible', 'multiple_faces', 'multiple_voices',
      'copy_paste', 'screen_share_attempt', 'warning_issued', 'interview_terminated'
    )),
  warning_number integer,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcripts (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique references public.sessions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  turns jsonb not null default '[]'::jsonb,
  full_text text not null default '',
  word_count integer not null default 0,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(full_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scorecards (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique references public.sessions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  overall_score numeric(5,2) check (overall_score between 0 and 100),
  overall_grade text,
  recommendation text check (recommendation in ('strong_yes', 'yes', 'maybe', 'no', 'strong_no')),
  competency_scores jsonb not null default '{}'::jsonb,
  question_scores jsonb not null default '[]'::jsonb,
  strengths text[] not null default '{}'::text[],
  areas_to_improve text[] not null default '{}'::text[],
  ai_summary text,
  follow_up_questions text[] not null default '{}'::text[],
  proctoring_summary jsonb not null default '{}'::jsonb,
  scored_by text not null default 'ai'
    check (scored_by in ('ai', 'human', 'ai_human_hybrid')),
  human_notes text,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordings (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique references public.sessions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_url text,
  audio_url text,
  duration_seconds integer,
  file_size_bytes bigint,
  resolution text,
  codec text default 'h264',
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed', 'deleted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists organizations_clerk_org_id_idx
  on public.organizations (clerk_org_id);
create index if not exists jobs_org_status_idx
  on public.jobs (org_id, status, created_at desc);
create index if not exists candidates_pipeline_idx
  on public.candidates (org_id, job_id, pipeline_status, created_at desc);
create index if not exists candidates_invite_token_idx
  on public.candidates (invite_token);
create index if not exists sessions_org_status_idx
  on public.sessions (org_id, status, created_at desc);
create index if not exists proctoring_events_session_idx
  on public.proctoring_events (org_id, session_id, occurred_at desc);
create index if not exists transcripts_search_vector_idx
  on public.transcripts using gin (search_vector);
create index if not exists scorecards_candidate_idx
  on public.scorecards (org_id, candidate_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- Timestamp triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'organizations', 'org_configs', 'users', 'jobs', 'question_banks',
    'candidates', 'sessions', 'proctoring_events', 'transcripts',
    'scorecards', 'recordings'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = target_table
        and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists %I_touch on public.%I', target_table, target_table);
      execute format(
        'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
        target_table, target_table
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clerk-aware RLS
-- ---------------------------------------------------------------------------

create or replace function public.current_clerk_org_id()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'org_id', '');
$$;

create or replace function public.has_clerk_org(target_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = target_org_id
      and o.clerk_org_id = public.current_clerk_org_id()
  );
$$;

alter table public.organizations enable row level security;
alter table public.org_configs enable row level security;
alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.question_banks enable row level security;
alter table public.candidates enable row level security;
alter table public.sessions enable row level security;
alter table public.proctoring_events enable row level security;
alter table public.transcripts enable row level security;
alter table public.scorecards enable row level security;
alter table public.recordings enable row level security;

drop policy if exists organizations_clerk_org on public.organizations;
create policy organizations_clerk_org on public.organizations
  for all using (clerk_org_id = public.current_clerk_org_id())
  with check (clerk_org_id = public.current_clerk_org_id());

drop policy if exists org_configs_clerk_org on public.org_configs;
create policy org_configs_clerk_org on public.org_configs
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists users_clerk_org on public.users;
create policy users_clerk_org on public.users
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists jobs_clerk_org on public.jobs;
create policy jobs_clerk_org on public.jobs
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists question_banks_clerk_org on public.question_banks;
create policy question_banks_clerk_org on public.question_banks
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists candidates_clerk_org on public.candidates;
create policy candidates_clerk_org on public.candidates
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists sessions_clerk_org on public.sessions;
create policy sessions_clerk_org on public.sessions
  for all using (org_id is not null and public.has_clerk_org(org_id))
  with check (org_id is not null and public.has_clerk_org(org_id));

drop policy if exists proctoring_events_clerk_org on public.proctoring_events;
create policy proctoring_events_clerk_org on public.proctoring_events
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists transcripts_clerk_org on public.transcripts;
create policy transcripts_clerk_org on public.transcripts
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists scorecards_clerk_org on public.scorecards;
create policy scorecards_clerk_org on public.scorecards
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));

drop policy if exists recordings_clerk_org on public.recordings;
create policy recordings_clerk_org on public.recordings
  for all using (public.has_clerk_org(org_id))
  with check (public.has_clerk_org(org_id));
