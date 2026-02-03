import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { Task, RateLimitState, Execution, Project } from './types';

const DB_DIR = join(process.env.HOME || '', '.clawdbot');
const DB_PATH = join(DB_DIR, 'task-queue.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      depends_on TEXT DEFAULT '[]',
      blocked_by TEXT,
      preferred_model TEXT,
      scheduled_for INTEGER,
      deadline INTEGER,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      result TEXT,
      estimated_duration INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      model TEXT PRIMARY KEY,
      current_usage INTEGER DEFAULT 0,
      max_requests INTEGER NOT NULL,
      window_start INTEGER NOT NULL,
      window_duration INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executions (
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

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const taskDb = {
  insert(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'attempts'>): string {
    const db = getDb();
    const id = generateId('task');
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, prompt, category, priority, status, depends_on, preferred_model, deadline, max_attempts, estimated_duration, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      task.projectId || null,
      task.title,
      task.prompt,
      task.category,
      task.priority || 'medium',
      task.status || 'pending',
      JSON.stringify(task.dependsOn || []),
      task.preferredModel || null,
      task.deadline || null,
      task.maxAttempts || 3,
      task.estimatedDuration || null,
      now,
      now
    );
    
    return id;
  },

  get(id: string): Task | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? rowToTask(row) : null;
  },

  update(id: string, updates: Partial<Task>): void {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.blockedBy !== undefined) { fields.push('blocked_by = ?'); values.push(updates.blockedBy); }
    if (updates.scheduledFor !== undefined) { fields.push('scheduled_for = ?'); values.push(updates.scheduledFor); }
    if (updates.attempts !== undefined) { fields.push('attempts = ?'); values.push(updates.attempts); }
    if (updates.lastError !== undefined) { fields.push('last_error = ?'); values.push(updates.lastError); }
    if (updates.result !== undefined) { fields.push('result = ?'); values.push(updates.result); }
    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
    
    if (fields.length === 0) return;
    
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },

  getByStatus(status: Task['status']): Task[] {
    const rows = getDb().prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at').all(status) as any[];
    return rows.map(rowToTask);
  },

  getReady(): Task[] {
    const db = getDb();
    const pending = db.prepare(`
      SELECT * FROM tasks 
      WHERE status = 'pending' OR status = 'scheduled'
      ORDER BY 
        CASE priority 
          WHEN 'critical' THEN 0 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        created_at
    `).all() as any[];
    
    const tasks = pending.map(rowToTask);
    const completedIds = new Set(
      (db.prepare("SELECT id FROM tasks WHERE status = 'completed'").all() as any[]).map(r => r.id)
    );
    
    return tasks.filter(task => {
      if (task.dependsOn.length === 0) return true;
      return task.dependsOn.every(depId => completedIds.has(depId));
    });
  },

  getByProject(projectId: string): Task[] {
    const rows = getDb().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at').all(projectId) as any[];
    return rows.map(rowToTask);
  },

  getAll(): Task[] {
    const rows = getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as any[];
    return rows.map(rowToTask);
  },

  getRunning(): Task[] {
    const rows = getDb().prepare("SELECT * FROM tasks WHERE status = 'running'").all() as any[];
    return rows.map(rowToTask);
  },

  countByStatus(): Record<Task['status'], number> {
    const db = getDb();
    const counts: Record<string, number> = {
      pending: 0, scheduled: 0, running: 0, completed: 0, failed: 0, blocked: 0, cancelled: 0
    };
    const rows = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all() as any[];
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts as Record<Task['status'], number>;
  },
};

export const rateLimitDb = {
  get(model: string): RateLimitState | null {
    const row = getDb().prepare('SELECT * FROM rate_limits WHERE model = ?').get(model) as any;
    return row ? rowToRateLimit(row) : null;
  },

  upsert(state: RateLimitState): void {
    getDb().prepare(`
      INSERT INTO rate_limits (model, current_usage, max_requests, window_start, window_duration, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(model) DO UPDATE SET
        current_usage = excluded.current_usage,
        max_requests = excluded.max_requests,
        window_start = excluded.window_start,
        window_duration = excluded.window_duration,
        updated_at = excluded.updated_at
    `).run(state.model, state.currentUsage, state.maxRequests, state.windowStart, state.windowDuration, state.updatedAt);
  },

  getAll(): RateLimitState[] {
    const rows = getDb().prepare('SELECT * FROM rate_limits').all() as any[];
    return rows.map(rowToRateLimit);
  },

  incrementUsage(model: string): void {
    getDb().prepare(`
      UPDATE rate_limits 
      SET current_usage = current_usage + 1, updated_at = ? 
      WHERE model = ?
    `).run(Date.now(), model);
  },

  resetWindow(model: string, windowStart: number): void {
    getDb().prepare(`
      UPDATE rate_limits 
      SET current_usage = 1, window_start = ?, updated_at = ? 
      WHERE model = ?
    `).run(windowStart, Date.now(), model);
  },
};

export const executionDb = {
  insert(execution: Omit<Execution, 'id'>): string {
    const id = generateId('exec');
    getDb().prepare(`
      INSERT INTO executions (id, task_id, model, started_at, completed_at, success, error, tokens_used, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, execution.taskId, execution.model, execution.startedAt, execution.completedAt || null, 
           execution.success !== undefined ? (execution.success ? 1 : 0) : null,
           execution.error || null, execution.tokensUsed || null, execution.cost || null);
    return id;
  },

  update(id: string, updates: Partial<Execution>): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
    if (updates.success !== undefined) { fields.push('success = ?'); values.push(updates.success ? 1 : 0); }
    if (updates.error !== undefined) { fields.push('error = ?'); values.push(updates.error); }
    if (updates.tokensUsed !== undefined) { fields.push('tokens_used = ?'); values.push(updates.tokensUsed); }
    if (updates.cost !== undefined) { fields.push('cost = ?'); values.push(updates.cost); }
    
    if (fields.length === 0) return;
    values.push(id);
    
    getDb().prepare(`UPDATE executions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  getByTask(taskId: string): Execution[] {
    const rows = getDb().prepare('SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC').all(taskId) as any[];
    return rows.map(rowToExecution);
  },

  getTodayStats(): { completed: number; failed: number } {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const rows = getDb().prepare(`
      SELECT success, COUNT(*) as count 
      FROM executions 
      WHERE started_at >= ? AND completed_at IS NOT NULL
      GROUP BY success
    `).all(todayStart) as any[];
    
    let completed = 0, failed = 0;
    for (const row of rows) {
      if (row.success === 1) completed = row.count;
      else if (row.success === 0) failed = row.count;
    }
    return { completed, failed };
  },
};

export const projectDb = {
  insert(project: Omit<Project, 'id' | 'createdAt'>): string {
    const id = generateId('proj');
    getDb().prepare(`
      INSERT INTO projects (id, name, description, target, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, project.name, project.description || null, project.target || null, project.status || 'active', Date.now());
    return id;
  },

  get(id: string): Project | null {
    const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    return row ? rowToProject(row) : null;
  },

  update(id: string, updates: Partial<Project>): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
    
    if (fields.length === 0) return;
    values.push(id);
    
    getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  getAll(): Project[] {
    const rows = getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as any[];
    return rows.map(rowToProject);
  },

  getActive(): Project[] {
    const rows = getDb().prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC").all() as any[];
    return rows.map(rowToProject);
  },
};

function rowToTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id || undefined,
    title: row.title,
    prompt: row.prompt,
    category: row.category,
    priority: row.priority,
    status: row.status,
    dependsOn: JSON.parse(row.depends_on || '[]'),
    blockedBy: row.blocked_by || undefined,
    preferredModel: row.preferred_model || undefined,
    scheduledFor: row.scheduled_for || undefined,
    deadline: row.deadline || undefined,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error || undefined,
    result: row.result || undefined,
    estimatedDuration: row.estimated_duration || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || undefined,
  };
}

function rowToRateLimit(row: any): RateLimitState {
  return {
    model: row.model,
    currentUsage: row.current_usage,
    maxRequests: row.max_requests,
    windowStart: row.window_start,
    windowDuration: row.window_duration,
    updatedAt: row.updated_at,
  };
}

function rowToExecution(row: any): Execution {
  return {
    id: row.id,
    taskId: row.task_id,
    model: row.model,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    success: row.success === null ? undefined : row.success === 1,
    error: row.error || undefined,
    tokensUsed: row.tokens_used || undefined,
    cost: row.cost || undefined,
  };
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    target: row.target || undefined,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}
