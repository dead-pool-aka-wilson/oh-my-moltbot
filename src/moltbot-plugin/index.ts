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
} from './types';

import { gateway } from '../gateway/ollama-gateway';
import { proxy } from '../proxy';
import { getUltraworkPrompt } from '../ultrawork/prompts';
import { harvester } from '../hooks/seed-harvester';
import { runCouncil, formatDebateResult, parseCouncilCommand, getCouncilStatus } from '../council';

// Plugin state
let ultraworkEnabled = false;
let proxySessionId: string | null = null;

/**
 * oh-my-moltbot Plugin Definition
 */
export const plugin: OpenClawPluginDefinition = {
  id: 'oh-my-moltbot',
  name: 'oh-my-moltbot',
  description: 'Multi-Model Orchestration with Ollama Gateway, Proxy Mode, and Ultrawork',
  version: '0.1.0',

  async register(api: OpenClawPluginApi) {
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

    // /gateway - Show gateway status
    api.registerCommand({
      name: 'gateway',
      description: 'Show Ollama gateway status and rate limits',
      handler: () => {
        const status = gateway.getStatus();
        const lines = ['🌐 **Gateway Status**\n'];
        
        for (const [name, info] of Object.entries(status)) {
          const avail = info.available ? '✅' : '❌';
          const limit = info.limit === Infinity ? '∞' : info.limit;
          lines.push(`${avail} **${name}**: ${info.used}/${limit} (resets: ${info.resetsIn}s)`);
        }
        
        return { text: lines.join('\n') };
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
            text: `🚀 **Dispatched ${result.sessionIds.length} tasks**\n\n${result.plan.waves.map((w: any) => 
              `Wave ${w.wave}: ${w.tasks.map((t: any) => t.title).join(', ')}`
            ).join('\n')}`,
          };
        } catch (error: any) {
          return { text: `❌ Dispatch failed: ${error.message}` };
        }
      },
    });

    // /council - Run agent council debate
    api.registerCommand({
      name: 'council',
      description: 'Ask the agent council for taste-based decisions',
      acceptsArgs: true,
      handler: async (ctx) => {
        if (!ctx.args) {
          return { 
            text: `🏛️ **Agent Council**

Usage: /council <your question>
       /council -c <council> <question>

Councils:
  • lifestyle - Food, fashion, places, purchases
  • creative  - Design, writing, branding, aesthetics  
  • direction - Career, relationships, values, life

Options:
  -c, --council <name>  Specify council explicitly
  -v, --verbose         Include detailed reasoning

Examples:
  /council Should I try the new ramen place?
  /council -c creative Which color palette for my portfolio?
  /council -c direction Should I accept this job offer?`
          };
        }

        try {
          const request = parseCouncilCommand(ctx.args);
          if (!request) {
            return { text: '❌ Invalid council command. Use /council for help.' };
          }

          const result = await runCouncil(request);
          return { text: formatDebateResult(result) };
        } catch (error: any) {
          return { text: `❌ Council debate failed: ${error.message}` };
        }
      },
    });

    // /council-status - Show council system status
    api.registerCommand({
      name: 'council-status',
      description: 'Show agent council system status',
      handler: () => {
        const status = getCouncilStatus();
        
        if (status.councils.length === 0) {
          return { text: '🏛️ **Council Status**\n\nNo councils initialized yet. Run /council to start.' };
        }

        const lines = ['🏛️ **Council Status**\n'];
        for (const council of status.councils) {
          lines.push(`**${council.name}** (${council.domain})`);
          lines.push(`  Agents: ${council.activeAgents}/${council.agentCount} active`);
        }
        lines.push(`\nTotal debates: ${status.totalDebates}`);
        
        return { text: lines.join('\n') };
      },
    });

    // ==========================================================================
    // Lifecycle Hooks
    // ==========================================================================

    // Inject ultrawork prompt when mode is enabled
    api.on('before_agent_start', async (
      event: PluginHookBeforeAgentStartEvent,
      ctx: PluginHookAgentContext
    ): Promise<PluginHookBeforeAgentStartResult | void> => {
      if (!ultraworkEnabled) return;

      api.logger.info('Injecting ultrawork system prompt');
      
      return {
        prependContext: getUltraworkPrompt(),
      };
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
          api.logger.debug(`Found ${seeds.length} potential seeds`);
          // Seeds are saved automatically
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
          reasoning: result.reasoning,
          checkedModels: result.checkedModels,
          fallbackUsed: result.fallbackUsed,
        };
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
      execute(params: { title: string; insight: string; type?: string; tags?: string[] }) {
        const { saveSeed } = require('../hooks/seed-harvester');
        
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
