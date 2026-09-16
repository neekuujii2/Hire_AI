# Best Practices — HireAI
## Architecture Decisions, Anti-Patterns & Production Readiness

---

## 1. Voice Pipeline Best Practices

### DO ✅
```python
# Stream LLM → start TTS on first sentence
async def generate_response(self, prompt: str):
    buffer = ""
    async for chunk in llm.astream(prompt):
        buffer += chunk.content
        if buffer.endswith(('.', '!', '?')) and len(buffer) > 20:
            yield buffer   # TTS starts immediately
            buffer = ""
    if buffer:
        yield buffer
```

### DON'T ❌
```python
# Don't wait for full LLM response before starting TTS
full_response = await llm.ainvoke(prompt)
tts_audio = await tts.synthesize(full_response.content)  # Adds 1-2s latency
```

### End-of-Turn Detection
```python
# Use semantic end-of-turn, not just silence
# Bad: wait 2 seconds of silence
# Good: detect sentence completion + brief pause

SILENCE_THRESHOLD_MS = 800   # 0.8s after sentence ends
PROMPT_THRESHOLD_MS = 8000   # 8s total silence → gentle prompt
```

---

## 2. Multi-Tenancy Best Practices

### Always scope queries to orgId
```typescript
// ✅ Correct
const jobs = await db.jobs.findMany({
  where: { orgId: auth().orgId }   // always filter by org
})

// ❌ Wrong — data leak risk
const jobs = await db.jobs.findMany()
```

### Use DB-level RLS as defense-in-depth
```sql
-- Even if application code has a bug, RLS prevents cross-org access
CREATE POLICY "org_isolation" ON candidates
  USING (org_id = (current_setting('request.jwt.claims')::jsonb->>'org_id')::uuid);
```

### Never expose internal IDs in candidate-facing URLs
```typescript
// ✅ Correct — opaque invite token
/invite/a3f8b2c9d1e4f7a0b5c8d2e6

// ❌ Wrong — exposes internal ID
/invite/session/123
```

---

## 3. Proctoring Best Practices

### Calibrate sensitivity carefully
```python
# Face detection confidence threshold
# Too low (0.5) → many false positives → frustrated candidates
# Too high (0.95) → misses real violations
# Recommended: 0.72 — validated empirically

FACE_CONFIDENCE_THRESHOLD = 0.72

# Check interval: every frame is too expensive (30fps × 500 rooms = 15k ops/sec)
# Every 5 seconds per room = 100 ops/sec — manageable
FACE_CHECK_INTERVAL_SEC = 5.0
```

### Always log with evidence
```python
async def issue_warning(self, reason: str, frame: Optional[np.ndarray] = None):
    screenshot_url = None
    if frame is not None:
        # Save screenshot as evidence — HR can review
        screenshot_url = await upload_screenshot(frame, self.session_id)
    
    await db.proctoring_events.create({
        "event_type": reason,
        "metadata": { "screenshot_url": screenshot_url }
    })
```

### Give candidates benefit of doubt
```
Default max_warning_limit = 3 (not 1 or 2)
- Warning 1: Gentle notice
- Warning 2: Stern notice
- Warning 3: Terminate

Reasoning: internet drops, lighting changes, pets walking by
= false positives are common. Be fair.
```

---

## 4. Scalability Best Practices

### Queue isolation by tier
```typescript
// Paid org = high priority = never waits
await prepQueue.add('prep', { sessionId }, { priority: 1 })

// Free tier = lower priority = may wait up to 2 min
await prepQueue.add('prep', { sessionId }, { priority: 10 })
```

### Fail fast on prep, not on interview
```
Prep runs BEFORE interview starts.
If prep fails → show "We're having trouble setting up. Try again in 5 minutes."
Never let candidate start interview without a completed question plan.
```

### Recording is async — don't block interview on it
```python
# LiveKit Egress handles recording to S3 automatically
# Don't wait for recording to be uploaded before ending session
# Process transcript + scoring AFTER interview, asynchronously via queue
```

### Health checks on everything
```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## 5. Security Best Practices

### Invite tokens: one-time use
```typescript
// After candidate starts interview, invalidate token
await db.candidates.update({
  where: { inviteToken: token },
  data: { 
    inviteToken: null,           // Clear token — can't reuse link
    pipelineStatus: 'interview_started'
  }
})
```

### Recording URLs: signed with expiry
```typescript
// Never store public recording URLs
// Generate signed URL on-demand (1 hour expiry)
const signedUrl = await s3.getSignedUrl('getObject', {
  Bucket: process.env.S3_BUCKET,
  Key: recording.s3Key,
  Expires: 3600   // 1 hour
})
```

### Rate limit candidate endpoints
```typescript
// Public /invite routes are targets for scrapers
import { Ratelimit } from "@upstash/ratelimit"

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),  // 10 req/min per IP
})

const { success } = await ratelimit.limit(ip)
if (!success) return new Response("Too many requests", { status: 429 })
```

### Validate file uploads
```python
# CV uploads: validate file type by magic bytes, not extension
import magic

def validate_cv_upload(file_bytes: bytes) -> bool:
    mime = magic.from_buffer(file_bytes, mime=True)
    return mime in ['application/pdf', 'application/msword', 
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
```

---

## 6. Error Handling Best Practices

### Interview should never crash silently
```python
# Wrap entire interview agent in try/except
# On unexpected error: save transcript so far, notify HR, show candidate friendly message
try:
    await run_interview(session)
except Exception as e:
    await db.sessions.update(session_id, { "status": "terminated_error" })
    await notify_hr(session_id, f"Interview error: {str(e)}")
    await livekit.disconnect(session_id)
    logger.error("Interview crashed", session_id=session_id, error=str(e))
```

### Frontend: handle LiveKit disconnects gracefully
```typescript
room.on(RoomEvent.Disconnected, (reason) => {
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
    // Interview terminated by proctor — show terminated screen
    setInterviewState('terminated')
  } else if (reason === DisconnectReason.SIGNAL_CLOSE) {
    // Network issue — show reconnecting UI
    setInterviewState('reconnecting')
    attemptReconnect()
  }
})
```

---

## 7. Data & Privacy Best Practices

### Auto-delete recordings per org config
```python
# Celery task that runs daily
@celery_app.task
def purge_expired_recordings():
    expired = db.recordings.filter(
        expires_at__lt=datetime.now(),
        status='ready'
    )
    for recording in expired:
        s3.delete_object(Key=recording.s3_key)
        db.recordings.update(recording.id, { "status": "deleted", "video_url": None })
```

### GDPR right-to-delete
```python
# When candidate requests deletion
async def delete_candidate_data(candidate_id: str):
    candidate = await db.candidates.get(candidate_id)
    
    # Delete recording
    if candidate.session and candidate.session.recording:
        await s3.delete(candidate.session.recording.s3_key)
    
    # Delete CV
    if candidate.cv_url:
        await s3.delete(candidate.cv_s3_key)
    
    # Anonymize DB records (don't delete — keep for audit)
    await db.candidates.update(candidate_id, {
        "email": f"deleted_{candidate_id}@redacted.com",
        "name": "[Deleted]",
        "phone": None,
        "cv_url": None,
        "cv_text": None,
    })
    
    # Purge transcript
    await db.transcripts.update(session_id, { "full_text": "[Deleted per GDPR request]", "turns": [] })
```

---

## 8. Monitoring & Observability

### Key metrics to track
```python
# Emit these metrics to Datadog/Prometheus

# Latency
histogram("interview.turn.latency_ms", tags=["org_id", "provider"])
# Queue
gauge("queue.prep.depth", queue.count())
gauge("queue.score.depth", score_queue.count())
# Business
counter("interview.completed")
counter("interview.terminated.proctor")
counter("candidate.shortlisted")
# Errors
counter("interview.error", tags=["error_type"])
```

### Structured logging (every log entry)
```python
import structlog

log = structlog.get_logger()

log.info("interview_started",
    session_id=session_id,
    org_id=org_id,
    job_id=job_id,
    persona_tone=persona_tone,
    question_count=len(question_plan)
)
```

---

## 9. Cost Optimization

### LLM cost by use case
| Use Case | Model | Why |
|---|---|---|
| Prep question generation | GPT-4o | Quality matters — one-time per session |
| Live follow-up generation | GPT-4o-mini | Speed + cost — real-time |
| Interview scoring | GPT-4o | Accuracy matters — final decision |
| Communication style analysis | GPT-4o-mini | Low stakes, high volume |

### TTS cost reduction
```python
# Cache TTS for common phrases (saves ~30% TTS cost)
CACHED_PHRASES = [
    "Thank you for that answer. Let's move on.",
    "That's interesting. Can you tell me more about that?",
    "I see. And what was the outcome of that?",
    "Take your time, I'm listening.",
    "Thank you for your time today. The team will be in touch.",
]

async def speak(self, text: str) -> bytes:
    cache_key = f"tts:{hash(text)}:{self.voice_id}"
    cached = await redis.get(cache_key)
    if cached:
        return cached
    
    audio = await tts.synthesize(text, voice=self.voice_id)
    await redis.setex(cache_key, 86400, audio)  # Cache 24h
    return audio
```

---

## 10. Launch Readiness Checklist

### Technical
- [ ] Load test passed: 500 concurrent interviews on staging
- [ ] P95 voice latency < 1.5s under load
- [ ] All API endpoints have rate limiting
- [ ] Proctoring false positive rate < 5% (tested with 50 candidates)
- [ ] Recording pipeline tested: upload, playback, delete
- [ ] GDPR delete workflow tested end-to-end
- [ ] Error tracking (Sentry) configured and tested
- [ ] Monitoring dashboards live in Datadog

### Business
- [ ] Terms of Service written (AI interview disclosure)
- [ ] Privacy Policy updated (biometric data — face detection)
- [ ] Candidate consent form reviewed by legal
- [ ] 2-3 pilot clients onboarded and tested with real candidates
- [ ] Support documentation: "How to create a job", "How to review candidates"
- [ ] SLA document: 99.9% uptime commitment, response times
