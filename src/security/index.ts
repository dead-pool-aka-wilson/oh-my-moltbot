/**
 * Security Module - Secure action execution layer
 * 
 * Provides the bridge between AI orchestration and real-world actions.
 * All actions go through policy checking, approval flow, and audit logging.
 */

export {
  SecurityBridge,
  securityBridge,
  ping,
  listActions,
  performAction,
  killSwitch,
  type ActionRequest,
  type ActionResponse,
  type ExecutorStatus,
  type AvailableAction,
} from './bridge';

export {
  allTools,
  toolsByName,
  executeTool,
  getToolDefinitions,
  type Tool,
  type ToolResult,
  // Individual tools
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
} from './tools';
