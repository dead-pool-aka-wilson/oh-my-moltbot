/**
 * Model Orchestrator
 * Routes tasks to appropriate models based on configuration
 */

import { OhMyMoltbotConfig, CategoryConfig, AgentConfig } from './config/schema';

export interface TaskContext {
  message: string;
  files?: string[];
  sessionId?: string;
  agentHint?: string;
  categoryHint?: string;
}

export interface ModelSelection {
  model: string;
  variant?: string;
  reason: string;
  agent?: string;
  category?: string;
}

export class ModelOrchestrator {
  private config: OhMyMoltbotConfig;

  constructor(config: OhMyMoltbotConfig) {
    this.config = config;
  }

  /**
   * Select the best model for a given task
   */
  selectModel(context: TaskContext): ModelSelection {
    // 1. Check for explicit agent hint
    if (context.agentHint && this.config.agents?.[context.agentHint]) {
      const agent = this.config.agents[context.agentHint];
      return {
        model: agent.model,
        variant: agent.variant,
        reason: `Explicit agent: ${context.agentHint}`,
        agent: context.agentHint,
      };
    }

    // 2. Check for explicit category hint
    if (context.categoryHint && this.config.categories?.[context.categoryHint]) {
      const category = this.config.categories[context.categoryHint];
      return {
        model: category.model,
        variant: category.variant,
        reason: `Explicit category: ${context.categoryHint}`,
        category: context.categoryHint,
      };
    }

    // 3. Check file patterns
    if (context.files?.length) {
      for (const [catName, cat] of Object.entries(this.config.categories || {})) {
        if (this.matchesFilePatterns(context.files, cat.filePatterns)) {
          return {
            model: cat.model,
            variant: cat.variant,
            reason: `File pattern match: ${catName}`,
            category: catName,
          };
        }
      }
    }

    // 4. Check message triggers
    const messageLower = context.message.toLowerCase();
    for (const [catName, cat] of Object.entries(this.config.categories || {})) {
      if (this.matchesTriggers(messageLower, cat.triggers)) {
        return {
          model: cat.model,
          variant: cat.variant,
          reason: `Trigger match: ${catName}`,
          category: catName,
        };
      }
    }

    // 5. Default model
    return {
      model: this.config.defaultModel || 'anthropic/claude-sonnet-4-5',
      reason: 'Default model',
    };
  }

  /**
   * Check if files match any of the patterns
   */
  private matchesFilePatterns(files: string[], patterns?: string[]): boolean {
    if (!patterns?.length) return false;
    
    return files.some(file => {
      return patterns.some(pattern => {
        // Simple glob matching
        const regex = new RegExp(
          pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        );
        return regex.test(file);
      });
    });
  }

  /**
   * Check if message contains any trigger keywords
   */
  private matchesTriggers(message: string, triggers?: string[]): boolean {
    if (!triggers?.length) return false;
    return triggers.some(trigger => message.includes(trigger.toLowerCase()));
  }

  /**
   * Get agent by name
   */
  getAgent(name: string): AgentConfig | undefined {
    return this.config.agents?.[name];
  }

  /**
   * Get category by name
   */
  getCategory(name: string): CategoryConfig | undefined {
    return this.config.categories?.[name];
  }

  /**
   * Get fallback model chain
   */
  getFallbackChain(): string[] {
    return this.config.fallbackChain || [
      this.config.defaultModel || 'anthropic/claude-sonnet-4-5',
    ];
  }

  /**
   * Should review be triggered?
   */
  shouldReview(files: string[]): boolean {
    const review = this.config.review;
    if (!review?.enabled) return false;
    
    // Check if any file matches review extensions
    const hasMatchingFile = files.some(file => {
      const ext = '.' + file.split('.').pop();
      return review.extensions?.includes(ext);
    });
    
    if (!hasMatchingFile) return false;
    
    // Check ignore patterns
    const allIgnored = files.every(file => {
      return review.ignorePatterns?.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(file);
      });
    });
    
    return !allIgnored;
  }
}
