export * from './types';
export { getDb, closeDb, taskDb, rateLimitDb, executionDb, projectDb } from './db';
export { RateLimitMonitor, rateLimitMonitor } from './rate-monitor';
export { TaskQueue, taskQueue } from './task-queue';
export { Scheduler, scheduler } from './scheduler';
export { TaskExecutor, executor } from './executor';

import { taskQueue } from './task-queue';
import { scheduler } from './scheduler';
import { executor } from './executor';
import { rateLimitMonitor } from './rate-monitor';
import type { TaskInput, ExecutorStatus } from './types';

export const autonomousTaskSystem = {
  addTask(input: TaskInput): string {
    return taskQueue.add(input);
  },

  addProject(name: string, tasks: TaskInput[], options?: { description?: string; target?: string }) {
    return taskQueue.addProject(name, tasks, options);
  },

  getTask(id: string) {
    return taskQueue.get(id);
  },

  cancelTask(id: string) {
    taskQueue.cancel(id);
  },

  getQueueStatus() {
    return {
      stats: taskQueue.getStats(),
      scheduler: scheduler.getStatus(),
      rateLimits: rateLimitMonitor.getStatus(),
    };
  },

  getExecutorStatus(): ExecutorStatus | null {
    if (executor.getStatus().running) {
      return executor.getStatus();
    }
    return executor.constructor.prototype.constructor.getStoredStatus?.() || null;
  },

  async startExecutor() {
    await executor.start();
  },

  async stopExecutor() {
    await executor.stop();
  },

  pauseExecutor() {
    executor.pause();
  },

  resumeExecutor() {
    executor.resume();
  },

  getAllTasks() {
    return taskQueue.getAll();
  },

  getProjects() {
    return taskQueue.getProjects();
  },

  getProjectTasks(projectId: string) {
    return taskQueue.getProjectTasks(projectId);
  },

  retryFailed() {
    return taskQueue.retryFailed();
  },
};
