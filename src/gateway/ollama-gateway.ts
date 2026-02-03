/**
 * Ollama Prompt Gateway
 * 
 * Flow:
 * 1. User message → Ollama
 * 2. Check model availability in priority order:
 *    - Claude Opus (best reasoning)
 *    - Claude Sonnet (good balance)
 *    - GPT-5 (fast coding)
 *    - Kimi (review/Chinese)
 * 3. Route to first available model
 * 4. If ALL unavailable → Ollama responds itself (worst case)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GatewayConfig {
  ollamaUrl: string;
  ollamaModel: string;
  fallbackChain: BackendModel[];
  rateLimitWindow: number;  // ms
}

export interface BackendModel {
  name: string;
  model: string;
  maxRequestsPerMinute: number;
}

export interface GatewayResponse {
  model: string;
  response: string;
  reasoning: string;
  fallbackUsed: boolean;
  checkedModels: string[];
}

// Rate limit tracking
interface RateLimitRecord {
  count: number;
  windowStart: number;
}

const DEFAULT_CONFIG: GatewayConfig = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:14b',
  rateLimitWindow: 60000,  // 1 minute
  fallbackChain: [
    { name: 'Claude Opus', model: 'anthropic/claude-opus-4-5', maxRequestsPerMinute: 50 },
    { name: 'Claude Sonnet', model: 'anthropic/claude-sonnet-4-5', maxRequestsPerMinute: 60 },
    { name: 'GPT-5', model: 'github-copilot/gpt-5.2-codex', maxRequestsPerMinute: 60 },
    { name: 'Kimi', model: 'opencode/kimi-k2.5-free', maxRequestsPerMinute: 100 },
  ],
};

export class OllamaGateway {
  private config: GatewayConfig;
  private rateLimits: Map<string, RateLimitRecord> = new Map();

  constructor(config?: Partial<GatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry: Process a prompt through the gateway
   */
  async process(prompt: string, files?: string[]): Promise<GatewayResponse> {
    const checkedModels: string[] = [];
    
    // Check each model in priority order
    for (const backend of this.config.fallbackChain) {
      checkedModels.push(backend.name);
      
      if (this.isAvailable(backend)) {
        // Model is available, route to it
        this.recordRequest(backend.name);
        
        try {
          const response = await this.callModel(backend.model, prompt, files);
          return {
            model: backend.model,
            response,
            reasoning: `Routed to ${backend.name} (first available in chain)`,
            fallbackUsed: checkedModels.length > 1,
            checkedModels,
          };
        } catch (error) {
          // Model call failed, continue to next
          console.error(`${backend.name} failed:`, error);
          continue;
        }
      }
    }

    // ALL models unavailable - Ollama responds itself
    console.log('All external models unavailable, using Ollama fallback');
    const ollamaResponse = await this.callOllama(prompt);
    
    return {
      model: `ollama/${this.config.ollamaModel}`,
      response: ollamaResponse,
      reasoning: `⚠️ All external models rate-limited. Ollama (${this.config.ollamaModel}) responded directly. Checked: ${checkedModels.join(' → ')}`,
      fallbackUsed: true,
      checkedModels: [...checkedModels, 'Ollama (local)'],
    };
  }

  /**
   * Check if a model is available (not rate limited)
   */
  private isAvailable(backend: BackendModel): boolean {
    const now = Date.now();
    const record = this.rateLimits.get(backend.name);

    if (!record) return true;

    // Reset if window expired
    if (now - record.windowStart > this.config.rateLimitWindow) {
      this.rateLimits.delete(backend.name);
      return true;
    }

    return record.count < backend.maxRequestsPerMinute;
  }

  /**
   * Record a request for rate limiting
   */
  private recordRequest(modelName: string): void {
    const now = Date.now();
    const record = this.rateLimits.get(modelName);

    if (!record || now - record.windowStart > this.config.rateLimitWindow) {
      this.rateLimits.set(modelName, { count: 1, windowStart: now });
    } else {
      record.count++;
    }
  }

  /**
   * Call external model via opencode
   */
  private async callModel(model: string, prompt: string, files?: string[]): Promise<string> {
    const fileArgs = files?.map(f => `-f "${f}"`).join(' ') || '';
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    const cmd = `opencode run -m "${model}" ${fileArgs} "${escapedPrompt}"`;
    
    const { stdout } = await execAsync(cmd, { 
      timeout: 120000,  // 2 min timeout
      maxBuffer: 10 * 1024 * 1024,  // 10MB
    });
    
    return stdout;
  }

  /**
   * Call local Ollama model directly
   */
  private async callOllama(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.ollamaModel,
        prompt,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.response || 'Ollama failed to generate response';
  }

  /**
   * Get current rate limit status for all models
   */
  getStatus(): Record<string, { available: boolean; used: number; limit: number; resetsIn: number }> {
    const now = Date.now();
    const status: Record<string, any> = {};

    for (const backend of this.config.fallbackChain) {
      const record = this.rateLimits.get(backend.name);
      const used = record?.count ?? 0;
      const resetsIn = record ? Math.max(0, this.config.rateLimitWindow - (now - record.windowStart)) : 0;
      
      status[backend.name] = {
        available: this.isAvailable(backend),
        used,
        limit: backend.maxRequestsPerMinute,
        resetsIn: Math.round(resetsIn / 1000),
      };
    }

    status['Ollama (local)'] = {
      available: true,
      used: 0,
      limit: Infinity,
      resetsIn: 0,
    };

    return status;
  }

  /**
   * Manually mark a model as rate limited (e.g., from API error)
   */
  markRateLimited(modelName: string, count?: number): void {
    const backend = this.config.fallbackChain.find(b => b.name === modelName);
    if (backend) {
      this.rateLimits.set(modelName, {
        count: count ?? backend.maxRequestsPerMinute,
        windowStart: Date.now(),
      });
    }
  }

  /**
   * Test Ollama connectivity
   */
  async testOllama(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const gateway = new OllamaGateway();

// CLI helper
export async function route(prompt: string, files?: string[]): Promise<GatewayResponse> {
  return gateway.process(prompt, files);
}

export function status(): Record<string, any> {
  return gateway.getStatus();
}
