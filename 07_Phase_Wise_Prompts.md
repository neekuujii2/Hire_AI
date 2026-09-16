# Phase-Wise Prompts — HireAI Build
## Copy-Paste Prompts for Each Phase of Development

Use these with Claude, Cursor, or any AI coding assistant. Each prompt is self-contained and includes the necessary context.

---

## PHASE 0 — Setup & Understanding

### Prompt 0.1: Understand the DeepInterview codebase
```
I have cloned the DeepInterview repository (https://github.com/ngoanpv/DeepInterview).
This is a voice-first AI mock interview platform built with:
- Next.js 14 (frontend)
- Python FastAPI + LiveKit Agents (voice agent)
- LangGraph (prep + scoring pipelines)
- Docker Compose (orchestration)

Please analyze the following files and give me:
1. A map of the key files and their purpose
2. The data flow from "candidate clicks start" to "scorecard generated"
3. Which files I need to modify for each of these features:
   - Adding a "Hiring Manager" persona (replace mock interviewer)
   - Multi-tenant support (multiple companies use the platform)
   - Candidate proctoring (webcam + tab switch detection)
   - Custom question banks per job

[paste key file contents here: agents/interviewer/personas.py, agents/prep/graph.py, apps/web/app/page.tsx]
```

### Prompt 0.2: Set up Supabase schema
```
I'm building HireAI, a multi-tenant voice interview platform on top of DeepInterview.
I need to set up a PostgreSQL database in Supabase.

Create a complete migration file that includes:
- organizations table (linked to Clerk org_id)
- org_configs table (max_warning_limit, duration, proctoring settings)
- jobs table (job postings with interview config)
- candidates table (pipeline status, invite tokens, CV storage)
- sessions table (LiveKit room, interview state, warning count)
- proctoring_events table (tab switch, face detection events)
- transcripts table (JSONB turns array)
- scorecards table (competency scores, AI summary, recommendation)
- recordings table (S3 URL, duration, status)

Requirements:
- Row Level Security (RLS) on all tables using org_id from Clerk JWT
- UUID primary keys
- All org-scoped tables have org_id foreign key
- Indexes for: candidate pipeline lookup, session by status, transcript full-text search
- Triggers for auto-updating updated_at fields

Use the schema in this document as reference: [paste 03_Backend_Schema.md contents]
```

---

## PHASE 1 — Hiring Manager Persona

### Prompt 1.1: Transform the persona system
```
I'm transforming DeepInterview into HireAI — a real hiring interview platform (not mock).

Here is the current persona file:
[paste agents/interviewer/personas.py]

Here is the current prep graph:
[paste agents/prep/graph.py]

Transform this to:
1. Add a HIRING_MANAGER_PERSONA that:
   - Takes: persona_name, persona_tone (professional/conversational/technical), 
     company_name, job_title, rubric_summary, question_plan
   - Speaks as a real hiring manager, NOT a mock interviewer
   - Never says "for practice" or "this is a simulation"
   - Asks 1-2 natural follow-up questions for shallow answers
   - Handles 8-second silence with "Take your time..."
   - Closes with "Thank you, we'll be in touch within X days"

2. Add a build_hiring_manager_prompt() function that assembles the final prompt

3. Modify PrepState TypedDict to include:
   - company_name: str
   - org_id: str  
   - question_bank: list[dict]  (org's custom questions)
   - rubric: dict               (org's scoring weights)
   - persona_name: str
   - persona_tone: str

4. Modify the question_planner LangGraph node to merge AI-generated questions 
   with org's custom question bank, respecting difficulty_ramp

Keep all existing logic intact, only extend it.
```

### Prompt 1.2: Question Bank API + Editor UI
```
I need to build a question bank editor for HireAI hiring team dashboard.

Backend (Next.js API route):
- GET /api/jobs/[id]/questions → return question bank for this job
- PUT /api/jobs/[id]/questions → save question bank
- POST /api/jobs/[id]/questions/generate → trigger AI generation from JD

Each question has:
{ id, text, category (technical/behavioral/culture_fit), difficulty (1-5), 
  expected_keywords[], follow_ups[], time_limit_sec }

Rubric has:
{ competencies: [{ name, weight }] }  // weights must sum to 1.0

Frontend React component (QuestionBankEditor):
- Table view of questions with inline edit
- Add question button (opens modal)
- Drag to reorder questions
- Per-question: edit text, set category badge, set difficulty (1-5 dots)
- Rubric section: competency names + weight sliders (auto-normalize to 100%)
- "Generate from JD" button → calls AI, shows preview before saving
- Save button with success toast

Tech stack: Next.js 14, TypeScript, Tailwind, shadcn/ui, React Hook Form
Auth: Clerk (assume orgId available from auth())
Database: Supabase via Prisma
```

---

## PHASE 2 — Candidate Portal

### Prompt 2.1: Invite token landing page
```
Build the candidate-facing interview portal for HireAI.

Route: /invite/[token] — this is a PUBLIC route (no login required)

Page flow:
1. /invite/[token] — Landing page
   - Company logo, job title, company name
   - Interview duration, what to expect
   - "Start Interview" CTA

2. /invite/[token]/check — Device check
   - Camera preview (live video element)
   - Check: camera ✅/❌, microphone ✅/❌, network speed ✅/❌
   - Mic level visualization (animated bars)
   - Can't proceed until all checks pass

3. /invite/[token]/consent — Consent + CV
   - "This interview will be recorded" disclosure
   - Checkbox: "I agree to being recorded and evaluated by AI"
   - CV upload (if job requires it): PDF/DOC, max 5MB
   - "Begin Interview" button (disabled until consent checked)

4. /invite/[token]/waiting — Prep loading
   - "Alex is preparing your interview..." 
   - Progress bar (fake 30s progress while LangGraph prep runs)
   - Polls /api/sessions/[id]/status until status = 'ready'

5. /invite/[token]/interview — Live interview room
   (separate prompt for this)

6. /invite/[token]/complete — Thank you
   - "Interview complete! The team will review and be in touch."
   - Company-branded, no score shown (unless instant_feedback = true)

Requirements:
- Token validation: check DB for candidate, check expiry, check not already completed
- Mobile detection: show "Please use desktop" message on mobile
- All steps: show company logo + job title in header
- Error states: invalid link, expired link, already completed

Tech: Next.js 14 App Router, TypeScript, Tailwind, Supabase
```

### Prompt 2.2: Live Interview Room UI
```
Build the live interview room component for HireAI candidate portal.

This is the main interview screen at /invite/[token]/interview

Layout (split screen):
LEFT PANEL (60%):
- AI Avatar section: animated circle/avatar with speaking pulse animation
- Avatar name: "{persona_name}" + subtitle "Hiring Manager, {company_name}"  
- Mic status indicator: "🎙 Listening..." with audio waveform visualization
- Question progress: "Question 3 of 8" dots (filled = asked, empty = upcoming)
- Candidate controls: [Mute Mic toggle] [Camera toggle]

RIGHT PANEL (40%):
- Candidate webcam preview (small, top right)
- [●REC] recording indicator
- Live transcript scroll area:
  - AI turns: left-aligned, slate text, label "Alex:"
  - Candidate turns: right-aligned, navy text, label "You:"
  - Auto-scroll to bottom

Warning Toast (absolute positioned, top center):
- Appears for 5 seconds on any proctoring event
- Shows: icon + "Tab switch detected — Warning 2 of 3"
- Red border if final warning

Technical requirements:
- Use LiveKit React SDK for audio/video
- Connect to room using token from /api/sessions/[id]/token
- ProctorMonitor component (invisible): handle visibilitychange, paste, contextmenu
- Poll transcript updates every 2 seconds from /api/sessions/[id]/transcript
- On session status = 'completed' → navigate to /complete
- On session status = 'terminated_proctor' → show termination screen

Tech: Next.js 14, TypeScript, Tailwind, @livekit/components-react, @livekit/client
```

---

## PHASE 3 — Proctoring Engine

### Prompt 3.1: Backend proctoring service
```
Build the Python proctoring service for HireAI that runs alongside the interview agent.

File: agents/proctoring/monitor.py

Requirements:
1. ProctorAgent class (runs as LiveKit Agent participant):
   - Subscribes to candidate's video + audio tracks in the room
   - Samples video frames every 5 seconds (NOT every frame — too expensive)
   - Uses MediaPipe FaceDetection to count faces in frame
   - Triggers:
     * no_face_visible: 0 faces detected
     * multiple_faces: 2+ faces detected
   - Sends warning via LiveKit DataChannel to candidate frontend
   - Updates warning_count in DB (sessions table)
   - If warning_count >= max_warning_limit: disconnects candidate, updates status

2. Warning data packet (sent via LiveKit data channel):
   { "type": "proctor_warning", "reason": "no_face_visible", 
     "count": 2, "max": 3, "timestamp": "..." }

3. Termination:
   - Update sessions.status = 'terminated_proctor'
   - Update sessions.termination_reason
   - Log to proctoring_events table
   - Publish livekit data message: { "type": "interview_terminated", "reason": "..." }

4. ProctorEvent dataclass:
   - session_id, event_type, warning_number, severity, timestamp, metadata

Dependencies: mediapipe, livekit-agents, asyncio, httpx (for DB calls)

Don't use pyannote for now (too heavy) — just face detection.
Keep it lightweight enough to run 500 concurrent instances.
```

### Prompt 3.2: Frontend proctoring monitor + warning UI
```
Build the frontend proctoring system for HireAI interview room.

1. ProctorMonitor component (invisible — no UI, just event listeners):
File: components/interview/ProctorMonitor.tsx

Events to detect:
- Tab switch: document.addEventListener('visibilitychange', ...)
- Copy-paste: document.addEventListener('paste', ...)
- Right-click: prevent default on contextmenu
- Screen share: override navigator.mediaDevices.getDisplayMedia to throw error

Each event → POST /api/sessions/[sessionId]/warning { type }
Response: { warning_count, max_warnings, terminate: boolean }
If terminate: true → call onTerminate()

Also listen to LiveKit DataChannel messages:
- type: "proctor_warning" → call onWarning()
- type: "interview_terminated" → call onTerminate()

2. WarningToast component:
File: components/interview/WarningToast.tsx

Props: { warning: { reason, count, max }, onDismiss }
- Auto-dismisses after 5 seconds
- Shows warning icon, human-readable reason, "Warning N of M"
- If count === max - 1: add "⚠️ Final warning" emphasis + red border
- Smooth slide-in animation from top

Reason labels:
- tab_switch → "Tab switch detected"
- no_face_visible → "Face not visible in camera"
- multiple_faces → "Multiple people detected"
- copy_paste → "Copy-paste attempt detected"
- screen_share_attempt → "Screen sharing blocked"

3. TerminatedScreen component:
- Full screen overlay
- "Interview Terminated" heading
- "This interview has been ended due to policy violations."
- Contact HR email for questions

Tech: TypeScript, React, Tailwind, @livekit/client (for DataChannel)
```

---

## PHASE 4 — Hiring Dashboard

### Prompt 4.1: Full hiring team dashboard
```
Build the hiring team dashboard for HireAI.

I need these pages in Next.js 14 App Router with Clerk auth:

1. /dashboard — Overview
   Stats cards: Active Jobs, This Week's Interviews, Avg Score, Completion Rate
   Recent Activity feed (last 10 events from DB)
   Quick action: "Create New Job"

2. /dashboard/jobs — Jobs list
   Grid of job cards: title, department, status badge, candidate counts
   Filters: status (active/draft/paused/closed)
   Sort: created date, candidate count, completion rate
   Create Job button → opens 3-step wizard modal

3. /dashboard/jobs/[id] — Job detail
   Header: job title, department, status toggle
   Tab navigation: Overview | Candidates | Questions | Settings
   
   Overview tab:
   - Mini funnel: Invited → Started → Completed → Shortlisted
   - Avg score donut chart
   - Recent completions list
   
   Candidates tab:
   - Toggle: Kanban view / Table view
   - Kanban: columns = [Invited, Completed, Shortlisted, Rejected, On Hold]
   - Table: sortable columns (name, email, score, status, date)
   - Bulk actions: select multiple → bulk invite / bulk reject / export CSV
   - Individual actions: Shortlist | Reject | Hold | View Report

4. /dashboard/jobs/[id]/candidates/[candidateId] — Candidate detail
   Left: scorecard (overall score, competency bars, AI summary, strengths, improvements)
   Right: recording player + transcript
   Bottom: proctoring events timeline (if any warnings)
   Actions: Shortlist | Reject | Hold | Export PDF | Add Note

Data: All fetched server-side (RSC) + optimistic updates for status changes
Auth: Clerk, org-scoped queries
Tech: Next.js 14, TypeScript, Tailwind, shadcn/ui, Recharts, Supabase
```

### Prompt 4.2: Scorecard PDF export
```
Build a PDF scorecard export for HireAI candidate reports.

Using: @react-pdf/renderer

The PDF should include:
1. Header: company logo, "Interview Report — Confidential", date
2. Candidate info: name, email, job title, interview date, duration
3. Overall score: large number + grade letter + recommendation badge
4. Competency breakdown: horizontal bar chart per competency with score
5. AI Summary: 2-3 paragraph assessment
6. Strengths: bulleted list (3-5 items)
7. Areas for Improvement: bulleted list (3-5 items)
8. Per-question breakdown: question text + score + brief feedback
9. Proctoring summary: "No issues" or list of events with timestamps
10. Footer: "Generated by HireAI | Confidential — for internal use only"

API route: GET /api/candidates/[id]/report?format=pdf
- Fetches scorecard + transcript + proctoring events from DB
- Generates PDF using react-pdf
- Returns as downloadable PDF response

Design: Professional, minimal, dark navy header, white body, accent color for scores
```

---

## PHASE 5 — Multi-Tenancy

### Prompt 5.1: Clerk multi-tenant setup
```
Set up multi-tenant authentication for HireAI using Clerk Organizations.

Requirements:
1. Middleware (middleware.ts):
   - Protect all /dashboard routes
   - Allow public: /invite/[token]/* routes + /api/webhooks/*
   - Redirect unauthenticated to /sign-in
   - Redirect authenticated users without org to /onboarding

2. Clerk webhook handler (/api/webhooks/clerk/route.ts):
   Sync these events to Supabase:
   - organization.created → create organizations row + org_configs row (defaults)
   - organization.updated → update organizations row
   - organizationMembership.created → create/update users row
   - organizationMembership.deleted → soft-delete user

3. Auth context hook (hooks/useAuth.ts):
   - Returns: userId, orgId, orgSlug, userRole
   - Wraps Clerk useAuth + useOrganization
   - Used throughout dashboard components

4. DB query helper (lib/db/scoped.ts):
   - All queries automatically scoped to current orgId
   - Never lets a user query another org's data
   - Throws if orgId is missing

5. Onboarding flow (/onboarding):
   - New org → "Tell us about your company" form
   - Company name, logo upload, industry, team size
   - Creates org record, default config
   - Redirects to /dashboard/jobs

Tech: Next.js 14, Clerk, Supabase, TypeScript
```

---

## PHASE 6 — Scale & Performance

### Prompt 6.1: BullMQ interview queue
```
Build the interview queue system for HireAI to handle 500 concurrent interviews.

Requirements:
1. Queue setup (services/queue/index.ts):
   - prepQueue: for running LangGraph prep before interview
   - scoreQueue: for scoring after interview completes
   - emailQueue: for sending invite/result emails
   - recordingQueue: for processing recordings after LiveKit egress

2. Job producer functions:
   - enqueuePrep(sessionId, priority: 'high'|'normal')
   - enqueueScoring(sessionId)
   - enqueueEmail(type, recipientEmail, data)
   
   High priority = paid org tier, processes first
   Normal priority = queued, max wait 2 minutes

3. Worker (services/queue/workers/prep-worker.ts):
   - Concurrency: 25 per worker instance
   - Calls Python agent API: POST /agent/prep { session_id }
   - On success: update session status to 'ready'
   - On failure (3 attempts): update session status to 'prep_failed', notify HR
   - Timeout: 90 seconds per prep job

4. Queue monitoring endpoint (/api/admin/queue-stats):
   - Returns: queue depths, active jobs, failed jobs
   - Protected by admin role

5. docker-compose.prod.yml:
   - 20 interview-agent replicas
   - 3 celery-worker replicas
   - Redis with persistence
   - Health checks on all services

Tech: BullMQ, ioredis, TypeScript, Docker
```

### Prompt 6.2: Performance optimization
```
Optimize HireAI for low latency voice interviews. 

Target: P95 voice response < 1.5 seconds (STT → LLM → TTS full pipeline)

Current stack:
- STT: Deepgram Nova-2 streaming
- LLM: GPT-4o
- TTS: Cartesia Sonic / ElevenLabs

Implement these optimizations in the Python agent code:

1. Streaming LLM responses:
   - Use streaming=True on LLM calls
   - Start TTS synthesis as soon as first sentence is complete (don't wait for full response)
   - Use sentence boundary detection: end on [.!?] + space

2. Response caching for common interview phrases:
   - Cache TTS audio for: intro, transitions, follow-up prompts, goodbye
   - Redis key: tts_cache:{hash(text)}:{voice_id}
   - TTL: 24 hours
   - Warm cache on agent startup

3. Parallel processing:
   - While candidate is speaking (STT), pre-generate likely follow-up questions
   - Use GPT-4o-mini (not GPT-4o) for follow-up generation (80% cheaper, fast enough)
   - Use GPT-4o only for final scoring

4. Connection pooling:
   - Pool Deepgram WebSocket connections (reuse across interview turns)
   - Pool database connections (asyncpg pool, min=5, max=20)

5. Latency measurement:
   - Log per-turn: stt_ms, llm_first_token_ms, tts_start_ms, total_ms
   - Emit to Datadog as custom metrics
   - Alert if P95 > 2000ms

Show the modified agent code with these optimizations applied.
```

---

## PHASE 7 — Final Features (Zara AI Inspired)

### Prompt 7.1: AI-powered interview insights
```
Add advanced AI insights to HireAI scorecards, inspired by Zara AI interview platform.

Post-interview, generate additional insights:

1. Communication Style Analysis:
   Analyze transcript and output:
   - Speaking pace: words per minute (computed from transcript + timestamps)
   - Filler word count: "um", "uh", "like", "you know"
   - Sentence structure: simple/complex ratio
   - Confidence score: based on hedge words ("I think", "maybe", "probably")

2. Behavioral Pattern Detection:
   Classify each answer using STAR framework detection:
   - Did they provide Situation? (boolean)
   - Did they provide Task? (boolean)
   - Did they describe Action? (boolean)
   - Did they explain Result? (boolean)
   - STAR completeness score: 0-100

3. Cultural Fit Signals:
   Using company values from org config, detect alignment:
   - Detect mentions of: collaboration, ownership, growth, impact, speed
   - Score alignment to company values

4. Red Flags Detection:
   Automatically flag:
   - Contradictions between answers (AI detects inconsistency)
   - Negative language about past employers
   - Vague answers on technical questions (no specifics, no numbers)

5. Comparative Benchmarking (after 10+ candidates):
   - "This candidate scored in top 20% for Problem Solving for this role"
   - "Communication score is 15% above average for Senior Backend candidates"

Implement as a LangGraph node that runs after the main scoring node.
Input: transcript_turns[], question_plan, rubric, all_previous_scores[]
Output: insights{} object added to scorecard JSONB

Python + LangGraph, GPT-4o for analysis.
```

### Prompt 7.2: ATS Integration (Basic)
```
Add basic ATS (Applicant Tracking System) integration to HireAI.

Phase 1: Webhook-based integration
- When candidate is shortlisted: POST to configured webhook URL
- When candidate is rejected: POST to configured webhook URL
- Payload: { event, candidate, job, score, recommendation, report_url }

Phase 2: CSV Import
- Bulk import candidates from CSV: name, email, job_id
- Column mapping UI: "Which column is email?"
- Validates emails, deduplicates, shows preview before import
- Sends invite emails to all imported candidates

Phase 3: Greenhouse ATS integration (basic)
- OAuth connection to Greenhouse
- Sync candidates from Greenhouse jobs → HireAI
- Push scorecard back to Greenhouse as "HireAI Score" tag

Build:
1. Webhook config UI in org settings (URL + secret + event selection)
2. Webhook delivery service with retry logic (3 attempts, exponential backoff)
3. CSV import UI + API route
4. Greenhouse OAuth connect button + sync job

Tech: Next.js, TypeScript, Supabase, BullMQ (for webhook delivery)
```
