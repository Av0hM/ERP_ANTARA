# Phase 1 Technical Spec: Dependency Graph & Subsystem Health

## 1. Dependency Graph Visualization

### Data Model (Prisma - already exists)
```prisma
model Task {
  // ... existing fields
  dependencyIds String[]  // Array of task IDs this task depends on
}
```

### API: GET `/tasks/dependency-graph`

**Query Params**
- `subsystemId?` - Filter to single subsystem
- `includeCompleted?` - Default false

**Response**
```typescript
interface DependencyGraphResponse {
  nodes: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    subsystem: string;
    assignee: { id: string; name: string } | null;
    isCriticalPath: boolean;
  }>;
  edges: Array<{
    from: string;  // dependency
    to: string;    // dependent
    type: "blocks" | "relates";
  }>;
  criticalPath: string[]; // Task IDs in critical path order
}
```

### Backend Implementation
```typescript
// tasks.service.ts
async getDependencyGraph(subsystemId?: string) {
  const tasks = await this.prisma.task.findMany({
    where: { deletedAt: null, isArchived: false, ...(subsystemId && { subsystemId }) },
    include: { subsystem: true, assignedTo: { select: { id: true, name: true } } },
  });
  
  // Build adjacency list
  // Detect cycles (should not happen but validate)
  // Compute critical path (longest path by estimatedHours)
  // Mark transitive blockers
  
  return { nodes, edges, criticalPath };
}
```

### Frontend: `TaskDependencyGraph` Component
- **Library**: `@xyflow/react` (React Flow) - MIT license, good TypeScript support
- **Location**: `apps/web/src/components/tasks/task-dependency-graph.tsx`
- **Features**:
  - Pan/zoom, mini-map
  - Node color by status (red=overdue, amber=blocked, green=completed)
  - Critical path highlighted with dashed animated line
  - Click node → opens `TaskDetailPanel`
  - Collapsible sidebar in `TaskWorkspace`

---

## 2. Subsystem Health Dashboard

### New Page Route: `/subsystems/:slug`

### Page Components
```
apps/web/src/app/(platform)/subsystems/
  [slug]/
    page.tsx          # Server component - fetches health data
    SubsystemHealthClient.tsx  # Client component with live data
```

### API: GET `/subsystems/:slug/health`

**Response**
```typescript
interface SubsystemHealthResponse {
  subsystem: { id: string; name: string; slug: string; color: string; memberCount: number };
  metrics: {
    velocity: number;
    riskScore: number;
    completionRate: number;
    activeTaskCount: number;
    overdueCount: number;
    blockedCount: number;
    upcomingDeadlines: Array<{ id: string; title: string; deadline: string; priority: TaskPriority }>;
  };
  incomingBlockers: Array<{ taskId: string; title: string; fromSubsystem: string; blockingTask: string }>;
  outgoingBlockers: Array<{ taskId: string; title: string; toSubsystem: string; dependentTask: string }>;
  workload: Array<{ memberId: string; name: string; activeTasks: number; availabilityScore: number }>;
  recentActivity: Array<{ type: "task" | "comment" | "worklog"; timestamp: string; summary: string }>;
}
```

### UI Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Subsystem Header (name, color badge, member avatars)       │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Velocity     │ Risk Score   │ Completion   │ Active Tasks  │
│   73%        │    42        │    68%       │      12       │
├─────────────────────────────────────────────────────────────┤
│ Upcoming Deadlines (5)          │ Incoming Blockers (3)    │
├─────────────────────────────────────────────────────────────┤
│ Outgoing Blockers (2)           │ Workload Balance         │
├─────────────────────────────────────────────────────────────┤
│ Recent Activity Feed                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Integration Timeline View

### New Page Route: `/integration-timeline`

### API: GET `/tasks/integration-timeline`

**Response**
```typescript
interface IntegrationTimelineResponse {
  milestones: Array<{
    id: string;
    name: string;
    date: string;
    type: "PDR" | "CDR" | "TRR" | "INTEGRATION" | "LAUNCH" | "CUSTOM";
    subsystem?: string;
    requiredTasks: string[];
  }>;
  criticalPathTasks: Array<{
    id: string;
    title: string;
    subsystem: string;
    startDate: string;
    endDate: string;
    dependencies: string[];
    isOnCriticalPath: boolean;
    slackDays: number;
  }>;
  conflicts: Array<{
    type: "overlapping_deadlines" | "resource_conflict" | "dependency_cycle";
    severity: "HIGH" | "MEDIUM" | "LOW";
    description: string;
    affectedTasks: string[];
  }>;
}
```

### UI: Gantt-style with React Flow or custom SVG
- Horizontal time axis (weeks)
- Rows = subsystems
- Bars = tasks, colored by priority
- Diamond markers = milestones
- Red warning icons on conflicts

---

## 4. Database Migration for Phase 1

```sql
-- No new tables needed for Phase 1 core features
-- Only indexes for query performance:

CREATE INDEX IF NOT EXISTS "Task_dependencyIds_idx" ON "Task" USING GIN ("dependencyIds");
CREATE INDEX IF NOT EXISTS "Task_subsystemId_status_deadline_idx" ON "Task" ("subsystemId", "status", "deadline");
CREATE INDEX IF NOT EXISTS "WorkLog_userId_startedAt_idx" ON "WorkLog" ("userId", "startedAt");
```

---

## 5. File Creation Checklist

### Backend
- [ ] `apps/api/src/modules/tasks/tasks.service.ts` - add `getDependencyGraph()`, `getIntegrationTimeline()`
- [ ] `apps/api/src/modules/tasks/tasks.controller.ts` - add endpoints
- [ ] `apps/api/src/modules/subsystems/subsystems.service.ts` - add `getHealth()`
- [ ] `apps/api/src/modules/subsystems/subsystems.controller.ts` - add `/health` endpoint
- [ ] Add indexes via Prisma migration

### Frontend
- [ ] `apps/web/src/components/tasks/task-dependency-graph.tsx`
- [ ] `apps/web/src/app/(platform)/subsystems/[slug]/page.tsx`
- [ ] `apps/web/src/app/(platform)/subsystems/[slug]/SubsystemHealthClient.tsx`
- [ ] `apps/web/src/app/(platform)/integration-timeline/page.tsx`
- [ ] `apps/web/src/components/timeline/integration-timeline.tsx`
- [ ] Update `TaskWorkspace` to include dependency graph sidebar
- [ ] Add routes to sidebar navigation

### Tests
- [ ] `tasks.service.spec.ts` - dependency graph logic
- [ ] `subsystems.service.spec.ts` - health computation
- [ ] Component tests for `TaskDependencyGraph`
- [ ] E2E test: create tasks with dependencies → verify graph renders

---

## 6. Effort Estimate

| Task | Backend | Frontend | Total |
|------|---------|----------|-------|
| Dependency Graph API | 1 day | - | 1 day |
| Dependency Graph UI | - | 2 days | 2 days |
| Subsystem Health API | 1 day | - | 1 day |
| Subsystem Health Page | - | 2 days | 2 days |
| Integration Timeline API | 1.5 days | - | 1.5 days |
| Integration Timeline UI | - | 2 days | 2 days |
| Tests & Polish | 1 day | 1 day | 2 days |
| **Total** | **4.5 days** | **7 days** | **~2 weeks** |

---

## 7. Dependencies to Install

```bash
# Frontend
cd apps/web && npm install @xyflow/react@^12.0.0

# Backend - no new deps needed
```