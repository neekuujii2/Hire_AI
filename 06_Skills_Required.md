# Skills Required — HireAI Build Team
## Tools, Technologies & Expertise Map

---

## 1. Team Composition

### Solo Developer (You) — Recommended Learning Path
If building solo, prioritize in this order:
1. Next.js + TypeScript (Frontend + API)
2. Python FastAPI (Agent backend — already in DeepInterview)
3. Supabase + PostgreSQL (Database)
4. Clerk (Auth — easiest auth to integrate)
5. LiveKit (already integrated — just extend it)

### Ideal Team (3-5 people)
| Role | Headcount | Scope |
|---|---|---|
| Full-Stack Dev | 2 | Next.js dashboard, API routes, DB |
| AI/Agent Dev | 1 | Python agents, LangGraph, proctoring |
| DevOps | 0.5 | Docker, CI/CD, monitoring |
| Designer | 0.5 | UI polish, design system |

---

## 2. Frontend Skills

### Must Have
| Skill | Usage in HireAI | Resources |
|---|---|---|
| **Next.js 14 (App Router)** | Entire web app, server actions, streaming | nextjs.org/docs |
| **TypeScript** | Type-safe across all TS code | typescriptlang.org |
| **React (hooks, context)** | UI components, state | react.dev |
| **Tailwind CSS** | Styling system | tailwindcss.com |
| **WebRTC (basics)** | LiveKit integration, getUserMedia | MDN WebRTC |
| **Web APIs** | visibilitychange, paste events (proctoring) | MDN Web APIs |

### Good to Have
| Skill | Usage |
|---|---|
| **shadcn/ui** | Pre-built accessible components |
| **Zustand** | Client-side state management |
| **React Query / TanStack** | Server state, caching |
| **React Hook Form + Zod** | Form validation |
| **Recharts** | Scorecard charts |
| **Video.js** | Recording playback |

---

## 3. Backend Skills

### Must Have
| Skill | Usage in HireAI | Resources |
|---|---|---|
| **Python 3.11+** | All agent code (existing in DeepInterview) | python.org |
| **FastAPI** | Agent API server | fastapi.tiangolo.com |
| **LangGraph** | Multi-agent orchestration (prep + score) | langchain-ai.github.io/langgraph |
| **async/await Python** | Non-blocking agent operations | docs.python.org/asyncio |
| **PostgreSQL** | Primary database | postgresql.org |
| **SQL (intermediate)** | Schema design, queries, indexes | postgresqltutorial.com |
| **Redis** | Queue, caching, session state | redis.io |
| **BullMQ** | Job queues for 500 concurrent interviews | docs.bullmq.io |

### Good to Have
| Skill | Usage |
|---|---|
| **Celery** | Python background jobs (scoring, reports) |
| **Pydantic** | Data validation in Python |
| **SQLAlchemy / Prisma** | ORM for DB access |
| **REST API design** | Endpoint design, versioning |

---

## 4. AI & ML Skills

| Skill | Usage in HireAI | Resources |
|---|---|---|
| **LangChain / LangGraph** | Prep + scoring agent pipelines | langchain.com |
| **Prompt Engineering** | Hiring manager persona, rubric scoring prompts | Anthropic Prompting Guide |
| **OpenAI API** | GPT-4o for LLM reasoning | platform.openai.com |
| **Deepgram API** | Streaming STT (speech-to-text) | developers.deepgram.com |
| **LiveKit Agents** | Voice pipeline (STT→LLM→TTS) | docs.livekit.io/agents |
| **ElevenLabs / Cartesia** | TTS (text-to-speech) | elevenlabs.io |
| **MediaPipe** | Face detection for proctoring | mediapipe.dev |
| **pyannote.audio** | Speaker diarization (multiple voice detection) | pyannote.github.io |

---

## 5. DevOps & Infrastructure

| Skill | Usage in HireAI | Resources |
|---|---|---|
| **Docker + Docker Compose** | Container orchestration (already in DeepInterview) | docs.docker.com |
| **GitHub Actions** | CI/CD pipeline | docs.github.com/actions |
| **Nginx** | Reverse proxy, SSL termination | nginx.org |
| **AWS S3 / Cloudflare R2** | Recording + document storage | AWS docs / R2 docs |
| **Supabase** | Managed Postgres + RLS + Auth | supabase.com/docs |
| **LiveKit Cloud** | Managed WebRTC SFU | livekit.io/cloud |

### Good to Have (for scale)
| Skill | Usage |
|---|---|
| **Kubernetes** | If scaling beyond 500 interviews/day |
| **Terraform** | Infrastructure as code |
| **Datadog / Sentry** | Monitoring + error tracking |
| **Cloudflare** | CDN for global recording delivery |

---

## 6. Security Skills

| Skill | Usage |
|---|---|
| **JWT / OAuth 2.0** | Clerk auth tokens |
| **Row Level Security (PostgreSQL)** | Multi-tenant data isolation |
| **CORS + CSP headers** | Web security |
| **Rate limiting** | Protect public candidate endpoints |
| **Signed URLs** | Secure recording access |
| **GDPR basics** | Data retention, right-to-delete |

---

## 7. Tools You'll Use Daily

### Development
| Tool | Purpose |
|---|---|
| **VS Code** | Primary editor |
| **Cursor** | AI-assisted coding |
| **Postman / Hoppscotch** | API testing |
| **TablePlus** | Database GUI |
| **Docker Desktop** | Local container management |
| **pnpm** | Package manager (already in repo) |

### Design
| Tool | Purpose |
|---|---|
| **Figma** | UI design, wireframes |
| **shadcn/ui** | Component library |
| **Lucide Icons** | Icon system |

### Communication & Project
| Tool | Purpose |
|---|---|
| **Linear** | Task/sprint management |
| **Notion** | Documentation |
| **Loom** | Client demos |
| **GitHub** | Code + issues |

---

## 8. What to Learn First (If Starting Today)

### Week 1–2: Foundation
```
1. LiveKit Agents tutorial → understand the voice pipeline
   → docs.livekit.io/agents/quickstart
   
2. LangGraph basics → understand the prep/score graphs
   → langchain-ai.github.io/langgraph/tutorials/introduction
   
3. Next.js App Router → understand the frontend structure
   → nextjs.org/docs/app
```

### Week 3–4: Database + Auth
```
4. Supabase Row Level Security tutorial
   → supabase.com/docs/guides/database/postgres/row-level-security
   
5. Clerk Organizations (multi-tenant)
   → clerk.com/docs/organizations/overview
```

### Week 5–6: AI Providers
```
6. Deepgram streaming STT
   → developers.deepgram.com/docs/live-streaming-audio
   
7. MediaPipe face detection in Python
   → mediapipe.readthedocs.io/face-detection
```

### Week 7+: Scale
```
8. BullMQ job queues
   → docs.bullmq.io/guide/queues
   
9. Docker Compose scaling
   → docs.docker.com/compose/compose-file/deploy
```

---

## 9. Key APIs & Their Cost (Monthly Estimate for 500 interviews/day)

| Service | Usage | Est. Cost/month |
|---|---|---|
| OpenAI GPT-4o | ~15k tokens/interview × 500/day | ~$900 |
| Deepgram Nova-2 | 30 min audio × 500 interviews | ~$750 |
| Cartesia TTS | ~5 min TTS × 500 interviews | ~$200 |
| LiveKit Cloud | 500 rooms × 30 min | ~$500 |
| Supabase Pro | DB + storage | $25 |
| Cloudflare R2 | 500 recordings × 500MB avg | ~$75 |
| **Total** | | **~$2,450/month** |

> Tip: Use GPT-4o-mini for follow-up question generation (80% cheaper) and GPT-4o only for final scoring. Can cut costs to ~$1,200/month.
