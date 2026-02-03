/**
 * Parallel Session Manager
 * 
 * Manages multiple concurrent agent sessions.
 * Supports running 10+ parallel sessions for exploration/research.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export interface Session {
  id: string;
  model: string;
  category?: string;
  skills?: string[];
  prompt: string;
  status: SessionStatus;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  dependsOn?: string[];  // Session IDs this depends on
  blocks?: string[];     // Session IDs this blocks
}

export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting';

export interface SpawnOptions {
  model?: string;
  category?: string;
  skills?: string[];
  background?: boolean;
  dependsOn?: string[];
  timeout?: number;
}

// Model routing by category
const CATEGORY_MODELS: Record<string, string> = {
  'coding': 'github-copilot/gpt-5.2-codex',
  'visual-engineering': 'github-copilot/gpt-5.2-codex',
  'ultrabrain': 'anthropic/claude-opus-4-5',
  'planning': 'anthropic/claude-opus-4-5',
  'review': 'opencode/kimi-k2.5-free',
  'chinese': 'opencode/kimi-k2.5-free',
  'quick': 'google/gemini-2.5-flash',
  'explore': 'google/gemini-2.5-flash',
  'vision': 'google/gemini-2.5-flash-image',
  'artistry': 'anthropic/claude-sonnet-4-5',
};

export class ParallelSessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxConcurrent: number;
  private runningCount: number = 0;

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Spawn a new session
   */
  async spawn(prompt: string, options: SpawnOptions = {}): Promise<string> {
    const sessionId = `ses_${randomUUID().slice(0, 8)}`;
    
    // Resolve model from category or use provided/default
    const model = options.model 
      || (options.category && CATEGORY_MODELS[options.category])
      || 'anthropic/claude-sonnet-4-5';

    const session: Session = {
      id: sessionId,
      model,
      category: options.category,
      skills: options.skills,
      prompt,
      status: options.dependsOn?.length ? 'waiting' : 'pending',
      startedAt: Date.now(),
      dependsOn: options.dependsOn,
    };

    this.sessions.set(sessionId, session);

    if (options.background && session.status === 'pending') {
      // Start immediately in background
      this.executeSession(sessionId, options.timeout);
    }

    return sessionId;
  }

  /**
   * Spawn multiple sessions in parallel
   */
  async spawnMany(tasks: Array<{ prompt: string; options?: SpawnOptions }>): Promise<string[]> {
    const sessionIds: string[] = [];
    
    for (const task of tasks) {
      const id = await this.spawn(task.prompt, { ...task.options, background: true });
      sessionIds.push(id);
    }

    return sessionIds;
  }

  /**
   * Execute a session (called internally or for non-background tasks)
   */
  private async executeSession(sessionId: string, timeout: number = 120000): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Check dependencies
    if (session.dependsOn?.length) {
      const allResolved = session.dependsOn.every(depId => {
        const dep = this.sessions.get(depId);
        return dep?.status === 'completed';
      });
      if (!allResolved) {
        session.status = 'waiting';
        return;
      }
    }

    // Check concurrency limit
    if (this.runningCount >= this.maxConcurrent) {
      // Queue for later
      setTimeout(() => this.executeSession(sessionId, timeout), 1000);
      return;
    }

    session.status = 'running';
    this.runningCount++;

    try {
      const skillsArg = session.skills?.length 
        ? `--skills "${session.skills.join(',')}"` 
        : '';
      
      const escapedPrompt = session.prompt
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');

      const cmd = `opencode run -m "${session.model}" ${skillsArg} "${escapedPrompt}"`;
      
      const { stdout, stderr } = await execAsync(cmd, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      session.result = stdout;
      session.status = 'completed';
      session.completedAt = Date.now();

      // Trigger dependent sessions
      this.triggerDependents(sessionId);

    } catch (error: any) {
      session.error = error.message;
      session.status = 'failed';
      session.completedAt = Date.now();
    } finally {
      this.runningCount--;
    }
  }

  /**
   * Trigger sessions that depend on a completed session
   */
  private triggerDependents(completedId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.status === 'waiting' && session.dependsOn?.includes(completedId)) {
        // Check if ALL dependencies are resolved
        const allResolved = session.dependsOn.every(depId => {
          const dep = this.sessions.get(depId);
          return dep?.status === 'completed';
        });
        if (allResolved) {
          this.executeSession(id);
        }
      }
    }
  }

  /**
   * Wait for specific sessions to complete
   */
  async waitFor(sessionIds: string[], timeoutMs: number = 300000): Promise<Session[]> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const sessions = sessionIds.map(id => this.sessions.get(id)!);
      const allDone = sessions.every(s => s.status === 'completed' || s.status === 'failed');
      
      if (allDone) {
        return sessions;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Timeout waiting for sessions: ${sessionIds.join(', ')}`);
  }

  /**
   * Wait for all sessions to complete
   */
  async waitAll(timeoutMs: number = 300000): Promise<Session[]> {
    return this.waitFor([...this.sessions.keys()], timeoutMs);
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAll(): Session[] {
    return [...this.sessions.values()];
  }

  /**
   * Get session results
   */
  getResults(sessionIds?: string[]): Record<string, string | undefined> {
    const results: Record<string, string | undefined> = {};
    const ids = sessionIds || [...this.sessions.keys()];
    
    for (const id of ids) {
      const session = this.sessions.get(id);
      results[id] = session?.result;
    }
    
    return results;
  }

  /**
   * Get status summary
   */
  getStatus(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    waiting: number;
  } {
    const sessions = [...this.sessions.values()];
    return {
      total: sessions.length,
      pending: sessions.filter(s => s.status === 'pending').length,
      running: sessions.filter(s => s.status === 'running').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      failed: sessions.filter(s => s.status === 'failed').length,
      waiting: sessions.filter(s => s.status === 'waiting').length,
    };
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
    this.runningCount = 0;
  }
}

// Singleton for convenience
export const sessionManager = new ParallelSessionManager(10);
