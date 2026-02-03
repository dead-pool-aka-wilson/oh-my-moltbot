/**
 * Moltbot Tools - Actions available to the AI orchestrator
 * 
 * These tools connect the AI's intent to real-world actions via the security layer.
 * Each tool goes through policy checking, approval flow, and audit logging.
 */

import { securityBridge, ActionResponse } from './bridge';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  pendingApproval?: {
    approvalId: string;
    message: string;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

/**
 * Convert ActionResponse to ToolResult
 */
function toToolResult(response: ActionResponse): ToolResult {
  if (response.status === 'success') {
    return { success: true, data: response.result };
  }
  
  if (response.status === 'pending_approval') {
    return {
      success: false,
      pendingApproval: {
        approvalId: response.approvalId!,
        message: response.message || 'Awaiting human approval',
      },
    };
  }
  
  return {
    success: false,
    error: response.error || response.message || 'Action failed',
  };
}

// ============================================
// Email Tools
// ============================================

export const readEmail: Tool = {
  name: 'read_email',
  description: 'Read emails from the inbox. Does not require approval.',
  parameters: {
    folder: { type: 'string', description: 'Folder to read from (default: INBOX)' },
    limit: { type: 'number', description: 'Maximum number of emails to return (default: 10)' },
    query: { type: 'string', description: 'Search query to filter emails' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('read_email', params);
    return toToolResult(response);
  },
};

export const sendEmail: Tool = {
  name: 'send_email',
  description: 'Send an email. REQUIRES HUMAN APPROVAL before sending.',
  parameters: {
    to: { type: 'string', description: 'Recipient email address', required: true },
    subject: { type: 'string', description: 'Email subject', required: true },
    body: { type: 'string', description: 'Email body content', required: true },
    cc: { type: 'string', description: 'CC recipients (comma-separated)' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('send_email', params);
    return toToolResult(response);
  },
};

// ============================================
// Telegram Tools
// ============================================

export const readTelegram: Tool = {
  name: 'read_telegram',
  description: 'Read Telegram messages. Does not require approval.',
  parameters: {
    chat_id: { type: 'number', description: 'Chat ID to read from' },
    limit: { type: 'number', description: 'Maximum number of messages (default: 10)' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('read_telegram', params);
    return toToolResult(response);
  },
};

export const sendTelegram: Tool = {
  name: 'send_telegram',
  description: 'Send a Telegram message. REQUIRES HUMAN APPROVAL.',
  parameters: {
    chat_id: { type: 'number', description: 'Chat ID to send to', required: true },
    text: { type: 'string', description: 'Message text', required: true },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('send_telegram', params);
    return toToolResult(response);
  },
};

// ============================================
// Slack Tools
// ============================================

export const readSlack: Tool = {
  name: 'read_slack',
  description: 'Read Slack messages from a channel. Does not require approval.',
  parameters: {
    channel: { type: 'string', description: 'Channel ID or name', required: true },
    limit: { type: 'number', description: 'Maximum number of messages (default: 10)' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('read_slack', params);
    return toToolResult(response);
  },
};

export const sendSlack: Tool = {
  name: 'send_slack',
  description: 'Send a Slack message. REQUIRES HUMAN APPROVAL.',
  parameters: {
    channel: { type: 'string', description: 'Channel ID or name', required: true },
    text: { type: 'string', description: 'Message text', required: true },
    thread_ts: { type: 'string', description: 'Thread timestamp for replies' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('send_slack', params);
    return toToolResult(response);
  },
};

// ============================================
// Phone Tools
// ============================================

export const makeCall: Tool = {
  name: 'make_call',
  description: 'Make a phone call via Twilio. REQUIRES HUMAN APPROVAL.',
  parameters: {
    to: { type: 'string', description: 'Phone number to call (E.164 format)', required: true },
    message: { type: 'string', description: 'Message to speak (TwiML or text)' },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('make_call', {
      to: params.to,
      twiml: params.message ? `<Response><Say>${params.message}</Say></Response>` : undefined,
    });
    return toToolResult(response);
  },
};

export const sendSms: Tool = {
  name: 'send_sms',
  description: 'Send an SMS message. REQUIRES HUMAN APPROVAL.',
  parameters: {
    to: { type: 'string', description: 'Phone number (E.164 format)', required: true },
    body: { type: 'string', description: 'SMS message text', required: true },
  },
  execute: async (params) => {
    const response = await securityBridge.performAction('send_sms', params);
    return toToolResult(response);
  },
};

// ============================================
// System Tools
// ============================================

export const getSystemStatus: Tool = {
  name: 'get_system_status',
  description: 'Get the status of the security system (kill switch, pending approvals)',
  parameters: {},
  execute: async () => {
    try {
      const status = await securityBridge.getStatus();
      return { success: true, data: status };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

export const listAvailableActions: Tool = {
  name: 'list_available_actions',
  description: 'List all actions available and their approval requirements',
  parameters: {},
  execute: async () => {
    try {
      const actions = await securityBridge.listActions();
      return { success: true, data: actions };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

// ============================================
// Tool Registry
// ============================================

export const allTools: Tool[] = [
  readEmail,
  sendEmail,
  readTelegram,
  sendTelegram,
  readSlack,
  sendSlack,
  makeCall,
  sendSms,
  getSystemStatus,
  listAvailableActions,
];

export const toolsByName: Record<string, Tool> = Object.fromEntries(
  allTools.map(t => [t.name, t])
);

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, params: Record<string, any> = {}): Promise<ToolResult> {
  const tool = toolsByName[name];
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  
  // Validate required parameters
  for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
    if (paramDef.required && !(paramName in params)) {
      return { success: false, error: `Missing required parameter: ${paramName}` };
    }
  }
  
  return tool.execute(params);
}

/**
 * Get tool definitions in OpenAI/Anthropic function calling format
 */
export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}> {
  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([name, def]) => [
          name,
          { type: def.type, description: def.description },
        ])
      ),
      required: Object.entries(tool.parameters)
        .filter(([, def]) => def.required)
        .map(([name]) => name),
    },
  }));
}
