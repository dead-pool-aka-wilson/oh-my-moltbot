/**
 * oh-my-moltbot Configuration Schema
 * Defines multi-model orchestration settings
 */

export interface ModelConfig {
  model: string;
  variant?: 'low' | 'medium' | 'high' | 'max';
  description?: string;
}

export interface AgentConfig extends ModelConfig {
  systemPrompt?: string;
  tools?: string[];
  permissions?: string[];
}

export interface CategoryConfig extends ModelConfig {
  triggers?: string[];  // Keywords that trigger this category
  filePatterns?: string[];  // File patterns that should use this model
}

export interface ReviewConfig {
  enabled: boolean;
  model: string;
  blockOnCritical?: boolean;
  reviewThreshold?: 'all' | 'edits-only' | 'large-changes';
  extensions?: string[];
  ignorePatterns?: string[];
}

export interface OhMyMoltbotConfig {
  $schema?: string;
  
  // Default model for unspecified tasks
  defaultModel?: string;
  
  // Named agents with specific models
  agents?: Record<string, AgentConfig>;
  
  // Task categories with model routing
  categories?: Record<string, CategoryConfig>;
  
  // Auto-review configuration (Kimi, etc.)
  review?: ReviewConfig;
  
  // Model fallback chain
  fallbackChain?: string[];
  
  // Hooks configuration
  hooks?: {
    onSessionStart?: string[];
    onSessionEnd?: string[];
    onError?: string[];
    beforeToolCall?: string[];
    afterToolCall?: string[];
  };
}

export const defaultConfig: OhMyMoltbotConfig = {
  defaultModel: 'anthropic/claude-sonnet-4-5',
  
  agents: {
    orchestrator: {
      model: 'anthropic/claude-opus-4-5',
      description: 'Main orchestrator for complex planning and reasoning',
      variant: 'high',
    },
    coder: {
      model: 'github-copilot/gpt-5.2-codex',
      description: 'Fast coding and implementation',
    },
    reviewer: {
      model: 'opencode/kimi-k2.5-free',
      description: 'Code review and security analysis',
    },
    explorer: {
      model: 'google/gemini-2.5-pro',
      description: 'Research and exploration with long context',
    },
    quick: {
      model: 'google/gemini-2.5-flash',
      description: 'Quick tasks and fast responses',
    },
  },
  
  categories: {
    coding: {
      model: 'github-copilot/gpt-5.2-codex',
      triggers: ['implement', 'code', 'write function', 'create class'],
      filePatterns: ['*.ts', '*.js', '*.py', '*.go', '*.rs'],
    },
    planning: {
      model: 'anthropic/claude-opus-4-5',
      variant: 'high',
      triggers: ['plan', 'design', 'architect', 'strategy'],
    },
    review: {
      model: 'opencode/kimi-k2.5-free',
      triggers: ['review', 'check', 'audit', 'security'],
    },
    chinese: {
      model: 'opencode/kimi-k2.5-free',
      triggers: ['翻译', '中文', 'chinese', 'translate to chinese'],
    },
    vision: {
      model: 'google/gemini-2.5-flash-image',
      triggers: ['image', 'screenshot', 'visual', '看图'],
    },
  },
  
  review: {
    enabled: true,
    model: 'opencode/kimi-k2.5-free',
    blockOnCritical: true,
    reviewThreshold: 'edits-only',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'],
    ignorePatterns: ['**/node_modules/**', '**/*.test.*', '**/dist/**'],
  },
  
  fallbackChain: [
    'anthropic/claude-sonnet-4-5',
    'google/gemini-2.5-pro',
    'anthropic/claude-haiku-4-5',
  ],
};
