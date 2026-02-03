/**
 * oh-my-moltbot - Multi-Model Orchestration Plugin for Moltbot
 * 
 * Features:
 * - Intelligent model routing based on task type
 * - Agent definitions with specialized models
 * - Auto-review integration (Kimi)
 * - Fallback chains for reliability
 * - Hook system for lifecycle events
 */

// Type exports (compile-time only)
export type { OhMyMoltbotConfig, AgentConfig, CategoryConfig, ReviewConfig } from './config/schema';
export type { TaskContext, ModelSelection } from './orchestrator';

// Value exports (runtime)
export { defaultConfig } from './config/schema';
export { ModelOrchestrator } from './orchestrator';

// Gateway
export { gateway, OllamaGateway } from './gateway/ollama-gateway';

// Proxy/Interviewer
export { proxy, interviewer, PROXY_SYSTEM_PROMPT } from './proxy';

// Ultrawork
export { 
  sessionManager, 
  planner, 
  ultrawork, 
  spawnParallel, 
  collectResults,
  getUltraworkPrompt,
} from './ultrawork';

// Seed Harvester
export { harvester, saveSeed } from './hooks/seed-harvester';

// Moltbot Plugin
export { plugin as moltbotPlugin } from './moltbot-plugin';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OhMyMoltbotConfig, defaultConfig } from './config/schema';
import { ModelOrchestrator } from './orchestrator';

const CONFIG_FILENAME = 'oh-my-moltbot.json';

/**
 * Load configuration from file or use defaults
 */
export function loadConfig(workspaceDir?: string): OhMyMoltbotConfig {
  const searchPaths = [
    workspaceDir && join(workspaceDir, CONFIG_FILENAME),
    join(process.cwd(), CONFIG_FILENAME),
    join(process.env.HOME || '', '.config', 'moltbot', CONFIG_FILENAME),
  ].filter(Boolean) as string[];

  for (const configPath of searchPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        return mergeConfig(defaultConfig, userConfig);
      } catch (e) {
        console.error(`Failed to parse config at ${configPath}:`, e);
      }
    }
  }

  return defaultConfig;
}

/**
 * Deep merge user config with defaults
 */
function mergeConfig(defaults: OhMyMoltbotConfig, user: Partial<OhMyMoltbotConfig>): OhMyMoltbotConfig {
  return {
    ...defaults,
    ...user,
    agents: { ...defaults.agents, ...user.agents },
    categories: { ...defaults.categories, ...user.categories },
    review: { ...defaults.review, ...user.review },
    hooks: { ...defaults.hooks, ...user.hooks },
  };
}

/**
 * Create orchestrator instance
 */
export function createOrchestrator(workspaceDir?: string): ModelOrchestrator {
  const config = loadConfig(workspaceDir);
  return new ModelOrchestrator(config);
}

/**
 * Quick helper to select model for a task
 */
export function selectModelForTask(
  message: string,
  options?: {
    files?: string[];
    agent?: string;
    category?: string;
    workspaceDir?: string;
  }
): { model: string; variant?: string; reason: string } {
  const orchestrator = createOrchestrator(options?.workspaceDir);
  return orchestrator.selectModel({
    message,
    files: options?.files,
    agentHint: options?.agent,
    categoryHint: options?.category,
  });
}

// Re-export plugin as default for Moltbot
export { plugin as default } from './moltbot-plugin';
