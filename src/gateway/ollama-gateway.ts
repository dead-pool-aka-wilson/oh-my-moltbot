/**
 * Ollama Prompt Gateway
 * 
 * Ollama acts as a FREE, unlimited orchestrator layer:
 * 1. Receives all prompts
 * 2. Analyzes prompt type using local model
 * 3. Checks target model availability
 * 4. Routes to appropriate backend model
 * 5. Returns response
 * 
 * Benefits:
 * - No rate limits on orchestration
 * - Cost-free prompt analysis
 * - Automatic failover
 * - Local-first processing
 */

export interface GatewayConfig {
  ollamaUrl: string;
  routerModel: string;  // Local model for routing decisions
  backends: BackendConfig[];
  fallbackBackend: string;
}

export interface BackendConfig {
  name: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'google' | 'kimi' | 'ollama';
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute?: number;
  };
  capabilities: string[];  // ['coding', 'planning', 'vision', 'chinese', etc.]
}

export interface RoutingDecision {
  backend: string;
  model: string;
  reason: string;
  confidence: number;
}

export interface PromptAnalysis {
  type: 'coding' | 'planning' | 'review' | 'chinese' | 'vision' | 'quick' | 'general';
  complexity: 'low' | 'medium' | 'high';
  requiresLongContext: boolean;
  hasImages: boolean;
  language: string;
}

const DEFAULT_CONFIG: GatewayConfig = {
  ollamaUrl: 'http://localhost:11434',
  routerModel: 'phi3:mini',  // Small, fast model for routing
  backends: [
    {
      name: 'claude-opus',
      model: 'anthropic/claude-opus-4-5',
      provider: 'anthropic',
      rateLimit: { requestsPerMinute: 50 },
      capabilities: ['planning', 'reasoning', 'general', 'coding'],
    },
    {
      name: 'gpt-codex',
      model: 'github-copilot/gpt-5.2-codex',
      provider: 'openai',
      rateLimit: { requestsPerMinute: 60 },
      capabilities: ['coding'],
    },
    {
      name: 'kimi',
      model: 'opencode/kimi-k2.5-free',
      provider: 'kimi',
      capabilities: ['review', 'chinese', 'coding'],
    },
    {
      name: 'gemini-flash',
      model: 'google/gemini-2.5-flash',
      provider: 'google',
      rateLimit: { requestsPerMinute: 100 },
      capabilities: ['quick', 'general'],
    },
    {
      name: 'gemini-vision',
      model: 'google/gemini-2.5-flash-image',
      provider: 'google',
      capabilities: ['vision'],
    },
    {
      name: 'gemini-pro',
      model: 'google/gemini-2.5-pro',
      provider: 'google',
      capabilities: ['general', 'long-context'],
    },
  ],
  fallbackBackend: 'gemini-flash',
};

export class OllamaGateway {
  private config: GatewayConfig;
  private requestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(config?: Partial<GatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: route a prompt to the best backend
   */
  async routePrompt(prompt: string, options?: {
    images?: string[];
    files?: string[];
    preferredBackend?: string;
  }): Promise<RoutingDecision> {
    // 1. Analyze the prompt using local Ollama model
    const analysis = await this.analyzePrompt(prompt, options);
    
    // 2. Find suitable backends
    const candidates = this.findCandidates(analysis);
    
    // 3. Check availability (rate limits, health)
    const available = await this.filterAvailable(candidates);
    
    // 4. Select best backend
    const selected = this.selectBest(available, analysis);
    
    return selected;
  }

  /**
   * Analyze prompt using local Ollama model
   */
  private async analyzePrompt(prompt: string, options?: {
    images?: string[];
    files?: string[];
  }): Promise<PromptAnalysis> {
    const analysisPrompt = `Analyze this prompt and classify it. Output JSON only.

Prompt: "${prompt.slice(0, 500)}"
${options?.images?.length ? `Has images: ${options.images.length}` : ''}
${options?.files?.length ? `Has files: ${options.files.join(', ')}` : ''}

Classify:
- type: coding|planning|review|chinese|vision|quick|general
- complexity: low|medium|high  
- requiresLongContext: true|false
- hasImages: true|false
- language: detected language code (en, zh, ko, etc.)

JSON only:`;

    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.routerModel,
          prompt: analysisPrompt,
          stream: false,
          options: { temperature: 0 },
        }),
      });

      const data = await response.json();
      const jsonMatch = data.response?.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Ollama analysis failed:', e);
    }

    // Fallback: simple heuristic analysis
    return this.heuristicAnalysis(prompt, options);
  }

  /**
   * Fallback heuristic analysis (no Ollama needed)
   */
  private heuristicAnalysis(prompt: string, options?: {
    images?: string[];
    files?: string[];
  }): PromptAnalysis {
    const lower = prompt.toLowerCase();
    
    // Detect type
    let type: PromptAnalysis['type'] = 'general';
    if (/\b(implement|code|function|class|api|write)\b/.test(lower)) type = 'coding';
    else if (/\b(plan|design|architect|strategy)\b/.test(lower)) type = 'planning';
    else if (/\b(review|check|audit|security)\b/.test(lower)) type = 'review';
    else if (/[\u4e00-\u9fff]/.test(prompt)) type = 'chinese';
    else if (options?.images?.length) type = 'vision';
    else if (prompt.length < 100) type = 'quick';

    // Detect complexity
    let complexity: PromptAnalysis['complexity'] = 'medium';
    if (prompt.length > 1000) complexity = 'high';
    else if (prompt.length < 200) complexity = 'low';

    // Detect language
    let language = 'en';
    if (/[\u4e00-\u9fff]/.test(prompt)) language = 'zh';
    else if (/[\uac00-\ud7af]/.test(prompt)) language = 'ko';
    else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(prompt)) language = 'ja';

    return {
      type,
      complexity,
      requiresLongContext: prompt.length > 5000,
      hasImages: (options?.images?.length ?? 0) > 0,
      language,
    };
  }

  /**
   * Find candidate backends for the analysis
   */
  private findCandidates(analysis: PromptAnalysis): BackendConfig[] {
    const required = [analysis.type];
    if (analysis.hasImages) required.push('vision');
    if (analysis.requiresLongContext) required.push('long-context');
    
    return this.config.backends.filter(backend =>
      required.some(cap => backend.capabilities.includes(cap))
    );
  }

  /**
   * Filter backends by availability (rate limits)
   */
  private async filterAvailable(candidates: BackendConfig[]): Promise<BackendConfig[]> {
    const now = Date.now();
    
    return candidates.filter(backend => {
      if (!backend.rateLimit) return true;
      
      const key = backend.name;
      const record = this.requestCounts.get(key);
      
      if (!record || now > record.resetAt) {
        return true;
      }
      
      return record.count < backend.rateLimit.requestsPerMinute;
    });
  }

  /**
   * Select the best backend from available options
   */
  private selectBest(available: BackendConfig[], analysis: PromptAnalysis): RoutingDecision {
    if (available.length === 0) {
      // Fallback
      const fallback = this.config.backends.find(b => b.name === this.config.fallbackBackend);
      return {
        backend: this.config.fallbackBackend,
        model: fallback?.model || 'google/gemini-2.5-flash',
        reason: 'Fallback - all candidates unavailable',
        confidence: 0.5,
      };
    }

    // Priority scoring
    const scored = available.map(backend => {
      let score = 0;
      
      // Exact type match
      if (backend.capabilities.includes(analysis.type)) score += 10;
      
      // Complexity match
      if (analysis.complexity === 'high' && backend.name.includes('opus')) score += 5;
      if (analysis.complexity === 'low' && backend.name.includes('flash')) score += 5;
      
      // Special cases
      if (analysis.hasImages && backend.capabilities.includes('vision')) score += 15;
      if (analysis.language === 'zh' && backend.capabilities.includes('chinese')) score += 10;
      
      return { backend, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      backend: best.backend.name,
      model: best.backend.model,
      reason: `Best match for ${analysis.type} (score: ${best.score})`,
      confidence: Math.min(best.score / 20, 1),
    };
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest(backend: string): void {
    const now = Date.now();
    const key = backend;
    const record = this.requestCounts.get(key);
    
    if (!record || now > record.resetAt) {
      this.requestCounts.set(key, { count: 1, resetAt: now + 60000 });
    } else {
      record.count++;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): Record<string, { used: number; limit: number; resetIn: number }> {
    const now = Date.now();
    const status: Record<string, any> = {};
    
    for (const backend of this.config.backends) {
      const record = this.requestCounts.get(backend.name);
      status[backend.name] = {
        used: record?.count ?? 0,
        limit: backend.rateLimit?.requestsPerMinute ?? Infinity,
        resetIn: record ? Math.max(0, record.resetAt - now) : 0,
      };
    }
    
    return status;
  }
}

// Export singleton for convenience
export const gateway = new OllamaGateway();
