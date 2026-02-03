# Autonomous Task Execution System - Plan

## Goal
A system that monitors rate limits, plans task execution based on model availability, and runs autonomously for extended periods (days/weeks) to accomplish targets.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Task System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Rate Limit   │    │ Task Queue   │    │ Scheduler    │       │
│  │ Monitor      │───▶│ (Persistent) │◀───│              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Task Executor (Daemon)                   │       │
│  │  - Runs continuously in background                    │       │
│  │  - Picks tasks when models available                  │       │
│  │  - Handles failures/retries                           │       │
│  │  - Reports progress                                   │       │
│  └──────────────────────────────────────────────────────┘       │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Persistence Layer                        │       │
│  │  - SQLite for task queue                              │       │
│  │  - Rate limit state                                   │       │
│  │  - Execution history                                  │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Rate Limit Monitor
**Purpose:** Track usage and predict availability

```typescript
interface RateLimitState {
  modelName: string;
  currentUsage: number;
  maxRequests: number;
  windowStart: number;
  windowDuration: number;  // ms
  resetAt: number;         // timestamp when limit resets
}

interface RateLimitMonitor {
  getState(model: string): RateLimitState;
  recordUsage(model: string): void;
  getNextAvailable(model: string): number;  // timestamp
  getAvailableModels(): string[];           // models with capacity now
  predictAvailability(timeRange: number): ModelAvailability[];
}
```

**Key Features:**
- Real-time tracking of all model usage
- Prediction of when models become available
- Persist state across restarts

### 2. Task Queue (Persistent)
**Purpose:** Store and manage tasks with priorities and dependencies

```typescript
interface Task {
  id: string;
  title: string;
  prompt: string;
  category: 'planning' | 'coding' | 'review' | 'quick' | 'vision' | 'image_gen';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'blocked';
  
  // Dependencies
  dependsOn: string[];           // task IDs that must complete first
  blockedBy?: string;            // task ID currently blocking this
  
  // Scheduling
  preferredModel?: string;       // specific model preference
  scheduledFor?: number;         // timestamp when scheduled to run
  deadline?: number;             // must complete by this time
  
  // Execution
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  result?: any;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  estimatedDuration?: number;    // ms, for scheduling
}

interface TaskQueue {
  add(task: Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt'>): string;
  get(id: string): Task | null;
  update(id: string, updates: Partial<Task>): void;
  remove(id: string): void;
  
  getReady(): Task[];            // tasks ready to run (deps met, not blocked)
  getPending(): Task[];          // all pending tasks
  getByStatus(status: Task['status']): Task[];
  
  // Bulk operations for projects
  addProject(tasks: Task[], projectId: string): string[];
}
```

**Storage:** SQLite database at `~/.clawdbot/task-queue.db`

### 3. Scheduler
**Purpose:** Match tasks to available models optimally

```typescript
interface SchedulerConfig {
  maxConcurrent: number;         // max parallel tasks
  lookAheadWindow: number;       // how far ahead to schedule (ms)
  retryDelay: number;            // delay between retries
  priorityWeights: Record<Task['priority'], number>;
}

interface ScheduleDecision {
  taskId: string;
  model: string;
  scheduledFor: number;
  estimatedCompletion: number;
}

interface Scheduler {
  schedule(): ScheduleDecision[];  // plan next batch of tasks
  reschedule(taskId: string): void;
  getSchedule(): ScheduleDecision[];
  
  // Optimization
  optimizeForDeadlines(): void;    // prioritize tasks with deadlines
  balanceLoad(): void;             // distribute across models
}
```

**Scheduling Algorithm:**
1. Get all ready tasks (dependencies met)
2. Sort by priority, then by deadline, then by creation time
3. For each task:
   - Find best available model (preferred or category default)
   - If model available now → schedule immediately
   - If model unavailable → schedule for reset time
4. Respect max concurrent limit
5. Re-evaluate when any task completes

### 4. Task Executor (Daemon)
**Purpose:** Run continuously, execute scheduled tasks

```typescript
interface ExecutorConfig {
  pollInterval: number;          // how often to check for tasks (ms)
  healthCheckInterval: number;   // how often to report status
  gracefulShutdownTimeout: number;
}

interface Executor {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  
  getStatus(): ExecutorStatus;
  getRunningTasks(): Task[];
  
  // Events
  on(event: 'taskStart', handler: (task: Task) => void): void;
  on(event: 'taskComplete', handler: (task: Task, result: any) => void): void;
  on(event: 'taskFailed', handler: (task: Task, error: Error) => void): void;
  on(event: 'idle', handler: () => void): void;
}

interface ExecutorStatus {
  running: boolean;
  paused: boolean;
  currentTasks: number;
  completedToday: number;
  failedToday: number;
  nextScheduled?: { task: Task; at: number };
  uptime: number;
}
```

**Daemon Implementation:**
- Run as background process via `pm2` or `launchd`
- Persist PID for control commands
- Graceful shutdown handling
- Health monitoring endpoint

### 5. Persistence Layer
**Purpose:** Survive restarts, track history

**SQLite Schema:**
```sql
-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  depends_on TEXT,  -- JSON array
  preferred_model TEXT,
  scheduled_for INTEGER,
  deadline INTEGER,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Rate limit state
CREATE TABLE rate_limits (
  model TEXT PRIMARY KEY,
  current_usage INTEGER DEFAULT 0,
  max_requests INTEGER,
  window_start INTEGER,
  window_duration INTEGER,
  updated_at INTEGER
);

-- Execution history
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  model TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  success INTEGER,
  error TEXT,
  tokens_used INTEGER,
  cost REAL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Projects (groups of related tasks)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target TEXT,  -- goal description
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  completed_at INTEGER
);
```

## User Interface

### Commands (in openclaw)

```
/tasks                    - Show task queue status
/tasks add <prompt>       - Add a task
/tasks project <name>     - Create a project with multiple tasks
/tasks status             - Show executor status
/tasks pause              - Pause execution
/tasks resume             - Resume execution
/tasks cancel <id>        - Cancel a task
/tasks history            - Show execution history
/tasks schedule           - Show upcoming schedule
```

### CLI

```bash
# Daemon control
oh-my-moltbot daemon start
oh-my-moltbot daemon stop
oh-my-moltbot daemon status

# Task management
oh-my-moltbot task add "implement feature X"
oh-my-moltbot task list
oh-my-moltbot task cancel <id>

# Project management
oh-my-moltbot project create <name> --target "build a REST API"
oh-my-moltbot project status <name>
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] SQLite persistence layer
- [ ] Rate limit monitor with persistence
- [ ] Basic task queue (add, get, update)

### Phase 2: Scheduler (Week 1-2)
- [ ] Scheduling algorithm
- [ ] Dependency resolution
- [ ] Priority handling

### Phase 3: Executor (Week 2)
- [ ] Basic executor loop
- [ ] Task execution via gateway
- [ ] Error handling and retries

### Phase 4: Daemon (Week 2-3)
- [ ] Background process management
- [ ] Health monitoring
- [ ] Graceful shutdown

### Phase 5: Integration (Week 3)
- [ ] Plugin commands
- [ ] CLI commands
- [ ] Status reporting

### Phase 6: Advanced Features (Week 3-4)
- [ ] Project management
- [ ] Deadline optimization
- [ ] Cost tracking
- [ ] Notifications (Telegram/Slack)

## Example Usage

### Long-running Project
```typescript
// Create a project to build a full application
const projectId = await taskSystem.createProject({
  name: 'build-blog-platform',
  target: 'Create a full-stack blog platform with auth, posts, comments',
  tasks: [
    { title: 'Plan architecture', category: 'planning', priority: 'critical' },
    { title: 'Design database schema', category: 'planning', dependsOn: ['plan-arch'] },
    { title: 'Implement auth', category: 'coding', dependsOn: ['design-db'] },
    { title: 'Review auth code', category: 'review', dependsOn: ['impl-auth'] },
    { title: 'Implement posts API', category: 'coding', dependsOn: ['impl-auth'] },
    { title: 'Review posts code', category: 'review', dependsOn: ['impl-posts'] },
    // ... more tasks
  ]
});

// System will:
// 1. Execute planning tasks with Opus
// 2. Wait for rate limits if needed
// 3. Execute coding tasks with available coders
// 4. Automatically schedule reviews
// 5. Continue until all tasks complete
// 6. Report progress and notify on completion
```

## Rate Limit Optimization Strategy

```
Model Pool Status:
┌─────────────────┬─────────┬─────────┬──────────────┐
│ Model           │ Used    │ Limit   │ Resets In    │
├─────────────────┼─────────┼─────────┼──────────────┤
│ Claude Opus     │ 45/50   │ 50/min  │ 32s          │
│ GPT-5 Codex     │ 60/60   │ 60/min  │ 45s          │ ← EXHAUSTED
│ Kimi            │ 20/100  │ 100/min │ 15s          │
│ Sonnet          │ 30/60   │ 60/min  │ 28s          │
└─────────────────┴─────────┴─────────┴──────────────┘

Scheduler Decision:
- Task "Implement feature" (coding) 
  → GPT-5 exhausted, scheduling for +45s
  → OR use Kimi now (has capacity)
  
- Task "Review code" (review)
  → Kimi has capacity, execute now
```

## Success Metrics

1. **Throughput:** Tasks completed per hour
2. **Efficiency:** % of rate limit capacity utilized
3. **Reliability:** % of tasks completed without manual intervention
4. **Cost:** Total API cost per project

## Open Questions

1. Should failed tasks notify immediately or batch notifications?
2. How to handle tasks that exceed estimated duration?
3. Should we support task cancellation mid-execution?
4. How to handle model deprecation/changes?
