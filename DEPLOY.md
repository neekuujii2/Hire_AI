# HireAI — Deployment Guide

## Quick Start (Free Tier)

This guide deploys HireAI to **Render** (agent + Redis), **Vercel** (web), and **Cloudflare** (R2 for recordings) using free tiers.

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+
- Supabase project (free tier)
- Clerk account (free tier)
- LiveKit Cloud account (free tier)
- Deepgram API key
- OpenAI API key

---

## 1. Environment Variables

Copy `.env.example` and fill in:

```bash
# Database
DATABASE_URL=postgresql://postgres:2201730068@Neerajkumar@db.wdvmdruqclyhrilknaaq.supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth

CLERK_WEBHOOK_SECRET=whsec_...
CLERK_PUBLISHABLE_KEY=pk_test_cXVpY2stcmF2ZW4tODA5Mi5jbGVyay5hY2NvdW50cy5kZXYk
CLERK_SECRET_KEY=sk_test_284stE1XUyaRrH30OlVTYcaCynI2BdCeVCketORH5b
# AI
GEMINI_API_KEY=sk-...
DEEPGRAM_API_KEY=...

# Voice
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://xxx.livekit.cloud

# Redis
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
```

---

## 2. Supabase Setup

Run migrations in the Supabase SQL editor:

```bash
# Run all migrations in order:
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_add_rls.sql
supabase/migrations/0003_add_prep_fields.sql
supabase/migrations/0004_add_cv_url_column.sql
supabase/migrations/0005_add_question_plan.sql
supabase/migrations/0006_add_session_status_index.sql
supabase/migrations/0007_hireai_schema.sql
```

Key tables created by `0007_hireai_schema.sql`:
- `organizations` — Clerk org sync
- `org_configs` — webhook settings, company values, AI config
- `users` — Clerk user sync
- `jobs` — job postings
- `candidates` — candidate records + pipeline status
- `sessions` — interview sessions
- `scorecards` — scored results
- `transcripts` — full transcripts
- `proctoring_events` — proctoring audit log

---

## 3. Deploy the Agent API (Render)

### Option A: Render Docker (Recommended)

1. Push your repo to GitHub
2. Create a new **Render Docker** service
3. Set environment variables in Render dashboard
4. Render will auto-detect `apps/agent/Dockerfile`

### Option B: Render Python Service

1. Create a new **Render Python** service
2. **Build Command:**
   ```bash
   cd apps/agent && pip install -e .
   ```
3. **Start Command:**
   ```bash
   cd apps/agent && uvicorn deepinterview_agent.api:create_app --factory --host 0.0.0.0 --port 8000
   ```
4. Set environment variables

### Redis (Upstash — Free Tier)

1. Create an Upstash Redis instance (free: 10K commands/day)
2. Copy the `REDIS_URL` to Render environment variables

---

## 4. Deploy the Web App (Vercel)

1. Push repo to GitHub
2. Import project in Vercel dashboard
3. **Framework Preset:** Next.js
4. **Root Directory:** `apps/web`
5. **Build Command:** `cd ../.. && pnpm install --filter web... && pnpm --filter web build`
6. **Output Directory:** `.next`
7. Set all environment variables in Vercel dashboard

### Vercel Environment Variables

Add these to Vercel:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AGENT_URL=https://your-agent.onrender.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
REDIS_URL
```

---

## 5. Webhook Configuration

After deployment, configure webhooks in the HireAI dashboard:

1. Go to **Organization Settings** → **ATS Integrations**
2. Add your webhook endpoint URL
3. Select events: `candidate.shortlisted`, `candidate.rejected`, `interview.completed`
4. (Optional) Set a webhook secret for HMAC-SHA256 signing
5. Click **Send Test** to verify

### Webhook Payload Format

```json
{
  "event": "candidate.shortlisted",
  "timestamp": "2026-09-13T12:00:00Z",
  "data": {
    "candidate": { "id": "...", "name": "...", "email": "..." },
    "job": { "id": "...", "title": "..." },
    "score": { "overall": 4.2, "recommendation": "strong_hire" },
    "report_url": "https://app.hireai.dev/dashboard/jobs/.../candidates/..."
  }
}
```

---

## 6. CSV Import

Import candidates via the dashboard:

1. Go to **Job Detail** → **Candidates** tab
2. Click **Bulk Import**
3. Upload a CSV file with columns: `name`, `email`
4. Preview parsed candidates
5. Click **Import** — candidates are added with `invited` status

---

## 7. Production Hardening

### Docker Compose (Self-Hosted)

For self-hosted production, use `docker-compose.prod.yml`:

```bash
docker compose -f docker-compose.prod.yml up -d
```

This deploys:
- 20 interview-agent replicas
- 3 prep-worker replicas
- 1 agent-api replica
- 1 Redis instance
- 1 web replica

### Health Checks

All services expose health endpoints:
- Agent API: `GET /health`
- Web: `GET /api/health`
- Redis: `PING`

### Monitoring

- Queue stats: `GET /api/admin/queue-stats` (admin only)
- Traces: `GET /api/traces` (requires auth)
- Logs: Render/Vercel dashboard

---

## 8. Domain & SSL

1. Add a custom domain in Vercel (e.g., `app.hireai.dev`)
2. SSL is automatic via Vercel
3. Update `CLERK_FRONTEND_API_URL` and `NEXT_PUBLIC_APP_URL` with your domain
4. Update LiveKit egress URLs if using custom domain

---

## 9. Cost Estimate (Free Tier)

| Service | Free Tier | Paid (Production) |
|---|---|---|
| Vercel | 100GB bandwidth/mo | $20/mo (Pro) |
| Render | 512MB RAM, 750hr/mo | $7/mo (Starter) |
| Supabase | 500MB, 50K rows | $25/mo (Pro) |
| Clerk | 10K MAUs | $25/mo (Pro) |
| Upstash Redis | 10K cmds/day | $10/mo |
| LiveKit Cloud | 50K min/mo | $50/mo |
| Deepgram | $200 credits | Pay-as-you-go |
| OpenAI | $5 credits | Pay-as-you-go |

**Total free tier:** $0/mo (with limits)
**Production estimate:** ~$150–300/mo for moderate usage

---

## 10. Troubleshooting

### Agent won't start
- Check `REDIS_URL` is set and accessible
- Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` match your LiveKit project

### Webhooks not firing
- Verify endpoint URL is publicly accessible
- Check webhook configuration in Org Settings
- Review agent logs for delivery errors

### CSV import fails
- Ensure CSV has `name` and `email` columns
- Check for duplicate emails in the job
- Verify Supabase `candidates` table exists

### Proctoring not working
- Ensure webcam permissions are granted in browser
- MediaPipe loads from CDN — check network access
- Verify `proctoring_events` table exists in Supabase
