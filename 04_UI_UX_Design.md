# UI/UX Design Document — HireAI
## Design System, Screen Flows & Wireframes

---

## 1. Design Language

### 1.1 Brand Identity
- **Product Name**: HireAI
- **Tagline**: "Interview at scale. Hire with confidence."
- **Personality**: Precise, trustworthy, modern — like a great hiring manager: sharp but not cold
- **Visual DNA**: Enterprise-grade but not corporate-stiff. Clarity over decoration.

### 1.2 Color Palette
```
Primary     #1A1F36  (Deep Navy)       — authority, trust
Accent      #4F6EF7  (Electric Blue)   — action, AI, energy
Success     #10B981  (Emerald)         — completed, shortlisted
Warning     #F59E0B  (Amber)           — proctoring alerts
Danger      #EF4444  (Red)             — terminated, rejected
Surface     #F8FAFC  (Off-White)       — page background
Card        #FFFFFF  (White)           — card surfaces
Border      #E2E8F0  (Light Gray)      — separators
Text-1      #0F172A  (Near Black)      — headings
Text-2      #475569  (Slate)           — body text
Text-3      #94A3B8  (Muted)           — captions, metadata
```

### 1.3 Typography
```
Display:  Inter — 600/700 weight — headings, job titles
Body:     Inter — 400/500 weight — paragraphs, labels
Mono:     JetBrains Mono — transcripts, code, timestamps

Scale:
  xs:  12px / 16px line
  sm:  14px / 20px line
  base:16px / 24px line
  lg:  18px / 28px line
  xl:  20px / 30px line
  2xl: 24px / 32px line
  3xl: 30px / 38px line
  4xl: 36px / 44px line
```

### 1.4 Component Tokens
```
border-radius: 8px (cards), 6px (inputs), 4px (badges), 999px (pills)
shadow-sm: 0 1px 3px rgba(0,0,0,0.08)
shadow-md: 0 4px 12px rgba(0,0,0,0.10)
shadow-lg: 0 8px 30px rgba(0,0,0,0.12)
transition: 150ms ease (interactions), 300ms ease (modals)
```

---

## 2. Information Architecture

### 2.1 Hiring Team Portal (Authenticated)
```
/dashboard                      → Overview stats, recent activity
/jobs                           → Job listing (grid/list toggle)
/jobs/new                       → Create job wizard (3 steps)
/jobs/[id]                      → Job detail
/jobs/[id]/candidates           → Candidate pipeline (Kanban + table)
/jobs/[id]/candidates/[cid]     → Candidate detail + recording
/jobs/[id]/settings             → Job interview config
/jobs/[id]/questions            → Question bank editor
/settings                       → Org settings, branding, team
/settings/team                  → Add/remove team members
/settings/billing               → Plan, usage, invoices
```

### 2.2 Candidate Portal (Public / Token-gated)
```
/invite/[token]                 → Landing page (company branding)
/invite/[token]/check           → Device check (mic + camera)
/invite/[token]/consent         → Recording consent + CV upload
/invite/[token]/waiting         → AI prep in progress
/invite/[token]/interview       → Live interview room
/invite/[token]/complete        → Thank you + next steps
```

---

## 3. Screen-by-Screen Wireframes (ASCII)

### 3.1 Hiring Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  🔷 HireAI    [Acme Corp ▾]              [Alex Chen ▾]      │
├────────┬────────────────────────────────────────────────────┤
│ 📊 Dash│  Good morning, Alex                                │
│ 💼 Jobs│  ────────────────────────────────────────────────  │
│ 👤 Team│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│ ⚙ Set. │  │  Active  │  │ This Week│  │Avg Score │         │
│        │  │   Jobs   │  │Interviews│  │          │         │
│        │  │    12    │  │   47     │  │  73/100  │         │
│        │  └──────────┘  └──────────┘  └──────────┘         │
│        │                                                    │
│        │  Recent Activity ──────────────────────────────── │
│        │  ● Priya Singh completed interview  · 5m ago       │
│        │  ● 3 new applications (Frontend Dev) · 12m ago     │
│        │  ● Rahul Kumar: Warning #2 issued   · 1h ago       │
│        │  ● Interview terminated (suspicious) · 2h ago      │
│        │                                                    │
│        │  [+ Create New Job]                                │
└────────┴────────────────────────────────────────────────────┘
```

### 3.2 Candidate Pipeline (Kanban View)
```
┌─ Senior Backend Engineer ───────────────────────── [⚙ Settings] ─┐
│ [Table View] [Kanban View ●]    [Invite Candidate]  [Copy Link]   │
├──────────────┬──────────────┬──────────────┬─────────────────────┤
│  INVITED     │  COMPLETED   │  SHORTLISTED │  REJECTED           │
│  (23)        │  (18)        │  (7)         │  (8)                │
│ ─────────    │ ─────────    │ ─────────    │ ─────────           │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │                     │
│ │ Ankit S. │ │ │ Priya S. │ │ │ Dev M.   │ │                     │
│ │ Invited  │ │ │ Score:87 │ │ │ Score:91 │ │                     │
│ │ 2h ago   │ │ │ ★★★★☆  │ │ │ ★★★★★  │ │                     │
│ └──────────┘ │ │[Review ▶]│ │ [View]   │ │                     │
│              │ └──────────┘ │ └──────────┘ │                     │
│ ┌──────────┐ │              │              │                     │
│ │ Meera K. │ │ ┌──────────┐ │              │                     │
│ │ Link Open│ │ │ Sanjay T.│ │              │                     │
│ │ 30m ago  │ │ │ Score:62 │ │              │                     │
│ └──────────┘ │ │ ⚠️ 2 warn │ │              │                     │
│              │ │[Review ▶]│ │              │                     │
│              │ └──────────┘ │              │                     │
└──────────────┴──────────────┴──────────────┴─────────────────────┘
```

### 3.3 Candidate Scorecard Page
```
┌─ Priya Singh ─ Senior Backend Engineer ──────────────────────────┐
│ [← Back]               [Shortlist]  [Reject]  [Hold]  [↓ PDF]   │
│                                                                   │
│ ┌─── Overall Score ────────────────────────────────────────────┐ │
│ │                                                               │ │
│ │  87 / 100     Grade: A-     Recommendation: ✅ YES           │ │
│ │                                                               │ │
│ │  ████████████████████░░░░  87%                               │ │
│ └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─── Competencies ─────────────────────────────────────────────┐ │
│ │  Communication     ████████████████░░░░  82%                 │ │
│ │  Problem Solving   ██████████████████░░  88%                 │ │
│ │  Technical Depth   ████████████████░░░░  81%                 │ │
│ │  Culture Fit       ███████████████░░░░░  76%                 │ │
│ └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─── AI Summary ───────────────────────────────────────────────┐ │
│ │  Priya demonstrated strong systems design thinking and gave   │ │
│ │  excellent examples of scaling distributed systems. She was   │ │
│ │  concise and structured. Culture fit showed confidence but    │ │
│ │  could improve on collaborative scenarios.                    │ │
│ └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─── Recording ────────────────────────────────────────────────┐ │
│ │  [▶ Play]  Duration: 28:14   No proctoring flags              │ │
│ │  ┌────────────────────────────────────┐                       │ │
│ │  │  [  VIDEO PLAYER  ]  0:00 / 28:14 │                       │ │
│ │  └────────────────────────────────────┘                       │ │
│ │  Transcript ────────────────────────────────────────────────  │ │
│ │  00:12  AI:  "Tell me about a system you scaled..."           │ │
│ │  00:18  You: "Sure, at my last company we had a service..."   │ │
│ └───────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### 3.4 Job Creation Wizard (3 Steps)
```
Step 1: Job Details
┌─────────────────────────────────────────────────┐
│  Create New Job  ● Step 1 ── Step 2 ── Step 3   │
│ ─────────────────────────────────────────────── │
│  Job Title *                                    │
│  [Senior Backend Engineer              ]        │
│                                                 │
│  Department         Seniority Level             │
│  [Engineering ▾]    [Senior          ▾]         │
│                                                 │
│  Job Description *                              │
│  [Upload JD PDF]  or  paste below               │
│  ┌─────────────────────────────────────────┐    │
│  │  We are looking for a Senior Backend... │    │
│  └─────────────────────────────────────────┘    │
│                                           [Next →]│
└─────────────────────────────────────────────────┘

Step 2: Interview Config
┌─────────────────────────────────────────────────┐
│  Configure Interview  Step 1 ── ● Step 2 ── 3   │
│ ─────────────────────────────────────────────── │
│  AI Interviewer Name    Tone                    │
│  [Alex              ]   [Professional ▾]        │
│                                                 │
│  Duration              Language                 │
│  [30 minutes ▾]         [English     ▾]         │
│                                                 │
│  Proctoring Settings                            │
│  [✓] Enable webcam monitoring                  │
│  [✓] Auto-terminate on warnings                │
│  Max Warnings:  [3  ] (1-5)                     │
│                                                 │
│  [✓] Require CV upload from candidates          │
│  [ ] Enable instant feedback to candidates      │
│                           [← Back]  [Next →]   │
└─────────────────────────────────────────────────┘

Step 3: Question Bank
┌─────────────────────────────────────────────────┐
│  Questions  Step 1 ── Step 2 ── ● Step 3        │
│ ─────────────────────────────────────────────── │
│  [✓ Use AI-generated questions from JD]          │
│  [ ] Use custom question bank                   │
│                                                 │
│  AI-generated preview:                          │
│  1. Describe your experience with distributed   │
│     systems at scale.              [Technical]  │
│  2. Walk me through a time you debugged a       │
│     production incident.           [Behavioral] │
│  3. How do you prioritize technical debt?       │
│                                    [Technical]  │
│                                                 │
│  [+ Add Custom Question]   [Import from CSV]    │
│                                                 │
│                     [← Back]  [Create Job ✓]   │
└─────────────────────────────────────────────────┘
```

### 3.5 Candidate Interview Room
```
┌─────────────────────────────────────────────────────────────┐
│  🔷 HireAI  |  Senior Backend Engineer @ Acme Corp          │
│             |  Question 3 of 8    [Timer: 1:42]             │
├──────────────────────────────────┬──────────────────────────┤
│                                  │                          │
│   ┌──────────────────────────┐   │  ┌────────────────────┐  │
│   │                          │   │  │  Your Camera       │  │
│   │    AI AVATAR             │   │  │  [●REC]            │  │
│   │    (Speaking animation)  │   │  └────────────────────┘  │
│   │                          │   │                          │
│   │    Alex                  │   │  Live Transcript         │
│   │    Hiring Manager        │   │  ──────────────────────  │
│   └──────────────────────────┘   │  AI: "Can you walk me    │
│                                  │  through how you'd        │
│   ┌──────────────────────────┐   │  design a rate limiter   │
│   │  🎙 Listening...         │   │  for an API gateway?"    │
│   │  ▁▃▅▇▅▃▁▂▄▆▄▂           │   │                          │
│   └──────────────────────────┘   │  You: "Sure, I would     │
│                                  │  start by identifying..." │
│   ● ● ● ● ● ● ● ●  (progress)  │                          │
│                                  │                          │
│   [🎤 Mic: On]  [📷 Cam: On]   │                          │
└──────────────────────────────────┴──────────────────────────┘

Warning Toast (appears on suspicious activity):
┌─────────────────────────────────────────────────┐
│  ⚠️  Tab switch detected — Warning 2 of 3       │
│  One more warning will terminate this interview  │
└─────────────────────────────────────────────────┘
```

### 3.6 Device Check Screen (Candidate)
```
┌─────────────────────────────────────────────────┐
│  Acme Corp — Senior Backend Engineer            │
│  ─────────────────────────────────────────────  │
│  Let's make sure everything works               │
│                                                 │
│  ┌────────────────────────────────────────────┐ │
│  │  Camera Preview                            │ │
│  │  [  Your face should appear here  ]        │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ✅ Camera detected: FaceTime HD Camera         │
│  ✅ Microphone detected: Built-in Microphone    │
│  ✅ Connection: 42 Mbps — Good                  │
│                                                 │
│  Mic Test: [Speak now to test →]                │
│  ▁▃▅▇▃▁▂▄   Level looks good!                 │
│                                                 │
│  [← Go Back]          [Continue →]             │
└─────────────────────────────────────────────────┘
```

---

## 4. UX Principles

### For Hiring Team
1. **Density with clarity** — Show max info per screen without crowding (table + preview panel pattern)
2. **One-click actions** — Shortlist/Reject without opening scorecard first
3. **Proactive alerts** — Don't make HR hunt for proctoring issues; surface them prominently
4. **Batch operations** — Select multiple candidates → bulk action (invite, export, reject)

### For Candidates
1. **Reduce anxiety first** — Device check screen, clear expectations, visible timer
2. **Progressive disclosure** — Don't show everything at once; guide step by step
3. **Transparency** — Always show warning count, question progress, recording status
4. **Recovery paths** — Mic disconnects? Clear reconnect prompt, not error

### Accessibility
- WCAG 2.1 AA compliant
- All interactive elements keyboard navigable
- Screen reader labels on audio visualization
- `prefers-reduced-motion` respected (no animations)
- Minimum 4.5:1 contrast ratio on all text
- Font size minimum 14px for body content

---

## 5. States & Empty States

| Screen | Empty State Copy |
|---|---|
| Jobs list (no jobs) | "No jobs yet. Create your first job posting to start interviewing." |
| Candidates (none invited) | "No candidates yet. Invite candidates via email or share the apply link." |
| Completed pipeline (empty) | "Interviews in progress will appear here once completed." |
| Recording (processing) | "Recording is being processed. Check back in a few minutes." |

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | 375px | Not supported (show redirect message: "Use desktop for interviews") |
| Tablet | 768px | Single column, collapsed sidebar |
| Desktop | 1280px | Full two-column layout |
| Wide | 1536px | Dashboard with 3-column stats |

> **Note**: Candidate interview room requires desktop browser. Mobile is blocked by design for proctoring accuracy.
