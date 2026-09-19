# AntaraERP Implementation Plan — Bridging Current State to Vision

## Current State Assessment (✅ = Done, ⚠️ = Partial, ❌ = Missing)

| Vision Layer | Current Status | Key Gaps |
|--------------|----------------|----------|
| **Tasks & Subsystems** | ✅ Core model, CRUD, dependencies, statuses, priorities | ❌ Dependency graph visualization, ❌ Cross-subsystem blockers view, ❌ Recurring task templates |
| **Real-time Collaboration** | ✅ Socket.IO gateway, presence, typing, live mutations | ⚠️ WebSocket auth just added (needs integration test), ❌ Offline sync, ❌ Conflict resolution |
| **Worklogs & Calendar** | ✅ Timer + manual, Google Calendar/Drive sync (graceful degradation) | ❌ Recurring calendar events, ❌ Calendar conflict detection, ❌ Worklog approval workflow |
| **Analytics & AI** | ✅ Overview, velocity, heatmap, subsystem breakdown, AI insights/reminders/schedule/workload | ❌ Predictive scheduling, ❌ Resource allocation optimization, ❌ Trend export/reports |
| **Roles & Access** | ✅ OWNER/ADMIN/MEMBER, JWT auth, RBAC guards, audit logging | ❌ Granular subsystem-scoped permissions, ❌ Invite flow, ❌ SSO beyond Google |

---

## Phase 1: Critical UX & Coordination Gaps (Weeks 1-4)

### 1.1 Dependency Graph & Blocker Visualization
**Why**: "structures is blocked on avionics, avionics is blocked on payload" is the actual unit of coordination failure
- Add `TaskDependencyGraph` component (React Flow / D3 force graph)
- Show transitive blockers, critical path highlighting
- API: `GET /tasks/dependency-graph` returning nodes + edges
- Integrate into `TaskWorkspace` as collapsible side panel

### 1.2 Subsystem Health Dashboard
**Why**: Subsystem leads need to see their subsystem's health without a meeting
- New page: `/subsystems/:slug` with velocity, risk, blockers, upcoming deadlines
- "Subsystem lead" role extension (MEMBER + subsystem-scoped ADMIN)
- Roll up cross-subsystem dependencies into "incoming blockers" / "outgoing blockers"

### 1.3 Integration Timeline View
**Why**: Cross-subsystem integration reviews are the highest-risk moments
- New page: `/integration-timeline` showing Gantt-style view of critical path tasks across subsystems
- Milestone markers (PDR, CDR, TRR, integration, launch)
- Conflict detection: overlapping critical-path deadlines

---

## Phase 2: AI Layer Hardening & Predictive Intelligence (Weeks 5-8)

### 2.1 Move AI from Heuristics → Live OpenAI Pipeline
**Why**: "AI-generated risk flags... catching 'this subsystem is three dependencies deep and behind schedule' before a human notices"
- Replace deterministic `buildInsights` with structured OpenAI function calling
- Prompt engineering: feed task graph, worklog patterns, subsystem context
- Cache aggressively (Redis, 5-min TTL), fallback to heuristics on failure
- Add `/ai/regenerate` endpoint for manual refresh

### 2.2 Predictive Schedule Risk
**Why**: Catch schedule slips 1-2 weeks out
- New endpoint: `GET /ai/schedule-risk` 
- Monte Carlo simulation on task durations (use historical worklog variance)
- Output: P50/P90 completion dates per subsystem + critical path

### 2.3 Workload Balancing with Skills/Availability
**Why**: "Workload balancing... do the job a full-time ops person would do"
- Extend `User` model: `skills: string[]`, `weeklyCapacityHours: number`
- AI suggestion: "Move task X from Person A (overloaded) to Person B (has skill Y, 40% capacity)"
- Integrate into `TaskDetailPanel` as "Rebalance" action

---

## Phase 3: Institutional Memory & Decision Infrastructure (Weeks 9-12)

### 3.1 Decision Log (ADR-lite)
**Why**: "Next year's leads inherit a record of why decisions were made instead of starting from zero"
- New model: `DecisionRecord { id, title, context, decision, rationale, alternatives, status, authorId, subsystemId, relatedTaskIds, createdAt }`
- UI: `/decisions` with filter by subsystem, status (proposed/accepted/superseded)
- Link from task comments: "Convert to decision"

### 3.2 Handoff Package Generator
**Why**: "Leaves nothing behind for the next generation — or for a sponsor, judge, or research paper"
- New endpoint: `POST /reports/handoff` 
- Generates PDF/Markdown: subsystem summaries, open risks, key decisions, velocity trends, contact list
- One-click "Export for Sponsor" button on dashboard

### 3.3 Onboarding Knowledge Graph
**Why**: "Every new CubeSat or rocketry team re-invents its own broken process from scratch"
- Seed data: subsystem templates, standard task templates, integration checklists
- "Clone from template" for new subsystems/programs

---

## Phase 4: Program Manager Features (Weeks 13-16)

### 4.1 Resource Allocation Board
**Why**: "Do the job a full-time ops person would do"
- Drag-drop board: People × Subsystems × Weeks
- Shows capacity, conflicts, suggested moves
- Integrates with AI workload suggestions

### 4.2 Review/Meeting Cadence Automation
**Why**: Reduce status meeting overhead
- Recurring "Subsystem Sync" calendar events auto-generated from task density
- Auto-agenda: blockers, decisions needed, upcoming deadlines
- Post-meeting: action items → tasks

### 4.3 Sponsor/Faculty Report Export
**Why**: "Analytics dashboard becomes something you'd put in front of a sponsor... without flinching"
- Branded PDF export with: club health, subsystem status, risk register, milestone tracker
- Scheduled weekly email digest (opt-in)

---

## Phase 5: Polish & Adoption Readiness (Weeks 17-20)

### 5.1 Invite Flow & Team Onboarding
- Email invite → magic link → role/subsystem assignment → guided first task
- "Welcome" dashboard for new members

### 5.2 Mobile/Tablet Optimization for Build Nights
- Touch-friendly task board, large timer buttons
- Offline worklog entry with sync

### 5.3 Performance & Reliability
- Load test Socket.IO with 20 concurrent users
- Prisma query optimization (N+1 elimination)
- Error boundary + Sentry integration

### 5.4 Documentation & Demo Environment
- Public demo with seeded data
- Architecture decision records (ADRs) in repo
- Contribution guide for other teams

---

## Technical Debt to Address Along the Way

| Area | Issue | Fix |
|------|-------|-----|
| **Contracts** | `@orbitalops/contracts` alias in jest config vs `@antara/contracts` | Fix module mapper, publish contracts properly |
| **Tests** | 5/10 test suites fail (ESM/CommonJS mismatch) | Fix jest config `transformIgnorePatterns`, add integration tests |
| **TypeScript** | `baseUrl` deprecation warnings, strict mode gaps | Update tsconfig, enable `noUncheckedIndexedAccess` everywhere |
| **Prisma** | No migration strategy documented | Add `prisma migrate deploy` to CI, seed script |
| **Docker** | API Dockerfile uses `next` as dep (wrong) | Fix multi-stage build, remove Next.js from API |

---

## Success Criteria (from Vision Doc)

| Timeline | Metric |
|----------|--------|
| **Near-term** (Phase 1-2) | Leads stop using spreadsheets/WhatsApp; cross-subsystem blockers visible without meeting; worklogs show honest build hours |
| **Mid-term** (Phase 3-4) | AI catches ≥1 real schedule risk before human; dashboard presentable to sponsor/faculty |
| **Long-term** (Phase 5+) | Another student aerospace team adopts AntaraERP over Notion/Jira |

---

## Prioritization Rule

> **Every feature must answer: "Does this help a subsystem lead know what's blocking them without a meeting, or help a new member understand why a decision was made?"** If not, it's scope creep.

---

## Team Assignment Suggestion

| Phase | Backend Focus | Frontend Focus |
|-------|---------------|----------------|
| 1 | Dependency graph API, subsystem health endpoints | Dependency graph UI, subsystem dashboard page |
| 2 | OpenAI integration, predictive models | AI insight cards, schedule risk view |
| 3 | Decision log model + API, report generator | Decision log UI, handoff export button |
| 4 | Resource allocation engine, meeting automation | Allocation board, meeting agenda view |
| 5 | Invite flow, performance tuning | Onboarding flow, mobile polish |

---

## Immediate Next Steps (This Week)

1. **Fix test infrastructure** - Resolve ESM/CommonJS conflict in Jest (blocks CI confidence)
2. **Integration test WebSocket auth** - Verify P0 security fix works end-to-end
3. **Dependency graph API spike** - 2-day prototype to validate data model + React Flow integration
4. **Decide on OpenAI prompt strategy** - Structured output vs function calling vs RAG

---

*This plan is a living document. Update as velocity and team capacity clarify.*