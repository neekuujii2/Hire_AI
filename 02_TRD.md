# Technical Requirements Document (TRD)
## HireAI — Enterprise Voice Interview Platform
**Version:** 1.0  
**Base:** DeepInterview (LiveKit + LangGraph + Next.js)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          HIREAI SYSTEM                              │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │  Hiring Team │    │  Candidate  │    │   Admin Portal       │   │
│  │  Dashboard  │    │  Portal     │    │   (Super Admin)      │   │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬───────────┘   │
│         │                  │                       │               │
│  ┌──────▼──────────────────▼───────────────────────▼───────────┐  │
│  │                   Next.js 14 (App Router)                    │  │
│  │                   API Routes + Server Actions                │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                    │
│         ┌────────────────────┼────────────────────┐              │
│         │                    │                    │              │
│  ┌──────▼──────┐   ┌─────────▼──────┐   ┌────────▼──────┐      │
│  │  Auth       │   │  Interview     │   │  Media        │      │
│  │  (Clerk)    │   │  Agent API     │   │  Service      │      │
│  │             │   │  (FastAPI/py)  │   │  (LiveKit)    │      │
│  └─────────────┘   └──────┬─────────┘   └────────┬──────┘      │
│                            │                       │              │
│                   ┌────────▼─────────┐   ┌────────▼──────┐      │
│                   │  LangGraph       │   │  Recording    │      │
│                   │  Orchestrator    │   │  Storage      │      │
│                   │  (Prep+Score)    │   │  (S3/R2)      │      │
│                   └────────┬─────────┘   └───────────────┘      │
│                            │                                      │
│            ┌───────────────┼───────────────┐                     │
│            │               │               │                     │
│    ┌───────▼───┐   ┌───────▼───┐   ┌──────▼──────┐              │
│    │  STT      │   │   LLM     │   │   TTS       │              │
│    │  Deepgram │   │  GPT-4o   │   │  ElevenLabs │              │
│    │  /Whisper │   │  /Gemini  │   │  /Cartesia  │              │
│    └───────────┘   └───────────┘   └─────────────┘              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │   Data Layer                                             │     │
│  │   PostgreSQL (Supabase) + Redis (BullMQ) + S3           │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | Already in DeepInterview; SSR + streaming |
| Language | TypeScript | Type safety across codebase |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent UI |
| State | Zustand + React Query | Server state + client state separation |
| Video | LiveKit React SDK | WebRTC, already integrated |
| Video Player | Video.js | Recording playback |
| Charts | Recharts | Scorecard visualizations |
| Auth | Clerk (Next.js SDK) | Multi-tenant, social login, org management |
| Forms | React Hook Form + Zod | Validation |

### 2.2 Backend
| Layer | Technology | Reason |
|---|---|---|
| API | FastAPI (Python 3.11+) | Existing agent code is Python |
| Agent Runtime | LiveKit Agents 1.6 | Real-time voice pipeline |
| Orchestration | LangGraph 0.2+ | Multi-agent prep/score flows |
| Queue | BullMQ (Redis) | Interview job queue, 500 concurrent |
| Background Jobs | Celery (Python) | Scoring, report generation |
| WebRTC | LiveKit SFU (Cloud or self-hosted) | Scalable media relay |

### 2.3 Data
| Layer | Technology | Reason |
|---|---|---|
| Primary DB | PostgreSQL 16 (Supabase) | Relational, RLS for multi-tenancy |
| Cache | Redis 7 | Session state, queue, rate limiting |
| Object Storage | Cloudflare R2 or AWS S3 | Recordings, CVs, reports |
| Search | Postgres full-text / pgvector | Transcript search, semantic CV match |
| CDN | Cloudflare | Recording delivery, low latency globally |

### 2.4 Infrastructure
| Component | Technology |
|---|---|
| Containerization | Docker + Docker Compose |
| Orchestration | Kubernetes (K8s) or Railway/Render |
| CI/CD | GitHub Actions |
| Monitoring | Datadog / Sentry |
| Logging | Pino (Node) + structlog (Python) |
| Secrets | Doppler or Infisical |
| IaC | Terraform (optional V2) |

---

## 3. API Design

### 3.1 REST API Endpoints

#### Auth & Org
```
POST   /api/auth/webhook              # Clerk webhook sync
GET    /api/org/:orgId/settings       # Org-level config
PATCH  /api/org/:orgId/settings       # Update org settings
```

#### Jobs
```
GET    /api/jobs                      # List jobs (scoped to org)
POST   /api/jobs                      # Create job
GET    /api/jobs/:jobId               # Job detail + config
PATCH  /api/jobs/:jobId               # Update job
DELETE /api/jobs/:jobId               # Archive job
POST   /api/jobs/:jobId/publish       # Make job live
GET    /api/jobs/:jobId/invite-link   # Get public apply URL
```

#### Candidates
```
GET    /api/jobs/:jobId/candidates            # List candidates
POST   /api/jobs/:jobId/candidates/invite     # Bulk/single invite
GET    /api/candidates/:candidateId           # Candidate detail
PATCH  /api/candidates/:candidateId/status    # Shortlist/reject/hold
GET    /api/candidates/:candidateId/report    # Scorecard + recording
```

#### Interview Sessions
```
POST   /api/sessions                          # Create session (candidate flow)
GET    /api/sessions/:sessionId               # Session state
POST   /api/sessions/:sessionId/start         # Begin interview
POST   /api/sessions/:sessionId/warning       # Log proctoring warning
POST   /api/sessions/:sessionId/terminate     # Force terminate
GET    /api/sessions/:sessionId/transcript    # Full transcript
```

#### Agent API (Internal — Python FastAPI)
```
POST   /agent/prep                    # Generate question plan from CV+JD
POST   /agent/score                   # Score completed interview
POST   /agent/token                   # Generate LiveKit token
GET    /agent/health                  # Health check
```

### 3.2 WebSocket / LiveKit Events
```
livekit.room.connected         → session_started event
livekit.track.published        → proctoring monitor attach
livekit.data.received          → warning events relay
livekit.room.disconnected      → session_ended trigger
```

---

## 4. Proctoring Engine — Technical Design

```python
# Proctoring runs as a parallel async service alongside the interview agent

class ProctorAgent:
    def __init__(self, session_id: str, max_warnings: int = 3):
        self.session_id = session_id
        self.max_warnings = max_warnings
        self.warning_count = 0
        self.events: list[ProctorEvent] = []

    async def on_face_check(self, frame: VideoFrame):
        faces = await detect_faces(frame)           # MediaPipe
        if len(faces) == 0:
            await self.add_warning("no_face_visible")
        elif len(faces) > 1:
            await self.add_warning("multiple_faces")

    async def on_audio_check(self, audio: AudioFrame):
        voices = await count_voices(audio)          # pyannote.audio
        if voices > 1:
            await self.add_warning("multiple_voices")

    async def add_warning(self, reason: str):
        self.warning_count += 1
        event = ProctorEvent(reason=reason, timestamp=now(), count=self.warning_count)
        self.events.append(event)
        await notify_candidate(self.session_id, event)      # frontend toast
        await notify_hiring_team(self.session_id, event)    # dashboard alert
        if self.warning_count >= self.max_warnings:
            await self.terminate_interview()

    async def terminate_interview(self):
        await db.sessions.update(self.session_id, status="terminated_proctor")
        await livekit.disconnect_participant(self.session_id)
```

### Frontend Proctoring (TypeScript)
```typescript
// Tab visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    reportSuspiciousEvent({ type: 'tab_switch', sessionId })
  }
})

// Copy-paste detection
document.addEventListener('paste', (e) => {
  reportSuspiciousEvent({ type: 'paste_detected', sessionId })
})

// Screen share detection (block)
const checkScreenShare = async () => {
  // Check if getDisplayMedia is being used via MediaStream inspection
  navigator.mediaDevices.getDisplayMedia = () => {
    reportSuspiciousEvent({ type: 'screen_share_attempt', sessionId })
    throw new Error('Screen sharing not allowed during interview')
  }
}
```

---

## 5. Scalability Architecture (500 concurrent interviews)

### 5.1 Agent Worker Pool
```yaml
# docker-compose.scale.yml
services:
  interview-agent:
    image: hireai/agent:latest
    deploy:
      replicas: 20              # 20 workers × 25 rooms = 500 concurrent
      resources:
        limits:
          cpus: '2'
          memory: 4G
    environment:
      LIVEKIT_URL: ${LIVEKIT_URL}
      WORKER_ID: ${HOSTNAME}
```

### 5.2 Queue Architecture
```
Interview Request
      │
      ▼
BullMQ Queue (Redis)
      │
      ├── priority: high   (paid tier) → immediate worker assignment
      ├── priority: normal (free tier) → queue, max wait 2 min
      │
      ▼
Agent Worker Pool (20 workers)
      │
      ▼
LiveKit Room (isolated per interview)
```

### 5.3 Latency Optimization
- **STT**: Deepgram Nova-2 streaming (25ms latency)
- **LLM**: GPT-4o mini for follow-up generation (800ms avg)
- **TTS**: Cartesia Sonic (< 200ms TTFB)
- **Target Pipeline**: STT(25ms) + LLM(800ms) + TTS(200ms) = ~1025ms P50

### 5.4 Recording Pipeline
```
LiveKit Egress (Composite recording)
      │
      ▼
S3/R2 Upload (streaming, not post-process)
      │
      ▼
Transcription Job (Celery async)
      │
      ▼
Score Generation (LangGraph)
      │
      ▼
Report Ready → Notify HR Dashboard
```

---

## 6. Multi-Tenancy Model

### 6.1 Database Isolation
```sql
-- Every table has org_id
-- Row Level Security (RLS) via Supabase
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON jobs
  USING (org_id = auth.jwt()->>'org_id');

-- Same pattern for: candidates, sessions, recordings, scorecards
```

### 6.2 Clerk Organization Model
```
Clerk Tenant (HireAI)
├── Organization A (Acme Corp)
│   ├── Admin: hr@acme.com
│   ├── Member: manager@acme.com
│   └── org_id: org_acme_xyz
│
└── Organization B (TechStartup)
    ├── Admin: talent@techstartup.io
    └── org_id: org_tech_abc
```

### 6.3 Feature Flags per Org
```typescript
type OrgConfig = {
  max_warning_limit: number       // default: 3
  interview_duration_min: number  // default: 30
  proctoring_enabled: boolean     // default: true
  custom_branding: boolean        // paid feature
  max_concurrent_interviews: number
  recording_retention_days: number
  allowed_languages: string[]
}
```

---

## 7. DeepInterview → HireAI Transformation Map

| DeepInterview Component | HireAI Transformation |
|---|---|
| `apps/web` (Next.js) | Add: `/dashboard`, `/jobs`, `/candidates`, `/invite/[token]` routes |
| `agents/interviewer/personas.py` | Add: `HIRING_MANAGER` persona with org context injection |
| `agents/prep/graph.py` | Add: org-specific question bank injection |
| `agents/scoring/rubric.py` | Add: custom per-job rubric weights |
| `skills/` (question packs) | Add: per-org private question bank YAML |
| `docker-compose.yml` | Add: BullMQ worker, proctoring service, egress recorder |
| DB schema | Add: `orgs`, `jobs`, `candidates`, `sessions`, `proctoring_events` tables |

---

## 8. Environment Variables

```bash
# Auth
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=

# LiveKit
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=

# LLM
OPENAI_API_KEY=                    # GPT-4o
GOOGLE_API_KEY=                    # Gemini Flash (alternative)

# STT
DEEPGRAM_API_KEY=

# TTS
CARTESIA_API_KEY=
ELEVEN_LABS_API_KEY=               # Fallback

# Database
DATABASE_URL=                      # Supabase PostgreSQL
SUPABASE_SERVICE_KEY=

# Redis
REDIS_URL=

# Storage
AWS_S3_BUCKET=
CLOUDFLARE_R2_BUCKET=

# Monitoring
SENTRY_DSN=
DATADOG_API_KEY=
```

---

## 9. Security Checklist

- [ ] All API routes protected by Clerk middleware
- [ ] Agent API protected by shared secret (internal only)
- [ ] Recording URLs signed (expiry: 1 hour)
- [ ] CV uploads virus-scanned (ClamAV)
- [ ] Rate limiting: 10 req/min per IP on public endpoints
- [ ] Candidate session tokens: JWT, 4-hour expiry, single-use
- [ ] PII fields encrypted at column level (name, email, phone)
- [ ] GDPR: right-to-delete API implemented
- [ ] SOC 2 Type II prep: audit logs for all data access
