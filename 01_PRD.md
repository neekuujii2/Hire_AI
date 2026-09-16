# Product Requirements Document (PRD)
## HireAI — Enterprise Voice Interview Platform
**Version:** 1.0  
**Date:** September 2026  
**Status:** Active Development  
**Base Repo:** DeepInterview (Apache-2.0)

---

## 1. Executive Summary

HireAI is a B2B SaaS platform that enables hiring teams to conduct AI-powered voice interviews at scale — on behalf of the hiring manager. Inspired by platforms like micro1, Aliera AI, and Zara AI, HireAI transforms the DeepInterview open-source project into a production-grade, multi-tenant enterprise system capable of handling **500+ concurrent interviews daily** with low latency, proctoring, and detailed scorecards.

---

## 2. Problem Statement

| Pain Point | Current State | HireAI Solution |
|---|---|---|
| Screening bottleneck | HR teams manually screen 100s of candidates | AI conducts first-round voice interviews 24/7 |
| Inconsistent evaluation | Each interviewer scores differently | Standardized AI rubric scoring |
| Candidate cheating | No way to detect copy-paste / tab switch | Proctoring: video + audio + suspicion engine |
| Slow feedback | Candidates wait days for results | Instant scorecard post-interview |
| No scale | One HR = ~5 interviews/day | Platform = 500 interviews/day |

---

## 3. Target Users

### 3.1 Primary Users (Hiring Side)
- **HR Managers / Talent Acquisition** — Create jobs, set rubrics, invite candidates
- **Hiring Managers** — Review scorecards, watch recordings, make decisions
- **Company Admins** — Manage team seats, billing, integrations

### 3.2 Secondary Users (Candidate Side)
- **Job Applicants** — Receive invite link, complete voice interview, get acknowledgment

---

## 4. Core Features

### 4.1 Hiring Team Portal

#### Job Management
- Create/edit job postings with: title, JD (text or PDF upload), required skills, seniority level
- Set interview configuration: duration (15/30/45 min), question depth, language
- Upload custom question bank (YAML/CSV) or use AI-generated questions from JD
- Define scoring rubric: per-competency weightage

#### Candidate Management
- Bulk invite via CSV or individual email invite
- Public apply link generation (shareable URL)
- Candidate pipeline view: Invited → Started → Completed → Reviewed → Decision
- ATS-style Kanban board per job

#### Interview Configuration
- **Interviewer Persona**: Choose tone (formal/conversational/technical), manager name, company context
- **Proctoring Settings**: Enable/disable webcam, set `max_warning_limit` (default: 3)
- **Auto-disqualify triggers**: Tab switch > N times, face not visible > X seconds, audio anomaly
- **Interview timing**: Set expiry window (e.g., link valid for 72 hours)

#### Results Dashboard
- Per-candidate scorecard: overall score, per-competency breakdown, AI summary
- Video recording playback with transcript overlay
- Flag suspicious activity with timestamp markers
- One-click shortlist / reject / hold
- Export report as PDF

### 4.2 Candidate Portal

#### Pre-Interview
- Landing page: company branding, job title, what to expect
- Device check: mic test, camera test, internet speed check
- CV upload (optional — pre-fills context for AI)
- Consent form with recording acknowledgment

#### Live Interview
- Voice-first interface — AI speaks, candidate responds
- Real-time transcription shown to candidate
- Webcam feed visible (to candidate + recorded)
- Progress indicator (Question X of Y)
- Warning system: on-screen toast for suspicious activity
  - "Tab switch detected — Warning 1 of 3"
  - "Face not visible — Warning 2 of 3"
  - "Interview terminated — Max warnings reached"
- Timer per question (configurable)

#### Post-Interview
- "Thank you" screen with next steps
- Optional: instant feedback toggle (hiring team decides)

### 4.3 AI Interview Engine (Core)

| Component | Behavior |
|---|---|
| **Persona** | Acts as Hiring Manager, not mock interviewer |
| **Question Flow** | CV + JD → AI generates adaptive question plan |
| **Follow-ups** | Probes shallow answers with 1-2 follow-up questions |
| **Adaptive Difficulty** | Adjusts next question based on answer quality |
| **Silence Handling** | Prompts after 8s silence: "Take your time..." |
| **Interruption** | Supports barge-in (candidate can interrupt AI) |
| **Language** | English default; Hindi, Spanish, etc. configurable |

### 4.4 Proctoring System (Zara AI Inspired)

| Event | Detection Method | Action |
|---|---|---|
| Tab switch | `visibilitychange` event | Warning +1 |
| Multiple faces | MediaPipe FaceDetection | Warning +1 |
| No face visible | Frame analysis | Warning +1 |
| Suspicious audio | Background voice detection | Warning +1 |
| Copy-paste | `paste` event on text fields | Flag |
| Screen share detect | `getDisplayMedia` check | Block |
| Auto-terminate | `warnings >= max_warning_limit` | End session + notify HR |

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **Latency**: Voice response (STT→LLM→TTS) < 1.5 seconds P95
- **Concurrency**: 500 simultaneous interviews without degradation
- **Availability**: 99.9% uptime SLA
- **Video recording**: Max 2GB per interview, 1080p @ 30fps

### 5.2 Security
- All recordings encrypted at rest (AES-256)
- TLS 1.3 for all connections
- Candidate data GDPR compliant — auto-delete after 90 days (configurable)
- Multi-tenant data isolation at DB row level

### 5.3 Scalability
- Horizontal scaling for agent workers
- LiveKit SFU handles WebRTC load
- Queue-based interview processing (BullMQ)
- CDN for recording delivery

---

## 6. User Stories

### Hiring Team
```
As an HR Manager, I want to create a job posting with a custom question bank
so that the AI asks role-specific questions.

As a Hiring Manager, I want to watch candidate recordings with transcript
so that I can review interviews without attending them live.

As a Company Admin, I want to set max_warning_limit = 2 for senior roles
so that cheating attempts terminate the interview quickly.
```

### Candidate
```
As a Candidate, I want to know before starting that I'm being recorded
so that I can give informed consent.

As a Candidate, I want to see how many questions are left
so that I can manage my time.

As a Candidate, I want my warning count visible
so that I understand what behaviour is being flagged.
```

---

## 7. Out of Scope (V1)

- Live human takeover mid-interview
- Coding sandbox / whiteboard (V2)
- Mobile native app (V2)
- Video resume screening (V2)
- Multi-interviewer panel (V2)

---

## 8. Success Metrics

| Metric | Target (6 months) |
|---|---|
| Daily interviews conducted | 500+ |
| Average interview completion rate | > 75% |
| Average P95 voice latency | < 1.5s |
| Hiring team NPS | > 50 |
| False positive proctoring alerts | < 5% |
| Platform uptime | 99.9% |

---

## 9. Release Phases

| Phase | Scope | Timeline |
|---|---|---|
| Phase 0 | DeepInterview local setup + validation | Week 1 |
| Phase 1 | Hiring Manager Persona + Question Bank | Week 2–3 |
| Phase 2 | Candidate Portal (pre/post interview) | Week 3–4 |
| Phase 3 | Proctoring Engine (tab/face/audio) | Week 4–5 |
| Phase 4 | Hiring Team Dashboard + Scorecard | Week 5–7 |
| Phase 5 | Multi-tenancy + Clerk Auth + Billing | Week 7–9 |
| Phase 6 | Scale hardening + CDN + Queue | Week 9–11 |
| Phase 7 | Beta Launch | Week 12 |
