import { taskQueue } from './task-queue';
import { rateLimitMonitor } from './rate-monitor';
import type { Task, TaskCategory, ScheduleDecision, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from './types';

const CATEGORY_TO_MODELS: Record<TaskCategory, string[]> = {
  planning: ['anthropic/claude-opus-4-5', 'google/gemini-2.5-pro'],
  reasoning: ['anthropic/claude-opus-4-5', 'google/gemini-2.5-pro'],
  coding: ['anthropic/claude-opus-4-5', 'github-copilot/gpt-5.2-codex', 'moonshotai/kimi-k2.5-coder'],
  review: ['moonshotai/kimi-k2.5-coder', 'github-copilot/gpt-5.2-codex'],
  quick: ['anthropic/claude-sonnet-4-5', 'google/gemini-2.5-flash'],
  vision: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4-5'],
  image_gen: ['google/gemini-2.5-pro-image'],
};

export class Scheduler {
  private config: SchedulerConfig;
  private schedule: ScheduleDecision[] = [];

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 5,
      lookAheadWindow: config?.lookAheadWindow ?? 60 * 60 * 1000,
      retryDelay: config?.retryDelay ?? 30 * 1000,
      priorityWeights: config?.priorityWeights ?? {
        critical: 1000,
        high: 100,
        medium: 10,
        low: 1,
      },
    };
  }

  planSchedule(): ScheduleDecision[] {
    const readyTasks = taskQueue.getReady();
    const runningCount = taskQueue.getRunning().length;
    const availableSlots = this.config.maxConcurrent - runningCount;

    if (availableSlots <= 0 || readyTasks.length === 0) {
      this.schedule = [];
      return [];
    }

    const sortedTasks = this.sortByPriority(readyTasks);
    const decisions: ScheduleDecision[] = [];
    let scheduledCount = 0;

    for (const task of sortedTasks) {
      if (scheduledCount >= availableSlots) break;

      const decision = this.scheduleTask(task);
      if (decision) {
        decisions.push(decision);
        if (decision.scheduledFor <= Date.now()) {
          scheduledCount++;
        }
      }
    }

    this.schedule = decisions;
    return decisions;
  }

  private sortByPriority(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {
      const weightA = this.config.priorityWeights[a.priority];
      const weightB = this.config.priorityWeights[b.priority];
      if (weightA !== weightB) return weightB - weightA;

      if (a.deadline && b.deadline) return a.deadline - b.deadline;
      if (a.deadline) return -1;
      if (b.deadline) return 1;

      return a.createdAt - b.createdAt;
    });
  }

  private scheduleTask(task: Task): ScheduleDecision | null {
    const models = task.preferredModel 
      ? [task.preferredModel, ...CATEGORY_TO_MODELS[task.category]]
      : CATEGORY_TO_MODELS[task.category];

    let bestModel: string | null = null;
    let bestTime = Infinity;

    for (const model of models) {
      if (rateLimitMonitor.isAvailable(model)) {
        bestModel = model;
        bestTime = Date.now();
        break;
      }

      const nextAvailable = rateLimitMonitor.getNextAvailable(model);
      if (nextAvailable < bestTime) {
        bestTime = nextAvailable;
        bestModel = model;
      }
    }

    if (!bestModel) return null;

    const estimatedDuration = task.estimatedDuration || 30000;

    return {
      taskId: task.id,
      model: bestModel,
      scheduledFor: bestTime,
      estimatedCompletion: bestTime + estimatedDuration,
    };
  }

  getSchedule(): ScheduleDecision[] {
    return this.schedule;
  }

  getNextScheduled(): ScheduleDecision | null {
    if (this.schedule.length === 0) return null;
    return this.schedule.reduce((earliest, current) => 
      current.scheduledFor < earliest.scheduledFor ? current : earliest
    );
  }

  getImmediatelySchedulable(): ScheduleDecision[] {
    const now = Date.now();
    return this.schedule.filter(d => d.scheduledFor <= now);
  }

  reschedule(taskId: string): ScheduleDecision | null {
    const task = taskQueue.get(taskId);
    if (!task) return null;

    const decision = this.scheduleTask(task);
    if (decision) {
      this.schedule = this.schedule.filter(d => d.taskId !== taskId);
      this.schedule.push(decision);
    }
    return decision;
  }

  removeFromSchedule(taskId: string): void {
    this.schedule = this.schedule.filter(d => d.taskId !== taskId);
  }

  canScheduleMore(): boolean {
    const runningCount = taskQueue.getRunning().length;
    return runningCount < this.config.maxConcurrent;
  }

  getEstimatedCompletionTime(): number | null {
    if (this.schedule.length === 0) return null;
    return Math.max(...this.schedule.map(d => d.estimatedCompletion));
  }

  getQueueDepth(): number {
    return taskQueue.getPending().length + taskQueue.getByStatus('scheduled').length;
  }

  getStatus(): {
    scheduled: number;
    running: number;
    pending: number;
    nextTask: ScheduleDecision | null;
    availableModels: string[];
  } {
    return {
      scheduled: this.schedule.length,
      running: taskQueue.getRunning().length,
      pending: taskQueue.getPending().length,
      nextTask: this.getNextScheduled(),
      availableModels: rateLimitMonitor.getAvailableModels(),
    };
  }
}

export const scheduler = new Scheduler();
