# Backend Schema — HireAI
## PostgreSQL Database Design (Supabase)

---

## 1. Entity Relationship Overview

```
organizations ──┬── users (via Clerk)
                ├── jobs ──┬── candidates ──── sessions ──┬── transcripts
                │          └── question_banks              ├── proctoring_events
                └── org_configs                            ├── scorecards
                                                           └── recordings
```

---

## 2. Full Schema (PostgreSQL)

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector for semantic search

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_org_id    TEXT UNIQUE NOT NULL,       -- Clerk org identifier
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,        -- acme-corp → acme-corp.hireai.com
    logo_url        TEXT,
    plan            TEXT DEFAULT 'starter'       -- starter | pro | enterprise
                    CHECK (plan IN ('starter', 'pro', 'enterprise')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORG CONFIGURATION
-- ============================================================
CREATE TABLE org_configs (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    max_warning_limit           INT DEFAULT 3,
    interview_duration_min      INT DEFAULT 30,
    proctoring_enabled          BOOLEAN DEFAULT TRUE,
    recording_enabled           BOOLEAN DEFAULT TRUE,
    recording_retention_days    INT DEFAULT 90,
    custom_branding             BOOLEAN DEFAULT FALSE,
    max_concurrent_interviews   INT DEFAULT 10,
    allowed_languages           TEXT[] DEFAULT ARRAY['en'],
    auto_score_enabled          BOOLEAN DEFAULT TRUE,
    notify_hr_on_complete       BOOLEAN DEFAULT TRUE,
    notify_hr_on_terminate      BOOLEAN DEFAULT TRUE,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id)
);

-- ============================================================
-- USERS (Synced from Clerk webhook)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id   TEXT UNIQUE NOT NULL,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    email           TEXT NOT NULL,
    name            TEXT,
    role            TEXT DEFAULT 'member'
                    CHECK (role IN ('admin', 'manager', 'member')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by          UUID REFERENCES users(id),
    title               TEXT NOT NULL,
    department          TEXT,
    location            TEXT,
    job_description     TEXT NOT NULL,              -- Full JD text
    jd_file_url         TEXT,                       -- Optional uploaded JD PDF
    seniority_level     TEXT DEFAULT 'mid'
                        CHECK (seniority_level IN ('intern', 'junior', 'mid', 'senior', 'lead', 'principal')),
    employment_type     TEXT DEFAULT 'full_time'
                        CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'freelance')),
    status              TEXT DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'paused', 'closed')),
    
    -- Interview Config
    interview_duration_min  INT DEFAULT 30,
    language                TEXT DEFAULT 'en',
    persona_name            TEXT DEFAULT 'Alex',        -- AI interviewer name
    persona_tone            TEXT DEFAULT 'professional'
                            CHECK (persona_tone IN ('professional', 'conversational', 'technical', 'friendly')),
    max_warning_limit       INT DEFAULT 3,
    proctoring_enabled      BOOLEAN DEFAULT TRUE,
    invite_expiry_hours     INT DEFAULT 72,
    require_cv_upload       BOOLEAN DEFAULT FALSE,
    instant_feedback        BOOLEAN DEFAULT FALSE,
    
    -- Invite
    public_apply_enabled    BOOLEAN DEFAULT FALSE,
    public_apply_token      TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    
    -- Stats (denormalized for performance)
    total_invited           INT DEFAULT 0,
    total_completed         INT DEFAULT 0,
    total_shortlisted       INT DEFAULT 0,
    
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QUESTION BANKS
-- ============================================================
CREATE TABLE question_banks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,  -- NULL = org-level bank
    name            TEXT NOT NULL,
    category        TEXT,                           -- technical | behavioral | culture_fit
    questions       JSONB NOT NULL DEFAULT '[]',    -- Array of question objects
    rubric          JSONB NOT NULL DEFAULT '{}',    -- Scoring rubric definition
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Question object shape (JSONB):
-- {
--   "id": "q1",
--   "text": "Tell me about a time you led a team through ambiguity.",
--   "category": "behavioral",
--   "difficulty": 3,           -- 1-5
--   "expected_keywords": [],
--   "follow_ups": [],
--   "time_limit_sec": 120
-- }

-- Rubric shape (JSONB):
-- {
--   "competencies": [
--     { "name": "Communication", "weight": 0.25 },
--     { "name": "Problem Solving", "weight": 0.35 },
--     { "name": "Culture Fit", "weight": 0.20 },
--     { "name": "Technical Depth", "weight": 0.20 }
--   ]
-- }

-- ============================================================
-- CANDIDATES
-- ============================================================
CREATE TABLE candidates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    name                TEXT,
    phone               TEXT,
    cv_url              TEXT,                       -- S3/R2 URL (encrypted)
    cv_text             TEXT,                       -- Parsed CV text for AI
    linkedin_url        TEXT,
    
    -- Pipeline Status
    pipeline_status     TEXT DEFAULT 'invited'
                        CHECK (pipeline_status IN (
                            'invited', 'link_opened', 'interview_started',
                            'interview_completed', 'interview_terminated',
                            'shortlisted', 'rejected', 'on_hold', 'hired'
                        )),
    
    -- Invite
    invite_token        TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    invite_sent_at      TIMESTAMPTZ,
    invite_expires_at   TIMESTAMPTZ,
    link_opened_at      TIMESTAMPTZ,
    
    -- Metadata
    invited_by          UUID REFERENCES users(id),
    source              TEXT DEFAULT 'manual'
                        CHECK (source IN ('manual', 'csv_bulk', 'public_apply', 'ats_sync')),
    notes               TEXT,                       -- HR internal notes
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(job_id, email)
);

-- ============================================================
-- INTERVIEW SESSIONS
-- ============================================================
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id),
    job_id              UUID NOT NULL REFERENCES jobs(id),
    candidate_id        UUID NOT NULL REFERENCES candidates(id),
    
    -- LiveKit
    livekit_room_name   TEXT UNIQUE,
    livekit_token       TEXT,                       -- Candidate's room token
    
    -- State
    status              TEXT DEFAULT 'pending'
                        CHECK (status IN (
                            'pending', 'prep_running', 'ready',
                            'in_progress', 'completed',
                            'terminated_proctor', 'terminated_timeout',
                            'terminated_error', 'abandoned'
                        )),
    
    -- Timing
    prep_started_at     TIMESTAMPTZ,
    prep_completed_at   TIMESTAMPTZ,
    interview_started_at TIMESTAMPTZ,
    interview_ended_at  TIMESTAMPTZ,
    duration_seconds    INT,
    
    -- Question Plan (generated by LangGraph prep)
    question_plan       JSONB,
    questions_asked     INT DEFAULT 0,
    questions_total     INT DEFAULT 0,
    
    -- Proctoring
    warning_count       INT DEFAULT 0,
    max_warning_limit   INT DEFAULT 3,
    termination_reason  TEXT,
    
    -- Config snapshot (at session creation time)
    config_snapshot     JSONB,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROCTORING EVENTS
-- ============================================================
CREATE TABLE proctoring_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    event_type      TEXT NOT NULL
                    CHECK (event_type IN (
                        'tab_switch', 'no_face_visible', 'multiple_faces',
                        'multiple_voices', 'copy_paste', 'screen_share_attempt',
                        'warning_issued', 'interview_terminated'
                    )),
    warning_number  INT,                            -- Which warning (1, 2, 3...)
    severity        TEXT DEFAULT 'medium'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    metadata        JSONB DEFAULT '{}',             -- Screenshot URL, audio clip URL, etc.
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSCRIPTS
-- ============================================================
CREATE TABLE transcripts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    turns           JSONB NOT NULL DEFAULT '[]',    -- Array of transcript turns
    full_text       TEXT,                           -- Concatenated for search
    word_count      INT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Transcript turn shape (JSONB array):
-- [
--   {
--     "turn_id": 1,
--     "speaker": "ai",            -- "ai" | "candidate"
--     "text": "Tell me about yourself.",
--     "start_ms": 0,
--     "end_ms": 3200,
--     "question_id": "q1",
--     "confidence": 0.97          -- STT confidence (candidate turns only)
--   }
-- ]

-- ============================================================
-- SCORECARDS
-- ============================================================
CREATE TABLE scorecards (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    candidate_id        UUID NOT NULL REFERENCES candidates(id),
    org_id              UUID NOT NULL,
    job_id              UUID NOT NULL,
    
    -- Overall
    overall_score       NUMERIC(5,2),               -- 0-100
    overall_grade       TEXT,                       -- A, B, C, D, F
    recommendation      TEXT CHECK (recommendation IN ('strong_yes', 'yes', 'maybe', 'no', 'strong_no')),
    
    -- Per-competency scores
    competency_scores   JSONB NOT NULL DEFAULT '{}',
    -- { "Communication": 82, "Problem Solving": 74, "Technical Depth": 88, "Culture Fit": 65 }
    
    -- Per-question scores
    question_scores     JSONB NOT NULL DEFAULT '[]',
    -- [{ "question_id": "q1", "score": 75, "feedback": "Good STAR structure..." }]
    
    -- AI Generated Insights
    strengths           TEXT[],
    areas_to_improve    TEXT[],
    ai_summary          TEXT,                       -- 2-3 sentence summary
    follow_up_questions TEXT[],                     -- Suggested for human interview
    
    -- Red Flags
    proctoring_summary  JSONB,                      -- Warning events summary
    
    -- Metadata
    scored_by           TEXT DEFAULT 'ai'           -- ai | human | ai_human_hybrid
                        CHECK (scored_by IN ('ai', 'human', 'ai_human_hybrid')),
    human_notes         TEXT,                       -- HR manual override notes
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ,
    reviewed_by         UUID REFERENCES users(id)
);

-- ============================================================
-- RECORDINGS
-- ============================================================
CREATE TABLE recordings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    
    -- Files
    video_url       TEXT,                           -- Signed S3/R2 URL
    audio_url       TEXT,                           -- Audio-only track
    
    -- Metadata
    duration_seconds INT,
    file_size_bytes  BIGINT,
    resolution       TEXT,                          -- "1280x720"
    codec            TEXT DEFAULT 'h264',
    
    -- Status
    status          TEXT DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'failed', 'deleted')),
    
    -- Retention
    expires_at      TIMESTAMPTZ,                    -- Auto-delete date
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID,
    user_id         UUID,
    action          TEXT NOT NULL,                  -- "job.created", "candidate.rejected"
    entity_type     TEXT,                           -- "job", "candidate", "session"
    entity_id       UUID,
    metadata        JSONB DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_jobs_org_id ON jobs(org_id);
CREATE INDEX idx_jobs_status ON jobs(org_id, status);
CREATE INDEX idx_candidates_job_id ON candidates(job_id);
CREATE INDEX idx_candidates_pipeline_status ON candidates(job_id, pipeline_status);
CREATE INDEX idx_candidates_invite_token ON candidates(invite_token);
CREATE INDEX idx_sessions_candidate_id ON sessions(candidate_id);
CREATE INDEX idx_sessions_status ON sessions(org_id, status);
CREATE INDEX idx_proctoring_session_id ON proctoring_events(session_id);
CREATE INDEX idx_scorecards_candidate_id ON scorecards(candidate_id);
CREATE INDEX idx_transcripts_session_id ON transcripts(session_id);
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id, created_at DESC);

-- Full text search on transcripts
CREATE INDEX idx_transcripts_fulltext ON transcripts USING gin(to_tsvector('english', full_text));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Hiring team policy (authenticated via Clerk JWT)
CREATE POLICY "org_members_only" ON jobs
    FOR ALL USING (org_id = (current_setting('request.jwt.claims')::jsonb->>'org_id')::uuid);

-- Same pattern applied to all tables with org_id

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language plpgsql;

CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
```

---

## 3. Redis Key Structure

```
# Session state (TTL: 6 hours)
session:{session_id}:state         → JSON object
session:{session_id}:warnings      → integer counter
session:{session_id}:active        → 1/0 flag

# Rate limiting
ratelimit:invite:{ip}              → request count (TTL: 60s)
ratelimit:api:{org_id}             → request count (TTL: 60s)

# BullMQ Queues
bull:prep-queue                    → interview prep jobs
bull:score-queue                   → scoring jobs
bull:recording-queue               → recording processing jobs
bull:email-queue                   → email notification jobs

# LiveKit token cache (TTL: 4 hours)
livekit:token:{session_id}         → signed JWT string
```

---

## 4. S3/R2 Bucket Structure

```
hireai-recordings/
├── {org_id}/
│   ├── {job_id}/
│   │   └── {session_id}/
│   │       ├── video.mp4
│   │       ├── audio.mp3
│   │       └── proctoring-screenshots/
│   │           ├── event_001.jpg
│   │           └── event_002.jpg

hireai-documents/
├── {org_id}/
│   ├── cvs/{candidate_id}.pdf
│   ├── jds/{job_id}.pdf
│   └── reports/{session_id}/scorecard.pdf

hireai-assets/
├── {org_id}/logo.png
└── avatars/alex.png
```
