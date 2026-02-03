import { taskDb, projectDb } from './db';
import type { Task, TaskInput, Project, TaskStatus } from './types';

export class TaskQueue {
  add(input: TaskInput): string {
    return taskDb.insert({
      title: input.title,
      prompt: input.prompt,
      category: input.category,
      priority: input.priority || 'medium',
      status: 'pending',
      projectId: input.projectId,
      dependsOn: input.dependsOn || [],
      preferredModel: input.preferredModel,
      deadline: input.deadline,
      maxAttempts: input.maxAttempts || 3,
      estimatedDuration: input.estimatedDuration,
    });
  }

  get(id: string): Task | null {
    return taskDb.get(id);
  }

  update(id: string, updates: Partial<Task>): void {
    taskDb.update(id, updates);
  }

  remove(id: string): void {
    taskDb.delete(id);
  }

  cancel(id: string): void {
    taskDb.update(id, { status: 'cancelled' });
  }

  getReady(): Task[] {
    return taskDb.getReady();
  }

  getPending(): Task[] {
    return taskDb.getByStatus('pending');
  }

  getRunning(): Task[] {
    return taskDb.getRunning();
  }

  getByStatus(status: TaskStatus): Task[] {
    return taskDb.getByStatus(status);
  }

  getAll(): Task[] {
    return taskDb.getAll();
  }

  getStats(): Record<TaskStatus, number> {
    return taskDb.countByStatus();
  }

  markRunning(id: string, scheduledFor?: number): void {
    taskDb.update(id, { 
      status: 'running', 
      scheduledFor,
      attempts: (this.get(id)?.attempts || 0) + 1,
    });
  }

  markCompleted(id: string, result?: string): void {
    taskDb.update(id, { 
      status: 'completed', 
      result,
      completedAt: Date.now(),
    });
    this.unblockDependents(id);
  }

  markFailed(id: string, error: string): void {
    const task = this.get(id);
    if (!task) return;

    if (task.attempts < task.maxAttempts) {
      taskDb.update(id, { 
        status: 'pending',
        lastError: error,
      });
    } else {
      taskDb.update(id, { 
        status: 'failed',
        lastError: error,
      });
    }
  }

  markBlocked(id: string, blockedBy: string): void {
    taskDb.update(id, { status: 'blocked', blockedBy });
  }

  private unblockDependents(completedTaskId: string): void {
    const all = taskDb.getAll();
    for (const task of all) {
      if (task.status === 'blocked' && task.blockedBy === completedTaskId) {
        const allDepsComplete = task.dependsOn.every(depId => {
          const dep = taskDb.get(depId);
          return dep?.status === 'completed';
        });
        if (allDepsComplete) {
          taskDb.update(task.id, { status: 'pending', blockedBy: undefined });
        }
      }
    }
  }

  addProject(name: string, tasks: TaskInput[], options?: { description?: string; target?: string }): { projectId: string; taskIds: string[] } {
    const projectId = projectDb.insert({
      name,
      description: options?.description,
      target: options?.target,
      status: 'active',
    });

    const taskIds: string[] = [];
    for (const taskInput of tasks) {
      const taskId = this.add({
        ...taskInput,
        projectId,
      });
      taskIds.push(taskId);
    }

    return { projectId, taskIds };
  }

  getProject(id: string): Project | null {
    return projectDb.get(id);
  }

  getProjectTasks(projectId: string): Task[] {
    return taskDb.getByProject(projectId);
  }

  getProjects(): Project[] {
    return projectDb.getAll();
  }

  getActiveProjects(): Project[] {
    return projectDb.getActive();
  }

  updateProject(id: string, updates: Partial<Project>): void {
    projectDb.update(id, updates);
  }

  completeProject(id: string): void {
    projectDb.update(id, { status: 'completed', completedAt: Date.now() });
  }

  getNextTask(): Task | null {
    const ready = this.getReady();
    if (ready.length === 0) return null;
    return ready[0];
  }

  hasBlockedTasks(): boolean {
    const blocked = taskDb.getByStatus('blocked');
    return blocked.length > 0;
  }

  retryFailed(): number {
    const failed = taskDb.getByStatus('failed');
    let retried = 0;
    for (const task of failed) {
      if (task.attempts < task.maxAttempts) {
        taskDb.update(task.id, { status: 'pending', lastError: undefined });
        retried++;
      }
    }
    return retried;
  }
}

export const taskQueue = new TaskQueue();
