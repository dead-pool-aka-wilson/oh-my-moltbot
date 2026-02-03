import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { taskQueue } from './task-queue';
import { scheduler } from './scheduler';
import { rateLimitMonitor } from './rate-monitor';
import { executionDb } from './db';
import { gateway } from '../gateway/ollama-gateway';
import type { Task, ExecutorConfig, ExecutorStatus, DEFAULT_EXECUTOR_CONFIG } from './types';

const PID_FILE = join(process.env.HOME || '', '.clawdbot', 'executor.pid');
const STATUS_FILE = join(process.env.HOME || '', '.clawdbot', 'executor.status.json');

export class TaskExecutor extends EventEmitter {
  private config: ExecutorConfig;
  private running = false;
  private paused = false;
  private startTime = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private currentExecutions: Map<string, { taskId: string; startedAt: number }> = new Map();

  constructor(config?: Partial<ExecutorConfig>) {
    super();
    this.config = {
      pollInterval: config?.pollInterval ?? 5000,
      healthCheckInterval: config?.healthCheckInterval ?? 30000,
      gracefulShutdownTimeout: config?.gracefulShutdownTimeout ?? 30000,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.startTime = Date.now();

    this.writePidFile();
    this.writeStatus();

    this.pollTimer = setInterval(() => this.poll(), this.config.pollInterval);
    this.healthTimer = setInterval(() => this.writeStatus(), this.config.healthCheckInterval);

    this.emit('started');
    console.log('[Executor] Started');

    await this.poll();
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    console.log('[Executor] Stopping...');
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    if (this.currentExecutions.size > 0) {
      console.log(`[Executor] Waiting for ${this.currentExecutions.size} tasks to complete...`);
      const deadline = Date.now() + this.config.gracefulShutdownTimeout;
      while (this.currentExecutions.size > 0 && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.removePidFile();
    this.emit('stopped');
    console.log('[Executor] Stopped');
  }

  pause(): void {
    this.paused = true;
    this.writeStatus();
    this.emit('paused');
    console.log('[Executor] Paused');
  }

  resume(): void {
    this.paused = false;
    this.writeStatus();
    this.emit('resumed');
    console.log('[Executor] Resumed');
  }

  private async poll(): Promise<void> {
    if (!this.running || this.paused) return;

    try {
      scheduler.planSchedule();
      const immediatelySchedulable = scheduler.getImmediatelySchedulable();

      for (const decision of immediatelySchedulable) {
        if (!scheduler.canScheduleMore()) break;

        const task = taskQueue.get(decision.taskId);
        if (!task || task.status !== 'pending') continue;

        if (!rateLimitMonitor.recordUsage(decision.model)) {
          scheduler.reschedule(decision.taskId);
          continue;
        }

        this.executeTask(task, decision.model);
      }
    } catch (error) {
      console.error('[Executor] Poll error:', error);
    }
  }

  private async executeTask(task: Task, model: string): Promise<void> {
    const execId = executionDb.insert({
      taskId: task.id,
      model,
      startedAt: Date.now(),
    });

    this.currentExecutions.set(execId, { taskId: task.id, startedAt: Date.now() });
    taskQueue.markRunning(task.id);
    scheduler.removeFromSchedule(task.id);

    this.emit('taskStart', task);
    console.log(`[Executor] Starting task: ${task.title} (${task.id}) with ${model}`);

    try {
      const result = await gateway.process(task.prompt);

      executionDb.update(execId, {
        completedAt: Date.now(),
        success: true,
      });

      taskQueue.markCompleted(task.id, JSON.stringify(result));
      this.emit('taskComplete', task, result);
      console.log(`[Executor] Completed task: ${task.title} (${task.id})`);

    } catch (error: any) {
      const errorMessage = error?.message || String(error);

      executionDb.update(execId, {
        completedAt: Date.now(),
        success: false,
        error: errorMessage,
      });

      taskQueue.markFailed(task.id, errorMessage);
      this.emit('taskFailed', task, error);
      console.error(`[Executor] Failed task: ${task.title} (${task.id}):`, errorMessage);

      if (errorMessage.includes('rate') || errorMessage.includes('429')) {
        rateLimitMonitor.recordUsage(model);
      }
    } finally {
      this.currentExecutions.delete(execId);
      this.writeStatus();
    }
  }

  getStatus(): ExecutorStatus {
    const { completed, failed } = executionDb.getTodayStats();
    const nextScheduled = scheduler.getNextScheduled();

    return {
      running: this.running,
      paused: this.paused,
      currentTasks: this.currentExecutions.size,
      completedToday: completed,
      failedToday: failed,
      nextScheduled: nextScheduled ? { taskId: nextScheduled.taskId, at: nextScheduled.scheduledFor } : undefined,
      uptime: this.running ? Date.now() - this.startTime : 0,
      pid: process.pid,
    };
  }

  getRunningTasks(): Task[] {
    return taskQueue.getRunning();
  }

  private writePidFile(): void {
    try {
      writeFileSync(PID_FILE, String(process.pid));
    } catch (error) {
      console.error('[Executor] Failed to write PID file:', error);
    }
  }

  private removePidFile(): void {
    try {
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE);
      }
    } catch (error) {
      console.error('[Executor] Failed to remove PID file:', error);
    }
  }

  private writeStatus(): void {
    try {
      writeFileSync(STATUS_FILE, JSON.stringify(this.getStatus(), null, 2));
    } catch (error) {
      console.error('[Executor] Failed to write status file:', error);
    }
  }

  static isRunning(): boolean {
    if (!existsSync(PID_FILE)) return false;

    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static getStoredStatus(): ExecutorStatus | null {
    if (!existsSync(STATUS_FILE)) return null;

    try {
      return JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }

  static getPid(): number | null {
    if (!existsSync(PID_FILE)) return null;

    try {
      return parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    } catch {
      return null;
    }
  }
}

export const executor = new TaskExecutor();
