# Hire AI — Implementation Master Plan

## Current Architecture Baseline

### Repository Structure
```
DeepInterview/
├── apps/
│   ├── web/                    # Next.js frontend (voice-first AI interviews)
│   │   ├── app/
│   │   │   ├── api/          # Backend APIs
│   │   │   ├── components/  # UI components
│   │   │   ├── lib/          # Shared utilities
│   │   │   └── pages/       # Application pages
│   │   ├── node_modules/
│   │   └── package.json
│   └── agent/                 # Python backend agent system
│       ├── src/              # Agent source code
│       └── pyproject.toml
├── services/
│   ├── lightrag/             # Knowledge base service
│   └── queue/                # Background job processing
├── docs/                      # Documentation
├── scripts/                   # Build/deploy scripts
├── skills/                   # Agent skills (workflow definitions)
├── packaging/                 # Packaging definitions
└── tests/                    # Tests
```

### Existing Capabilities
- **AI Interview Engine**: Voice-first adaptive interviews with CV/JD analysis
- **Candidate Evaluation**: Complete scoring with competency breakdown
- **Proctoring System**: Advanced cheating detection and monitoring
- **Multi-tenant Architecture**: Organization-based access control
- **Database Integration**: Comprehensive schema with relationships
- **Analytics Dashboard**: Basic performance metrics
- **Question Bank**: Custom interview questions management

### Existing API Endpoints
- `GET/POST/PUT/DELETE /api/jobs`
- `GET /api/session/[id]`
- `POST /api/prep`
- `POST /api/coach/chat`
- `POST /api/score`
- `GET/PUT /api/jobs/[id]/questions`

### Existing Database Tables
- organizations, users, jobs, candidates, sessions, scorecards, transcripts, recordings, question_banks

## Target Architecture

```
                         HIRE AI
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   CAREER PORTAL        CANDIDATE APP       HRMS PORTAL
        │                   │                   │
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                       APPLICATION
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           RESUME        JD MATCH      SCREENING
           PARSER                        AGENT
              │             │             │
              └─────────────┼─────────────┘
                            │
                     AI INTERVIEW
                            │
                       LANGGRAPH
                            │
                ┌───────────┼───────────┐
                │           │           │
             Question    Evaluation   Follow-up
              Agent        Agent        Agent
                │           │           │
                └───────────┼───────────┘
                            │
                     CANDIDATE INTEL
                            │
                       HR DASHBOARD
                            │
                ┌───────────┼───────────┐
                │           │           │
              Jobs      Candidates   Analytics
                │           │           │
                └───────────┼───────────┘
                            │
                     EVENT / QUEUE
                            │
                   Redis / BullMQ
                            │
                     Background Jobs
```

## Phase Definitions

### Phase 0: Architecture & Safety (P0)
**Goal:** Establish baseline architecture and safety measures
**Deliverables:**
- Architecture documentation
- ADR (Architecture Decision Records)
- Implementation master plan
- Safety checklist

### Phase 1: Careers Portal (P0)
**Goal:** Create public recruitment entry point
**Routes:**
- `/careers` - Job listing
- `/careers/jobs` - Job search
- `/careers/jobs/[jobId]` - Job details
- `/careers/apply/[jobId]` - Application form
- `/careers/application-success` - Confirmation

### Phase 2: Application Pipeline (P0)
**Goal:** Create application entity with state transitions
**Statuses:** APPLIED → SCREENING → AI_SCREENING → AI_INTERVIEW → HR_REVIEW → SHORTLISTED/REJECTED → HIRED

### Phase 3: Candidate Intelligence (P1)
**Goal:** Create unified candidate profile aggregating all data

### Phase 4: AI Screening (P0)
**Goal:** Connect resume parsing to applications with explainable scores

### Phase 5: AI Interview Integration (P0)
**Goal:** Connect existing interview engine to application entity

### Phase 6: HRMS (P0)
**Goal:** Build HR dashboard, job/candidate management, and pipeline

### Phase 7: Agentic Automation + Graph Memory (P1)
**Goal:** Add specialized agents and knowledge graph for candidate intelligence

### Phase 8: HR Analytics (P1)
**Goal:** Build analytics and reporting with funnel metrics

### Phase 9: Security & Production Hardening (P0)
**Goal:** Implement RBAC, tenancy, and production security

### Phase 10: Scale & Optimization (P2)
**Goal:** Performance optimization and scalability

## Phase Dependencies

```
PHASE 0 → PHASE 1 → PHASE 2 → PHASE 3 + PHASE 4 → PHASE 5 → PHASE 6 → PHASE 7 + PHASE 8 → PHASE 9 → PHASE 10
```

## Existing Modules to Reuse
- AI Interview Engine (LangGraph workflows)
- CV Extraction (markitdown)
- JD Analysis
- Scorecard Generation
- Question Bank System
- Proctoring System
- Clerk Authentication
- Supabase Database
- LiveKit Voice Platform
- BullMQ Background Jobs

## New Modules Required
- Careers Portal (5 routes)
- Application Pipeline (applications entity)
- Candidate Intelligence (candidate_profiles)
- AI Screening (ai_evaluations)
- HRMS Dashboard
- HR Analytics
- Agentic Automation (specialized agents)
- Graph Memory (Graphiti integration)

## Testing Strategy
- Unit tests for services and state transitions
- Integration tests for APIs and database
- E2E tests for candidate and HR flows
- AI evaluation tests for resume matching and interview scoring

## Deployment Strategy
- Docker containers
- CI/CD pipelines
- Environment-specific configurations
- Migration management
- Rollback procedures