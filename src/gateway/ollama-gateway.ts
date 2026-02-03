/**
 * Ollama Gateway - Local-First Analysis Architecture
 * 
 * NEW FLOW:
 * 1. Local Ollama ANALYZES the prompt (classify task, decide model needs)
 * 2. Based on analysis, ROUTE to appropriate paid model
 * 3. If rate-limited, try fallbacks within same capability tier
 * 4. Local Ollama executes as last resort
 * 
 * This prevents wasting paid API calls on availability checks.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { Mutex } from 'async-mutex';

const execFileAsync = promisify(execFile);

export interface GatewayConfig {
  ollamaUrl: string;
  routerModel: string;
  executorModel: string;
  modelPool: ModelPool;
  rateLimitWindow: number;
}

export interface ModelPool {
  planning: BackendModel[];
  reasoning: BackendModel[];
  coding: BackendModel[];
  review: BackendModel[];
  quick: BackendModel[];
  vision: BackendModel[];
  image_gen: BackendModel[];
}

export interface BackendModel {
  name: string;
  model: string;
  maxRequestsPerMinute: number;
}

export interface RoutingDecision {
  category: keyof ModelPool | 'local';
  reasoning: string;
  complexity: 'simple' | 'moderate' | 'complex';
  suggestedModel?: string;
}

export interface GatewayResponse {
  model: string;
  response: string;
  routing: RoutingDecision;
  fallbackUsed: boolean;
  attemptedModels: string[];
}

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

const ROUTER_PROMPT = `You are the Gateway Router. Your ONLY job is to classify and route - NEVER answer the user's question.

OUTPUT FORMAT (JSON only, no markdown, no explanation):
{"category": "planning|reasoning|coding|review|quick|vision|image_gen|local", "reasoning": "brief note for orchestrator", "complexity": "simple|moderate|complex"}

ROUTING RULES (check in order):
1. Generate/create/draw an image? → "image_gen"
2. Analyze images/screenshots/visual content? → "vision"
3. Write/modify/debug/implement code? → "coding"
4. Review/analyze/audit existing code? → "review"
5. Requires planning/architecture/design/strategy? → "planning"
6. Complex logical thinking/analysis/problem-solving? → "reasoning"
7. Simple factual question or conversation? → "quick"
8. Just "hi"/"hello"/trivial greeting? → "local"

MODEL ROLES (for your reference):
- planning: Opus - architecture, strategy, task planning before implementation
- reasoning: Opus - complex logical thinking, analysis, problem-solving
- coding: Opus/GPT-5/Kimi - implementation (Opus preferred, needs plan first)
- review: Kimi reviews GPT-5 code, GPT-5 reviews Kimi code (cross-review)
- quick: Sonnet - fast, general responses
- vision: Gemini - image analysis
- image_gen: Gemini - image generation

COMPLEXITY:
- simple: single-step, unambiguous
- moderate: multi-step but straightforward  
- complex: requires planning, trade-offs, multiple approaches

CRITICAL RULES:
- NEVER answer the question - only output routing JSON
- NEVER default to "local" - it's for trivial greetings ONLY
- ALL coding tasks (any complexity) need a plan → route to "planning" first
- After plan is made, route to "coding" for implementation
- When uncertain, route to "planning" (Opus handles ambiguity best)
- Your output goes to the orchestrator, NOT the user

User request: `;

const DEFAULT_CONFIG: GatewayConfig = {
  ollamaUrl: 'http://localhost:11434',
  routerModel: 'qwen2.5:7b',
  executorModel: 'qwen2.5:14b',
  rateLimitWindow: 60000,
  modelPool: {
    planning: [
      { name: 'Claude Opus', model: 'anthropic/claude-opus-4-5', maxRequestsPerMinute: 50 },
      { name: 'Gemini Pro', model: 'google/gemini-2.5-pro', maxRequestsPerMinute: 60 },
    ],
    reasoning: [
      { name: 'Claude Opus', model: 'anthropic/claude-opus-4-5', maxRequestsPerMinute: 50 },
      { name: 'Gemini Pro', model: 'google/gemini-2.5-pro', maxRequestsPerMinute: 60 },
    ],
    coding: [
      { name: 'Claude Opus', model: 'anthropic/claude-opus-4-5', maxRequestsPerMinute: 50 },
      { name: 'GPT-5 Codex', model: 'github-copilot/gpt-5.2-codex', maxRequestsPerMinute: 60 },
      { name: 'Kimi Coder', model: 'moonshotai/kimi-k2.5-coder', maxRequestsPerMinute: 100 },
    ],
    review: [
      { name: 'Kimi', model: 'moonshotai/kimi-k2.5-coder', maxRequestsPerMinute: 100 },
      { name: 'GPT-5 Codex', model: 'github-copilot/gpt-5.2-codex', maxRequestsPerMinute: 60 },
    ],
    quick: [
      { name: 'Claude Sonnet', model: 'anthropic/claude-sonnet-4-5', maxRequestsPerMinute: 60 },
      { name: 'Gemini Flash', model: 'google/gemini-2.5-flash', maxRequestsPerMinute: 200 },
    ],
    vision: [
      { name: 'Gemini Vision', model: 'google/gemini-2.5-flash', maxRequestsPerMinute: 100 },
      { name: 'Claude Vision', model: 'anthropic/claude-sonnet-4-5', maxRequestsPerMinute: 60 },
    ],
    image_gen: [
      { name: 'Gemini Image', model: 'google/gemini-2.5-pro-image', maxRequestsPerMinute: 50 },
    ],
  },
};

export class OllamaGateway {
  private config: GatewayConfig;
  private rateLimits: Map<string, RateLimitRecord> = new Map();
  private rateLimitMutex: Mutex = new Mutex();

  constructor(config?: Partial<GatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * PHASE 1: Local Ollama analyzes and routes
   */
  async analyze(prompt: string): Promise<RoutingDecision> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.routerModel,
          prompt: ROUTER_PROMPT + prompt.slice(0, 1000),
          stream: false,
          options: { temperature: 0.1 },
        }),
      });

      const data = await response.json();
      const text = data.response || '';
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]) as RoutingDecision;
        if (this.isValidCategory(decision.category)) {
          return decision;
        }
      }
    } catch (e) {
      console.error('Router analysis failed:', e);
    }

    return {
      category: 'quick',
      reasoning: 'Router failed, defaulting to quick',
      complexity: 'moderate',
    };
  }

  private isValidCategory(cat: string): cat is keyof ModelPool | 'local' {
    return ['planning', 'reasoning', 'coding', 'review', 'quick', 'vision', 'image_gen', 'local'].includes(cat);
  }

  /**
   * PHASE 2: Route to appropriate model based on analysis
   */
  async process(prompt: string, files?: string[]): Promise<GatewayResponse> {
    const routing = await this.analyze(prompt);
    const attemptedModels: string[] = [];

    console.log(`🧭 Router decision: ${routing.category} (${routing.complexity})`);

    if (routing.category === 'local') {
      const response = await this.executeLocal(prompt);
      return {
        model: `ollama/${this.config.executorModel}`,
        response,
        routing,
        fallbackUsed: false,
        attemptedModels: ['Ollama (local)'],
      };
    }

    const pool = this.config.modelPool[routing.category];
    
    for (const backend of pool) {
      attemptedModels.push(backend.name);
      
      const acquired = await this.tryAcquireSlot(backend);
      if (!acquired) {
        console.log(`  ⏳ ${backend.name} rate-limited, trying next...`);
        continue;
      }
      
      try {
        console.log(`  🎯 Routing to ${backend.name}`);
        const response = await this.executeModel(backend.model, prompt, files);
        
        return {
          model: backend.model,
          response,
          routing,
          fallbackUsed: attemptedModels.length > 1,
          attemptedModels,
        };
      } catch (error: any) {
        console.error(`  ❌ ${backend.name} failed:`, error.message);
        
        if (error.message?.includes('rate') || error.message?.includes('429')) {
          this.markRateLimited(backend.name);
        }
        continue;
      }
    }

    console.log('  🏠 All paid models exhausted, using local Ollama');
    attemptedModels.push('Ollama (local)');
    
    const response = await this.executeLocal(prompt);
    
    return {
      model: `ollama/${this.config.executorModel}`,
      response,
      routing,
      fallbackUsed: true,
      attemptedModels,
    };
  }

  /**
   * Execute on external model via opencode CLI
   */
  private async executeModel(model: string, prompt: string, files?: string[]): Promise<string> {
    const args = ['run', '-m', model];
    
    if (files?.length) {
      for (const f of files) {
        args.push('-f', f);
      }
    }
    
    args.push(prompt);

    const { stdout } = await execFileAsync('opencode', args, {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    
    return stdout;
  }

  /**
   * Execute on local Ollama
   */
  private async executeLocal(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.executorModel,
        prompt,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.response || 'Ollama failed to generate response';
  }

  /**
   * Check availability without modifying state (for status queries)
   */
  private isAvailableReadOnly(backend: BackendModel): boolean {
    const now = Date.now();
    const record = this.rateLimits.get(backend.name);

    if (!record) return true;

    if (now - record.windowStart > this.config.rateLimitWindow) {
      return true;
    }

    return record.count < backend.maxRequestsPerMinute;
  }

  /**
   * Atomically check availability and record request if available.
   * Returns true if request was recorded, false if rate limited.
   * Uses mutex to prevent TOCTOU race conditions.
   */
  private async tryAcquireSlot(backend: BackendModel): Promise<boolean> {
    return this.rateLimitMutex.runExclusive(() => {
      const now = Date.now();
      const record = this.rateLimits.get(backend.name);

      // No record = available, create new window
      if (!record) {
        this.rateLimits.set(backend.name, { count: 1, windowStart: now });
        return true;
      }

      // Window expired = reset and allow
      if (now - record.windowStart > this.config.rateLimitWindow) {
        this.rateLimits.set(backend.name, { count: 1, windowStart: now });
        return true;
      }

      // Within window and under limit = allow
      if (record.count < backend.maxRequestsPerMinute) {
        record.count++;
        return true;
      }

      // Rate limited
      return false;
    });
  }

  markRateLimited(modelName: string, count?: number): void {
    const allModels = Object.values(this.config.modelPool).flat();
    const backend = allModels.find(b => b.name === modelName);
    if (backend) {
      this.rateLimits.set(modelName, {
        count: count ?? backend.maxRequestsPerMinute,
        windowStart: Date.now(),
      });
    }
  }

  getStatus(): Record<string, { available: boolean; used: number; limit: number; resetsIn: number; category: string }> {
    const now = Date.now();
    const status: Record<string, any> = {};

    for (const [category, models] of Object.entries(this.config.modelPool)) {
      for (const backend of models) {
        if (status[backend.name]) continue;
        
        const record = this.rateLimits.get(backend.name);
        const used = record?.count ?? 0;
        const resetsIn = record ? Math.max(0, this.config.rateLimitWindow - (now - record.windowStart)) : 0;
        
        status[backend.name] = {
          available: this.isAvailableReadOnly(backend),
          used,
          limit: backend.maxRequestsPerMinute,
          resetsIn: Math.round(resetsIn / 1000),
          category,
        };
      }
    }

    status['Ollama Router'] = {
      available: true,
      used: 0,
      limit: Infinity,
      resetsIn: 0,
      category: 'router',
    };

    status['Ollama Executor'] = {
      available: true,
      used: 0,
      limit: Infinity,
      resetsIn: 0,
      category: 'fallback',
    };

    return status;
  }

  async testOllama(): Promise<{ router: boolean; executor: boolean }> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      if (!response.ok) return { router: false, executor: false };
      
      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
      
      return {
        router: models.some((m: string) => m.includes(this.config.routerModel.split(':')[0])),
        executor: models.some((m: string) => m.includes(this.config.executorModel.split(':')[0])),
      };
    } catch {
      return { router: false, executor: false };
    }
  }
}

export const gateway = new OllamaGateway();

export async function route(prompt: string, files?: string[]): Promise<GatewayResponse> {
  return gateway.process(prompt, files);
}

export async function analyze(prompt: string): Promise<RoutingDecision> {
  return gateway.analyze(prompt);
}

export function status(): Record<string, any> {
  return gateway.getStatus();
}
