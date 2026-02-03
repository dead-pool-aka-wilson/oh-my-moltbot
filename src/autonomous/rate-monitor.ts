import { rateLimitDb } from './db';
import type { RateLimitState} from './types';

const DEFAULT_WINDOW_DURATION = 60 * 1000;

const MODEL_LIMITS: Record<string, number> = {
  'anthropic/claude-opus-4-5': 50,
  'anthropic/claude-sonnet-4-5': 60,
  'google/gemini-2.5-pro': 60,
  'google/gemini-2.5-flash': 200,
  'google/gemini-2.5-pro-image': 50,
  'github-copilot/gpt-5.2-codex': 60,
  'moonshotai/kimi-k2.5-coder': 100,
};

export class RateLimitMonitor {
  private windowDuration: number;

  constructor(windowDuration: number = DEFAULT_WINDOW_DURATION) {
    this.windowDuration = windowDuration;
    this.initializeModels();
  }

  private initializeModels(): void {
    const now = Date.now();
    for (const [model, maxRequests] of Object.entries(MODEL_LIMITS)) {
      const existing = rateLimitDb.get(model);
      if (!existing) {
        rateLimitDb.upsert({
          model,
          currentUsage: 0,
          maxRequests,
          windowStart: now,
          windowDuration: this.windowDuration,
          updatedAt: now,
        });
      }
    }
  }

  getState(model: string): RateLimitState | null {
    const state = rateLimitDb.get(model);
    if (!state) return null;

    const now = Date.now();
    if (now - state.windowStart > state.windowDuration) {
      const newState: RateLimitState = {
        ...state,
        currentUsage: 0,
        windowStart: now,
        updatedAt: now,
      };
      rateLimitDb.upsert(newState);
      return newState;
    }

    return state;
  }

  recordUsage(model: string): boolean {
    const now = Date.now();
    let state = rateLimitDb.get(model);

    if (!state) {
      const maxRequests = MODEL_LIMITS[model] || 50;
      state = {
        model,
        currentUsage: 0,
        maxRequests,
        windowStart: now,
        windowDuration: this.windowDuration,
        updatedAt: now,
      };
      rateLimitDb.upsert(state);
    }

    if (now - state.windowStart > state.windowDuration) {
      rateLimitDb.resetWindow(model, now);
      return true;
    }

    if (state.currentUsage >= state.maxRequests) {
      return false;
    }

    rateLimitDb.incrementUsage(model);
    return true;
  }

  isAvailable(model: string): boolean {
    const state = this.getState(model);
    if (!state) return true;
    return state.currentUsage < state.maxRequests;
  }

  getNextAvailable(model: string): number {
    const state = this.getState(model);
    if (!state) return Date.now();

    if (state.currentUsage < state.maxRequests) {
      return Date.now();
    }

    return state.windowStart + state.windowDuration;
  }

  getAvailableModels(): string[] {
    const states = rateLimitDb.getAll();
    const now = Date.now();

    return states
      .filter(state => {
        if (now - state.windowStart > state.windowDuration) return true;
        return state.currentUsage < state.maxRequests;
      })
      .map(state => state.model);
  }

  getAllStates(): RateLimitState[] {
    return rateLimitDb.getAll().map(state => {
      const now = Date.now();
      if (now - state.windowStart > state.windowDuration) {
        return { ...state, currentUsage: 0, windowStart: now };
      }
      return state;
    });
  }

  getStatus(): Record<string, { available: boolean; used: number; limit: number; resetsIn: number }> {
    const states = this.getAllStates();
    const now = Date.now();
    const status: Record<string, { available: boolean; used: number; limit: number; resetsIn: number }> = {};

    for (const state of states) {
      const resetsIn = Math.max(0, (state.windowStart + state.windowDuration) - now);
      status[state.model] = {
        available: state.currentUsage < state.maxRequests,
        used: state.currentUsage,
        limit: state.maxRequests,
        resetsIn: Math.round(resetsIn / 1000),
      };
    }

    return status;
  }
}

export const rateLimitMonitor = new RateLimitMonitor();
