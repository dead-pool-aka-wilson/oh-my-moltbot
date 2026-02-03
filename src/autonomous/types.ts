export type TaskCategory = 'planning' | 'reasoning' | 'coding' | 'review' | 'quick' | 'vision' | 'image_gen';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';

export interface Task {
  id: string;
  projectId?: string;
  title: string;
  prompt: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dependsOn: string[];
  blockedBy?: string;
  preferredModel?: string;
  scheduledFor?: number;
  deadline?: number;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  result?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  estimatedDuration?: number;
}

export interface TaskInput {
  title: string;
  prompt: string;
  category: TaskCategory;
  priority?: TaskPriority;
  projectId?: string;
  dependsOn?: string[];
  preferredModel?: string;
  deadline?: number;
  maxAttempts?: number;
  estimatedDuration?: number;
}

export interface RateLimitState {
  model: string;
  currentUsage: number;
  maxRequests: number;
  windowStart: number;
  windowDuration: number;
  updatedAt: number;
}

export interface Execution {
  id: string;
  taskId: string;
  model: string;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  error?: string;
  tokensUsed?: number;
  cost?: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  target?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
}

export interface ScheduleDecision {
  taskId: string;
  model: string;
  scheduledFor: number;
  estimatedCompletion: number;
}

export interface ExecutorStatus {
  running: boolean;
  paused: boolean;
  currentTasks: number;
  completedToday: number;
  failedToday: number;
  nextScheduled?: { taskId: string; at: number };
  uptime: number;
  pid?: number;
}

export interface SchedulerConfig {
  maxConcurrent: number;
  lookAheadWindow: number;
  retryDelay: number;
  priorityWeights: Record<TaskPriority, number>;
}

export interface ExecutorConfig {
  pollInterval: number;
  healthCheckInterval: number;
  gracefulShutdownTimeout: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrent: 5,
  lookAheadWindow: 60 * 60 * 1000,
  retryDelay: 30 * 1000,
  priorityWeights: {
    critical: 1000,
    high: 100,
    medium: 10,
    low: 1,
  },
};

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  pollInterval: 5000,
  healthCheckInterval: 30000,
  gracefulShutdownTimeout: 30000,
};
