/**
 * Moltbot Plugin Types
 * 
 * These types mirror the Moltbot plugin SDK types.
 * In production, import from moltbot directly.
 */

export type PluginLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type PluginCommandContext = {
  senderId?: string;
  channel: string;
  isAuthorizedSender: boolean;
  args?: string;
  commandBody: string;
  config: any;
};

export type PluginCommandResult = {
  text?: string;
  media?: string;
  error?: string;
};

export type PluginCommandHandler = (
  ctx: PluginCommandContext,
) => PluginCommandResult | Promise<PluginCommandResult>;

export type OpenClawPluginCommandDefinition = {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler: PluginCommandHandler;
};

export type PluginHookAgentContext = {
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  messageProvider?: string;
};

export type PluginHookBeforeAgentStartEvent = {
  prompt: string;
  messages?: unknown[];
};

export type PluginHookBeforeAgentStartResult = {
  systemPrompt?: string;
  prependContext?: string;
};

export type PluginHookMessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

export type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

export type AnyAgentTool = {
  name: string;
  description: string;
  parameters?: any;
  execute: (params: any) => any | Promise<any>;
};

export type PluginHookName =
  | 'before_agent_start'
  | 'agent_end'
  | 'before_compaction'
  | 'after_compaction'
  | 'message_received'
  | 'message_sending'
  | 'message_sent'
  | 'before_tool_call'
  | 'after_tool_call'
  | 'session_start'
  | 'session_end'
  | 'gateway_start'
  | 'gateway_stop'
  | 'before_model_select';

// =============================================================================
// before_model_select hook types
// =============================================================================

/**
 * Event passed to before_model_select hook handlers.
 * Allows plugins to override model selection before the agent starts.
 */
export type PluginHookBeforeModelSelectEvent = {
  /** Current provider (e.g., "anthropic", "google") */
  provider: string;
  /** Current model (e.g., "claude-sonnet-4-5") */
  model: string;
  /** Session key for context */
  sessionKey?: string;
  /** Set of allowed model keys (format: "provider/model") */
  allowedModelKeys: Set<string>;
  /** The user's prompt for classification */
  prompt?: string;
};

/**
 * Result from before_model_select hook handlers.
 * Return both provider and model to override selection.
 * Partial returns are ignored (must provide both for cross-provider changes).
 */
export type PluginHookBeforeModelSelectResult = {
  /** New provider to use */
  provider?: string;
  /** New model to use */
  model?: string;
};

export type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: any;
  pluginConfig?: Record<string, unknown>;
  runtime: any;
  logger: PluginLogger;
  registerTool: (tool: AnyAgentTool, opts?: any) => void;
  registerHook: (events: string | string[], handler: any, opts?: any) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  on: <K extends PluginHookName>(hookName: K, handler: any, opts?: { priority?: number }) => void;
};

export type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  configSchema?: any;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
};
