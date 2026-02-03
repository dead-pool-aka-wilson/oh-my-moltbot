/**
 * oh-my-moltbot - Moltbot Plugin
 * 
 * Multi-Model Orchestration Plugin for Moltbot
 * 
 * Features:
 * - Ollama Gateway: Routes prompts through cascading fallback chain
 * - Proxy Mode: Model acts as user's thought partner
 * - Ultrawork Mode: Parallel session execution
 * - Seed Harvesting: Extract blog-worthy content from conversations
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeAgentStartResult,
  PluginHookAgentContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageContext,
  PluginHookBeforeModelSelectEvent,
  PluginHookBeforeModelSelectResult,
} from './types';

import { gateway, type RoutingDecision } from '../gateway/ollama-gateway';
import { proxy } from '../proxy';
import { getUltraworkPrompt } from '../ultrawork/prompts';
import { harvester } from '../hooks/seed-harvester';

// Plugin state
let ultraworkEnabled = false;
let proxySessionId: string | null = null;
let gatewayRoutingEnabled = true;
let lastRoutingDecision: RoutingDecision | null = null;

const CATEGORY_TO_MODEL: Record<string, string> = {
  planning: 'anthropic/claude-opus-4-5',
  reasoning: 'anthropic/claude-opus-4-5',
  coding: 'anthropic/claude-opus-4-5',
  review: 'moonshotai/kimi-k2.5-coder',
  quick: 'anthropic/claude-sonnet-4-5',
  vision: 'google/gemini-2.5-flash',
  image_gen: 'google/gemini-2.5-pro-image',
  local: 'ollama/qwen2.5:14b',
};

/**
 * oh-my-moltbot Plugin Definition
 */
export const plugin: OpenClawPluginDefinition = {
  id: 'oh-my-moltbot',
  name: 'oh-my-moltbot',
  description: 'Multi-Model Orchestration with Ollama Gateway, Proxy Mode, and Ultrawork',
  version: '0.1.0',

  register(api: OpenClawPluginApi) {
    api.logger.info('🚀 oh-my-moltbot loading...');

    // ==========================================================================
    // Commands
    // ==========================================================================

    // /ultrawork - Toggle ultrawork mode
    api.registerCommand({
      name: 'ultrawork',
      description: 'Toggle Ultrawork parallel execution mode',
      handler: () => {
        ultraworkEnabled = !ultraworkEnabled;
        return {
          text: ultraworkEnabled 
            ? '🚀 ULTRAWORK MODE ENABLED! Parallel sessions active.'
            : '💤 Ultrawork mode disabled.',
        };
      },
    });

    // /proxy - Start a proxy/interview session
    api.registerCommand({
      name: 'proxy',
      description: 'Start a proxy session (model becomes your thought partner)',
      acceptsArgs: true,
      handler: async (ctx) => {
        if (!ctx.args) {
          return { text: 'Usage: /proxy <your request>\n\nExample: /proxy Build a REST API for user authentication' };
        }

        try {
          const result = await proxy.start(ctx.args);
          proxySessionId = result.sessionId;
          
          return {
            text: `🎭 **Proxy Session Started**\n\nSession: \`${result.sessionId}\`\nRouted to: ${result.routedTo}\n\n${result.proxyResponse}`,
          };
        } catch (error: any) {
          return { text: `❌ Failed to start proxy session: ${error.message}` };
        }
      },
    });

    // /gateway - Show gateway status or toggle routing
    api.registerCommand({
      name: 'gateway',
      description: 'Show gateway status. Use "/gateway on|off" to toggle routing.',
      acceptsArgs: true,
      handler: async (ctx) => {
        if (ctx.args === 'on') {
          gatewayRoutingEnabled = true;
          return { text: '🌐 Gateway routing **ENABLED**. All messages will route through Ollama first.' };
        }
        if (ctx.args === 'off') {
          gatewayRoutingEnabled = false;
          return { text: '🌐 Gateway routing **DISABLED**. Messages go directly to default model.' };
        }

        const status = gateway.getStatus();
        const lines = [
          `🌐 **Gateway Status** (routing: ${gatewayRoutingEnabled ? 'ON' : 'OFF'})\n`,
        ];
        
        if (lastRoutingDecision) {
          lines.push(`Last route: **${lastRoutingDecision.category}** (${lastRoutingDecision.complexity})`);
          lines.push(`Reason: ${lastRoutingDecision.reasoning}\n`);
        }
        
        lines.push('**Model Pool:**');
        for (const [name, info] of Object.entries(status)) {
          const avail = info.available ? '✅' : '❌';
          const limit = info.limit === Infinity ? '∞' : info.limit;
          lines.push(`${avail} ${name}: ${info.used}/${limit} (resets: ${info.resetsIn}s)`);
        }
        
        lines.push('\n_Use `/gateway on` or `/gateway off` to toggle routing_');
        
        return { text: lines.join('\n') };
      },
    });

    // /route - Analyze prompt and recommend model
    api.registerCommand({
      name: 'route',
      description: 'Analyze a prompt and get model recommendation. Use: /route <your prompt>',
      acceptsArgs: true,
      handler: async (ctx) => {
        if (!ctx.args) {
          return { 
            text: `**Usage:** \`/route <your prompt>\`

Analyzes your prompt and recommends the best model.

**Example:**
\`/route implement a REST API for user auth\`

Then switch with: \`/model <recommended-model>\`` 
          };
        }

        try {
          const routing = await gateway.analyze(ctx.args);
          const targetModel = CATEGORY_TO_MODEL[routing.category] || CATEGORY_TO_MODEL.quick;
          
          const modelShorthand: Record<string, string> = {
            'anthropic/claude-opus-4-5': 'opus',
            'anthropic/claude-sonnet-4-5': 'sonnet',
            'google/gemini-2.5-flash': 'flash',
            'google/gemini-2.5-pro': 'gemini-pro',
            'google/gemini-2.5-pro-image': 'gemini-image',
            'github-copilot/gpt-5.2-codex': 'gpt5',
            'moonshotai/kimi-k2.5-coder': 'kimi',
          };
          
          const shorthand = modelShorthand[targetModel] || targetModel;
          
          return {
            text: `**Route Analysis**

**Category:** ${routing.category}
**Complexity:** ${routing.complexity}
**Reasoning:** ${routing.reasoning}

**Recommended Model:** \`${targetModel}\`

**To switch:** \`/model ${shorthand}\`
Then send your prompt.`
          };
        } catch (error: any) {
          return { text: `Route analysis failed: ${error.message}` };
        }
      },
    });

    // /dispatch - Dispatch refined prompts from proxy session
    api.registerCommand({
      name: 'dispatch',
      description: 'Dispatch tasks from current proxy session',
      handler: async () => {
        if (!proxySessionId) {
          return { text: '❌ No active proxy session. Use /proxy first.' };
        }

        try {
          const result = await proxy.dispatch(proxySessionId);
          proxySessionId = null;  // Clear session
          
          return {
            text: `🚀 **Dispatched ${result.sessionIds.length} tasks**\n\n${result.plan.waves.map((w: { wave: number; tasks: { title: string }[] }) => 
              `Wave ${w.wave}: ${w.tasks.map((t: { title: string }) => t.title).join(', ')}`
            ).join('\n')}`,
          };
        } catch (error: any) {
          return { text: `❌ Dispatch failed: ${error.message}` };
        }
      },
    });

    // ==========================================================================
    // Lifecycle Hooks
    // ==========================================================================

    api.logger.info('[oh-my-moltbot] Registering before_agent_start hook...');
    
    // Gateway routing: analyze prompt and route to best model
    api.on('before_agent_start', async (
      event: PluginHookBeforeAgentStartEvent,
      ctx: PluginHookAgentContext
    ): Promise<PluginHookBeforeAgentStartResult | void> => {
      api.logger.info('[oh-my-moltbot] >>> before_agent_start hook triggered <<<');
      const result: PluginHookBeforeAgentStartResult = {};

      // Ultrawork prompt injection
      if (ultraworkEnabled) {
        api.logger.info('[oh-my-moltbot] Injecting ultrawork system prompt');
        result.prependContext = getUltraworkPrompt();
      }

      // Gateway routing analysis (logging only - no context injection)
      if (gatewayRoutingEnabled && event.prompt) {
        try {
          const routing = await gateway.analyze(event.prompt);
          lastRoutingDecision = routing;
          const targetModel = CATEGORY_TO_MODEL[routing.category] || CATEGORY_TO_MODEL.quick;
          api.logger.info(`[oh-my-moltbot] Route recommendation: ${routing.category} -> ${targetModel}`);
        } catch (error: any) {
          api.logger.warn(`[oh-my-moltbot] Gateway analysis failed: ${error.message}`);
        }
      }

      if (Object.keys(result).length > 0) {
        return result;
      }
    });

    // ==========================================================================
    // before_model_select: Override model selection based on prompt analysis
    // ==========================================================================

    api.on('before_model_select', async (
      event: PluginHookBeforeModelSelectEvent,
      ctx: PluginHookAgentContext
    ): Promise<PluginHookBeforeModelSelectResult | void> => {
      if (!gatewayRoutingEnabled || !event.prompt) {
        return;
      }

      try {
        const routing = await gateway.analyze(event.prompt);
        lastRoutingDecision = routing;

        if (routing.category === 'local') {
          api.logger.info(`[oh-my-moltbot] Route: local (keeping current model)`);
          return;
        }

        const targetModelKey = CATEGORY_TO_MODEL[routing.category];
        if (!targetModelKey) {
          api.logger.warn(`[oh-my-moltbot] Unknown category: ${routing.category}`);
          return;
        }

        const [targetProvider, targetModel] = targetModelKey.split('/');
        if (!targetProvider || !targetModel) {
          api.logger.warn(`[oh-my-moltbot] Invalid model key format: ${targetModelKey}`);
          return;
        }

        if (!event.allowedModelKeys.has(targetModelKey)) {
          api.logger.info(`[oh-my-moltbot] Target ${targetModelKey} not in allowlist, keeping current`);
          return;
        }

        if (event.provider === targetProvider && event.model === targetModel) {
          api.logger.info(`[oh-my-moltbot] Already using ${targetModelKey}`);
          return;
        }

        api.logger.info(`[oh-my-moltbot] Routing ${routing.category} -> ${targetModelKey}`);
        return { provider: targetProvider, model: targetModel };
      } catch (error: any) {
        api.logger.warn(`[oh-my-moltbot] Gateway analysis failed: ${error.message}`);
        return;
      }
    });

    // Harvest seeds from conversations
    api.on('message_received', async (
      event: PluginHookMessageReceivedEvent,
      ctx: PluginHookMessageContext
    ) => {
      // Analyze for potential seeds (async, don't block)
      try {
        const seeds = harvester.analyzeConversation([
          { role: 'user', content: event.content }
        ]);
        
        if (seeds.length > 0) {
          api.logger.debug?.(`Found ${seeds.length} potential seeds`);
        }
      } catch (e) {
        // Don't fail on seed harvesting errors
      }
    });

    // ==========================================================================
    // Tools
    // ==========================================================================

    // spawn_parallel tool for ultrawork
    api.registerTool({
      name: 'spawn_parallel',
      description: 'Spawn multiple parallel sessions for research/exploration',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'Task prompt' },
                category: { type: 'string', description: 'Category (explore, coding, review, etc.)' },
              },
              required: ['prompt'],
            },
            description: 'Array of tasks to run in parallel',
          },
        },
        required: ['tasks'],
      },
      async execute(params: { tasks: Array<{ prompt: string; category?: string }> }) {
        const { sessionManager } = await import('../ultrawork/session-manager');
        
        const sessionIds = await sessionManager.spawnMany(
          params.tasks.map(t => ({
            prompt: t.prompt,
            options: { category: t.category, background: true },
          }))
        );

        return {
          success: true,
          sessionIds,
          message: `Spawned ${sessionIds.length} parallel sessions`,
        };
      },
    });

    // route_prompt tool for gateway
    api.registerTool({
      name: 'route_prompt',
      description: 'Route a prompt through the Ollama gateway to find the best model',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to route' },
        },
        required: ['prompt'],
      },
      async execute(params: { prompt: string }) {
        const result = await gateway.process(params.prompt);
        
        return {
          model: result.model,
          routing: result.routing,
          attemptedModels: result.attemptedModels,
          fallbackUsed: result.fallbackUsed,
        };
      },
    });

    // generate_image tool using Gemini (nano-banana-pro)
    api.registerTool({
      name: 'generate_image',
      description: 'Generate an image using Gemini 3 Pro Image (Nano Banana Pro). Can also edit/composite multiple images.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image description or edit instructions' },
          filename: { type: 'string', description: 'Output filename (e.g., sunset-mountains.png). Will be saved to ~/Downloads/' },
          resolution: { 
            type: 'string', 
            enum: ['1K', '2K', '4K'],
            description: 'Output resolution (default: 1K)' 
          },
          inputImages: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Input image paths for editing/composition (up to 14 images)' 
          },
        },
        required: ['prompt', 'filename'],
      },
      async execute(params: { 
        prompt: string; 
        filename: string; 
        resolution?: string; 
        inputImages?: string[] 
      }) {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const path = await import('path');
        const execFileAsync = promisify(execFile);

        const scriptPath = path.join(
          process.env.HOME || '',
          'openclaw/skills/nano-banana-pro/scripts/generate_image.py'
        );
        
        const outputDir = path.join(process.env.HOME || '', 'Downloads');
        const outputPath = path.join(outputDir, params.filename);

        const args = [
          'run', scriptPath,
          '--prompt', params.prompt,
          '--filename', outputPath,
        ];

        if (params.resolution) {
          args.push('--resolution', params.resolution);
        }

        if (params.inputImages?.length) {
          for (const img of params.inputImages) {
            args.push('-i', img);
          }
        }

        try {
          const geminiKey = (api.pluginConfig as any)?.apiKey || process.env.GEMINI_API_KEY || '';
          const { stdout, stderr } = await execFileAsync('uv', args, {
            timeout: 120000,
            env: { ...process.env, GEMINI_API_KEY: geminiKey } as NodeJS.ProcessEnv,
          });

          const mediaMatch = stdout.match(/MEDIA:(.+)/);
          const mediaPath = mediaMatch ? mediaMatch[1].trim() : outputPath;

          return {
            success: true,
            path: mediaPath,
            message: `Image generated: ${mediaPath}`,
            stdout: stdout.trim(),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            stderr: error.stderr,
          };
        }
      },
    });

    api.registerTool({
      name: 'run_opencode',
      description: 'Run opencode to execute a coding task. Use for general tasks that don\'t require special permissions.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The task to execute' },
          model: { type: 'string', description: 'Model to use (optional, defaults to claude-sonnet-4-5)' },
          workdir: { type: 'string', description: 'Working directory for the task (optional)' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 300)' },
        },
        required: ['prompt'],
      },
      async execute(params: { prompt: string; model?: string; workdir?: string; timeout?: number }) {
        const { sessionManager } = await import('../ultrawork/session-manager');
        
        const sessionId = await sessionManager.spawn(params.prompt, {
          model: params.model,
          background: false,
          timeout: (params.timeout || 300) * 1000,
        });

        const sessions = await sessionManager.waitFor([sessionId], (params.timeout || 300) * 1000);
        const session = sessions[0];

        if (session.status === 'completed') {
          return {
            success: true,
            sessionId,
            output: session.result,
          };
        } else {
          return {
            success: false,
            sessionId,
            error: session.error,
          };
        }
      },
    });

    api.registerTool({
      name: 'run_scoped_task',
      description: 'Run a scoped/limited opencode task. Creates a prompt with strict constraints. Use for tasks requiring specific permissions.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What you want to accomplish' },
          scope: {
            type: 'object',
            properties: {
              allowed_paths: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Files/directories opencode CAN modify (glob patterns supported)',
              },
              forbidden_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Files/directories opencode MUST NOT touch',
              },
              allowed_commands: {
                type: 'array',
                items: { type: 'string' },
                description: 'Shell commands opencode CAN run',
              },
              forbidden_commands: {
                type: 'array',
                items: { type: 'string' },
                description: 'Shell commands opencode MUST NOT run',
              },
              no_git_commit: { type: 'boolean', description: 'Prevent git commits' },
              no_git_push: { type: 'boolean', description: 'Prevent git push' },
              no_install: { type: 'boolean', description: 'Prevent package installs' },
              read_only: { type: 'boolean', description: 'Read-only mode' },
            },
          },
          model: { type: 'string', description: 'Model to use' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 300)' },
        },
        required: ['task', 'scope'],
      },
      async execute(params: {
        task: string;
        scope: {
          allowed_paths?: string[];
          forbidden_paths?: string[];
          allowed_commands?: string[];
          forbidden_commands?: string[];
          no_git_commit?: boolean;
          no_git_push?: boolean;
          no_install?: boolean;
          read_only?: boolean;
        };
        model?: string;
        timeout?: number;
      }) {
        const { sessionManager } = await import('../ultrawork/session-manager');
        const scope = params.scope;

        const constraints: string[] = ['# STRICT CONSTRAINTS - VIOLATION = IMMEDIATE FAILURE\n'];

        if (scope.read_only) {
          constraints.push('## READ-ONLY MODE\n- MUST NOT modify any files\n- MUST NOT run write operations\n- Only read, analyze, and report\n');
        }

        if (scope.allowed_paths?.length) {
          constraints.push(`## ALLOWED PATHS (ONLY these can be modified)\n${scope.allowed_paths.map(p => `- ${p}`).join('\n')}\n- Any path NOT in this list is READ-ONLY\n`);
        }

        if (scope.forbidden_paths?.length) {
          constraints.push(`## FORBIDDEN PATHS (NEVER touch)\n${scope.forbidden_paths.map(p => `- ${p}`).join('\n')}\n`);
        }

        if (scope.allowed_commands?.length) {
          constraints.push(`## ALLOWED COMMANDS (ONLY these)\n${scope.allowed_commands.map(c => `- ${c}`).join('\n')}\n- Any command NOT in this list is FORBIDDEN\n`);
        }

        if (scope.forbidden_commands?.length) {
          constraints.push(`## FORBIDDEN COMMANDS (NEVER run)\n${scope.forbidden_commands.map(c => `- ${c}`).join('\n')}\n`);
        }

        if (scope.no_git_commit) constraints.push('## NO GIT COMMITS\n- Do NOT run git commit\n');
        if (scope.no_git_push) constraints.push('## NO GIT PUSH\n- Do NOT run git push\n');
        if (scope.no_install) constraints.push('## NO PACKAGE INSTALLS\n- Do NOT run npm/yarn/pip install\n');

        constraints.push(`---\n\n# TASK\n${params.task}`);

        const scopedPrompt = constraints.join('\n');

        const sessionId = await sessionManager.spawn(scopedPrompt, {
          model: params.model,
          background: false,
          timeout: (params.timeout || 300) * 1000,
        });

        const sessions = await sessionManager.waitFor([sessionId], (params.timeout || 300) * 1000);
        const session = sessions[0];

        const appliedConstraints = Object.keys(scope).filter(k => {
          const val = scope[k as keyof typeof scope];
          return Array.isArray(val) ? val.length > 0 : Boolean(val);
        });

        if (session.status === 'completed') {
          return {
            success: true,
            sessionId,
            output: session.result,
            constraints_applied: appliedConstraints,
          };
        } else {
          return {
            success: false,
            sessionId,
            error: session.error,
            constraints_applied: appliedConstraints,
          };
        }
      },
    });

    // save_seed tool for capturing insights
    api.registerTool({
      name: 'save_seed',
      description: 'Save a blog-worthy insight/lesson from the conversation',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title for the seed' },
          insight: { type: 'string', description: 'The valuable insight or lesson' },
          type: { 
            type: 'string', 
            enum: ['idea', 'mistake', 'solution', 'lesson', 'discovery'],
            description: 'Type of seed',
          },
          tags: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
        },
        required: ['title', 'insight'],
      },
      async execute(params: { title: string; insight: string; type?: string; tags?: string[] }) {
        const { saveSeed } = await import('../hooks/seed-harvester');
        
        saveSeed(
          params.title,
          params.insight,
          (params.type as any) || 'discovery',
          params.tags || []
        );

        return {
          success: true,
          message: `Seed saved: "${params.title}"`,
        };
      },
    });

    api.logger.info('✅ oh-my-moltbot loaded successfully');
  },
};

export default plugin;
