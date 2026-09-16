# Implementation Guide — HireAI
## Phase-by-Phase Build Guide (DeepInterview → HireAI)

---

## Phase 0 — Environment Setup & Validation (Week 1)

### 0.1 Clone and Run DeepInterview
```bash
git clone https://github.com/ngoanpv/DeepInterview
cd DeepInterview
pnpm install && pnpm build
pnpm deepinterview init     # Run the key wizard
docker compose up           # Verify full stack runs
```

### 0.2 Validate Core Features Work
- [ ] CV + JD upload → question plan generated
- [ ] Voice interview runs end-to-end (speak → AI responds)
- [ ] Scorecard generates post-interview
- [ ] Recording saves

### 0.3 Set Up Dev Infrastructure
```bash
# Create new repo (fork or fresh)
git checkout -b hireai-v1

# Additional dev tools
pnpm add -D prettier eslint @typescript-eslint/parser
pnpm add @clerk/nextjs @clerk/backend
pnpm add @supabase/supabase-js
pnpm add bullmq ioredis
pnpm add @aws-sdk/client-s3

# Python agent additions
pip install pyannote.audio mediapipe celery[redis] fastapi-limiter
```

### 0.4 Set Up Supabase Project
```bash
# Initialize Supabase CLI
npx supabase init
npx supabase db push   # Run schema from 03_Backend_Schema.md

# Enable Row Level Security
npx supabase db diff   # Verify policies applied
```

---

## Phase 1 — Hiring Manager Persona + Question Bank (Week 2–3)

### 1.1 Add HiringManager Persona to Agent

**File**: `agents/interviewer/personas.py`
```python
HIRING_MANAGER_PERSONA = """
You are {persona_name}, a {persona_tone} hiring manager at {company_name}.
You are conducting a REAL first-round interview for the position of {job_title}.

Your behavior:
- You ask questions from the prepared question plan, one at a time
- You listen carefully and ask 1-2 relevant follow-up questions for shallow answers
- You do NOT reveal you are an AI unless directly asked
- You keep a professional, {persona_tone} tone throughout
- You acknowledge answers briefly before moving to the next question
- When the candidate goes silent for 8 seconds, gently prompt: "Take your time, I'm listening."
- After all questions, thank the candidate and explain next steps

IMPORTANT: You are representing {company_name}. Your goal is to accurately assess the 
candidate's fit for {job_title} based on the rubric: {rubric_summary}

Question Plan:
{question_plan}
"""

def build_hiring_manager_prompt(
    persona_name: str,
    persona_tone: str,
    company_name: str,
    job_title: str,
    rubric_summary: str,
    question_plan: list[dict]
) -> str:
    plan_str = "\n".join(
        f"{i+1}. [{q['category']}] {q['text']}"
        for i, q in enumerate(question_plan)
    )
    return HIRING_MANAGER_PERSONA.format(
        persona_name=persona_name,
        persona_tone=persona_tone,
        company_name=company_name,
        job_title=job_title,
        rubric_summary=rubric_summary,
        question_plan=plan_str
    )
```

### 1.2 Inject Org Context into Prep Graph

**File**: `agents/prep/graph.py` — modify the prep state
```python
class PrepState(TypedDict):
    cv_text: str
    job_description: str
    company_name: str           # NEW
    job_title: str              # NEW
    org_id: str                 # NEW
    question_bank: list[dict]   # NEW — org's custom questions
    rubric: dict                # NEW — org's scoring rubric
    question_plan: list[dict]
    difficulty_ramp: list[int]

# In the question_planner node:
async def question_planner(state: PrepState) -> PrepState:
    # Merge AI-generated questions with org's custom bank
    custom_questions = state.get("question_bank", [])
    # ... existing LangGraph logic ...
    # Inject custom questions at appropriate difficulty levels
    merged_plan = merge_question_plans(ai_plan, custom_questions)
    return {**state, "question_plan": merged_plan}
```

### 1.3 Question Bank API + Editor

**File**: `apps/web/app/api/jobs/[id]/questions/route.ts`
```typescript
import { auth } from '@clerk/nextjs'
import { db } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = auth()
  const bank = await db.questionBanks.findFirst({
    where: { jobId: params.id, orgId }
  })
  return Response.json(bank)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = auth()
  const body = await req.json()  // { questions: [...], rubric: {...} }
  const bank = await db.questionBanks.upsert({
    where: { jobId: params.id },
    update: { questions: body.questions, rubric: body.rubric },
    create: { jobId: params.id, orgId, ...body }
  })
  return Response.json(bank)
}
```

---

## Phase 2 — Candidate Portal (Week 3–4)

### 2.1 Invite Token Flow

**File**: `apps/web/app/invite/[token]/page.tsx`
```typescript
// Token validation on page load
export default async function InvitePage({ params }: { params: { token: string } }) {
  const candidate = await db.candidates.findUnique({
    where: { inviteToken: params.token },
    include: { job: { include: { org: true } } }
  })
  
  if (!candidate) return <InvalidLinkPage />
  if (new Date() > candidate.inviteExpiresAt) return <ExpiredLinkPage />
  if (candidate.pipelineStatus === 'interview_completed') return <AlreadyCompletedPage />
  
  // Mark link as opened
  await db.candidates.update({
    where: { id: candidate.id },
    data: { linkOpenedAt: new Date(), pipelineStatus: 'link_opened' }
  })
  
  return <CandidateLandingPage candidate={candidate} />
}
```

### 2.2 Device Check Component

**File**: `apps/web/components/candidate/DeviceCheck.tsx`
```typescript
'use client'
import { useState, useEffect, useRef } from 'react'

export function DeviceCheck({ onProceed }: { onProceed: () => void }) {
  const [checks, setChecks] = useState({
    camera: 'checking',
    microphone: 'checking', 
    network: 'checking'
  })
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    async function runChecks() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (videoRef.current) videoRef.current.srcObject = stream
        setChecks(c => ({ ...c, camera: 'pass', microphone: 'pass' }))
      } catch {
        setChecks(c => ({ ...c, camera: 'fail', microphone: 'fail' }))
      }
      
      // Network speed check
      const start = Date.now()
      await fetch('/api/ping')
      const latency = Date.now() - start
      setChecks(c => ({ ...c, network: latency < 500 ? 'pass' : 'warn' }))
    }
    runChecks()
  }, [])

  const allPassed = Object.values(checks).every(s => s === 'pass')

  return (
    <div className="device-check-screen">
      <video ref={videoRef} autoPlay muted className="preview" />
      <CheckItem label="Camera" status={checks.camera} />
      <CheckItem label="Microphone" status={checks.microphone} />
      <CheckItem label="Network" status={checks.network} />
      <button disabled={!allPassed} onClick={onProceed}>
        Continue →
      </button>
    </div>
  )
}
```

### 2.3 Consent + CV Upload

```typescript
// apps/web/components/candidate/ConsentForm.tsx
export function ConsentForm({ jobRequiresCv, onSubmit }) {
  const [consent, setConsent] = useState(false)
  const [cv, setCv] = useState<File | null>(null)

  const handleSubmit = async () => {
    if (jobRequiresCv && !cv) return alert('CV required')
    
    const formData = new FormData()
    if (cv) formData.append('cv', cv)
    formData.append('consent', 'true')
    
    await fetch('/api/sessions/prepare', { method: 'POST', body: formData })
    onSubmit()
  }

  return (
    <form>
      <p>This interview will be recorded and analyzed by AI on behalf of {company}.</p>
      <label>
        <input type="checkbox" onChange={e => setConsent(e.target.checked)} />
        I consent to being recorded
      </label>
      {jobRequiresCv && (
        <input type="file" accept=".pdf,.doc,.docx" onChange={e => setCv(e.target.files?.[0])} />
      )}
      <button disabled={!consent} onClick={handleSubmit}>
        Start Interview
      </button>
    </form>
  )
}
```

---

## Phase 3 — Proctoring Engine (Week 4–5)

### 3.1 Frontend Proctoring Monitor

**File**: `apps/web/components/interview/ProctorMonitor.tsx`
```typescript
'use client'
import { useEffect, useCallback } from 'react'

interface ProctorMonitorProps {
  sessionId: string
  onWarning: (warning: { type: string; count: number }) => void
  onTerminate: () => void
}

export function ProctorMonitor({ sessionId, onWarning, onTerminate }: ProctorMonitorProps) {
  const reportEvent = useCallback(async (type: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/warning`, {
      method: 'POST',
      body: JSON.stringify({ type }),
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await res.json()
    onWarning({ type, count: data.warning_count })
    if (data.terminate) onTerminate()
  }, [sessionId, onWarning, onTerminate])

  useEffect(() => {
    // 1. Tab switch
    const handleVisibility = () => {
      if (document.hidden) reportEvent('tab_switch')
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // 2. Copy-paste block
    const handlePaste = () => reportEvent('copy_paste')
    document.addEventListener('paste', handlePaste)

    // 3. Screen share block
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getDisplayMedia = async () => {
      reportEvent('screen_share_attempt')
      throw new Error('Screen sharing is not allowed during the interview.')
    }

    // 4. Right-click disable
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('contextmenu', handleContextMenu)
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia
    }
  }, [reportEvent])

  return null  // Invisible monitor
}
```

### 3.2 Backend Proctoring Service (Python)

**File**: `agents/proctoring/monitor.py`
```python
import asyncio
import mediapipe as mp
from livekit import agents
from livekit.agents import rtc
from pyannote.audio import Pipeline as DiarizationPipeline

class ProctorAgent(agents.Agent):
    """Runs alongside InterviewAgent, monitors video+audio frames"""
    
    def __init__(self, session_id: str, max_warnings: int, db, notifier):
        self.session_id = session_id
        self.max_warnings = max_warnings
        self.warning_count = 0
        self.db = db
        self.notifier = notifier
        
        # MediaPipe face detection
        self.face_detector = mp.solutions.face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.7
        )
        
        # Frame sampling: check every 5 seconds (not every frame)
        self.last_face_check = 0
        self.FACE_CHECK_INTERVAL = 5.0

    async def on_video_frame(self, frame: rtc.VideoFrame):
        now = asyncio.get_event_loop().time()
        if now - self.last_face_check < self.FACE_CHECK_INTERVAL:
            return
        self.last_face_check = now
        
        # Convert frame to numpy array
        img = frame_to_numpy(frame)
        results = self.face_detector.process(img)
        
        if not results.detections:
            await self.issue_warning("no_face_visible", severity="medium")
        elif len(results.detections) > 1:
            await self.issue_warning("multiple_faces", severity="high")

    async def issue_warning(self, reason: str, severity: str = "medium"):
        self.warning_count += 1
        
        # Persist to DB
        await self.db.proctoring_events.create({
            "session_id": self.session_id,
            "event_type": reason,
            "warning_number": self.warning_count,
            "severity": severity
        })
        
        # Notify frontend via LiveKit data channel
        await self.notifier.send_warning(self.session_id, {
            "type": "warning",
            "reason": reason,
            "count": self.warning_count,
            "max": self.max_warnings
        })
        
        # Check termination
        if self.warning_count >= self.max_warnings:
            await self.terminate()

    async def terminate(self):
        await self.db.sessions.update(self.session_id, {
            "status": "terminated_proctor",
            "termination_reason": f"Max warnings ({self.max_warnings}) exceeded"
        })
        # Disconnect candidate from room
        await self.room.disconnect()
```

### 3.3 Warning Toast UI

```typescript
// apps/web/components/interview/WarningToast.tsx
export function WarningToast({ warning, maxWarnings }: WarningToastProps) {
  const isFinal = warning.count >= maxWarnings - 1
  
  return (
    <div className={`warning-toast ${isFinal ? 'warning-toast--critical' : ''}`}>
      <span className="warning-icon">⚠️</span>
      <div>
        <p className="warning-title">
          {REASON_LABELS[warning.reason]} — Warning {warning.count} of {maxWarnings}
        </p>
        {isFinal && (
          <p className="warning-subtitle">
            One more warning will terminate this interview.
          </p>
        )}
      </div>
    </div>
  )
}

const REASON_LABELS = {
  tab_switch: 'Tab switch detected',
  no_face_visible: 'Face not visible',
  multiple_faces: 'Multiple people detected',
  copy_paste: 'Copy-paste detected',
  screen_share_attempt: 'Screen share blocked'
}
```

---

## Phase 4 — Hiring Team Dashboard (Week 5–7)

### 4.1 Jobs List Page

```typescript
// apps/web/app/dashboard/jobs/page.tsx
import { auth } from '@clerk/nextjs'
import { db } from '@/lib/db'

export default async function JobsPage() {
  const { orgId } = auth()
  const jobs = await db.jobs.findMany({
    where: { orgId, status: { not: 'closed' } },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { candidates: true } } }
  })
  
  return <JobsGrid jobs={jobs} />
}
```

### 4.2 Candidate Pipeline (Kanban)

```typescript
// apps/web/components/dashboard/CandidateKanban.tsx
const PIPELINE_COLUMNS = [
  { id: 'invited', label: 'Invited', color: 'blue' },
  { id: 'interview_completed', label: 'Completed', color: 'purple' },
  { id: 'shortlisted', label: 'Shortlisted', color: 'green' },
  { id: 'rejected', label: 'Rejected', color: 'red' },
]

export function CandidateKanban({ candidates, onStatusChange }) {
  return (
    <div className="kanban-board">
      {PIPELINE_COLUMNS.map(col => (
        <KanbanColumn
          key={col.id}
          column={col}
          candidates={candidates.filter(c => c.pipelineStatus === col.id)}
          onDrop={(candidateId) => onStatusChange(candidateId, col.id)}
        />
      ))}
    </div>
  )
}
```

### 4.3 Scorecard Generation (LangGraph Node)

**File**: `agents/scoring/graph.py`
```python
async def score_interview(state: ScoringState) -> ScoringState:
    transcript = state["transcript"]
    rubric = state["rubric"]
    question_plan = state["question_plan"]
    
    scoring_prompt = f"""
    You are scoring an interview transcript for: {state['job_title']} at {state['company_name']}.
    
    Rubric competencies and weights:
    {json.dumps(rubric['competencies'], indent=2)}
    
    Transcript:
    {transcript}
    
    For each competency, provide:
    1. A score from 0-100
    2. Specific evidence from the transcript (quote or paraphrase)
    3. 2-3 strengths observed
    4. 2-3 areas for improvement
    
    Also provide:
    - Overall recommendation: strong_yes | yes | maybe | no | strong_no
    - A 2-3 sentence executive summary
    - 3 suggested follow-up questions for human interview
    
    Respond in JSON format only.
    """
    
    response = await llm.ainvoke(scoring_prompt)
    scores = json.loads(response.content)
    
    # Compute weighted overall score
    overall = sum(
        scores['competency_scores'][c['name']] * c['weight']
        for c in rubric['competencies']
    )
    
    return {**state, "scorecard": scores, "overall_score": overall}
```

---

## Phase 5 — Multi-Tenancy + Auth (Week 7–9)

### 5.1 Clerk Middleware Setup

**File**: `apps/web/middleware.ts`
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/invite/(.*)',    // Candidate portal
  '/api/sessions/prepare',
  '/api/ping',
])

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) auth().protect()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
```

### 5.2 Clerk Webhook Sync

**File**: `apps/web/app/api/webhooks/clerk/route.ts`
```typescript
import { Webhook } from 'svix'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.text()
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  const event = wh.verify(body, Object.fromEntries(req.headers)) as any
  
  if (event.type === 'organization.created') {
    await db.organizations.create({
      data: {
        clerkOrgId: event.data.id,
        name: event.data.name,
        slug: event.data.slug,
      }
    })
    // Create default org config
    await db.orgConfigs.create({ data: { orgId: newOrg.id } })
  }
  
  if (event.type === 'organizationMembership.created') {
    await db.users.upsert({ /* sync user */ })
  }
  
  return new Response('ok')
}
```

---

## Phase 6 — Scale Hardening (Week 9–11)

### 6.1 BullMQ Interview Queue

**File**: `services/queue/interview-queue.ts`
```typescript
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)

// Producer: called when session is created
export const prepQueue = new Queue('interview-prep', { connection: redis })
export const scoreQueue = new Queue('interview-score', { connection: redis })

export async function enqueuePrep(sessionId: string, priority: 'high' | 'normal' = 'normal') {
  await prepQueue.add('prep', { sessionId }, {
    priority: priority === 'high' ? 1 : 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  })
}

// Worker: runs on agent servers
const prepWorker = new Worker('interview-prep', async (job) => {
  const { sessionId } = job.data
  await fetch(`${process.env.AGENT_API_URL}/agent/prep`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId })
  })
}, { connection: redis, concurrency: 25 })  // 25 per worker × 20 workers = 500
```

### 6.2 LiveKit Room Management

```python
# agents/room_manager.py
from livekit import api

class RoomManager:
    def __init__(self):
        self.lk = api.LiveKitAPI(
            url=settings.LIVEKIT_URL,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET
        )
    
    async def create_interview_room(self, session_id: str) -> str:
        room_name = f"interview-{session_id}"
        await self.lk.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                max_participants=3,     # candidate + AI agent + proctor
                empty_timeout=300,      # auto-close after 5min empty
                departure_timeout=30,   # close 30s after last participant
                egress=api.RoomCompositeEgressRequest(
                    room_name=room_name,
                    layout="speaker",
                    file_outputs=[api.EncodedFileOutput(
                        file_type=api.EncodedFileType.MP4,
                        filepath=f"recordings/{session_id}/video.mp4",
                        s3=api.S3Upload(bucket=settings.S3_BUCKET)
                    )]
                )
            )
        )
        return room_name
```

### 6.3 Docker Compose for Scale

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  web:
    image: hireai/web:latest
    replicas: 3
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "3000"

  interview-agent:
    image: hireai/agent:latest
    deploy:
      replicas: 20
      resources:
        limits:
          cpus: '2'
          memory: 4G
    environment:
      - LIVEKIT_URL=${LIVEKIT_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}

  proctor-service:
    image: hireai/proctor:latest
    deploy:
      replicas: 5
    environment:
      - REDIS_URL=${REDIS_URL}

  celery-worker:
    image: hireai/celery:latest
    command: celery -A tasks worker --concurrency=10
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

---

## Phase 7 — Beta Launch Checklist (Week 12)

### Pre-Launch
- [ ] Load test: simulate 500 concurrent interviews (k6 or Locust)
- [ ] Penetration test: auth bypass, token forgery, recording access
- [ ] GDPR compliance review: right-to-delete, data retention
- [ ] Monitoring: Datadog dashboards for latency, queue depth, error rate
- [ ] Runbook: on-call playbook for common incidents

### Launch Day
- [ ] Enable rate limiting on all public endpoints
- [ ] Set up status page (statuspage.io or similar)
- [ ] Onboard 2-3 beta clients with white-glove support
- [ ] Monitor P95 latency hourly for first 48 hours

### Post-Launch Monitoring
```
Alerts to set:
- P95 voice latency > 2s for 5 minutes → PagerDuty
- Queue depth > 100 for 10 minutes → Scale up workers
- Error rate > 1% for 5 minutes → Investigate
- Recording failure rate > 5% → Check S3/LiveKit egress
```
