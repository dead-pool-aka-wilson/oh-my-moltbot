/**
 * SecurityBridge - TypeScript client for Zone 1 Executor
 * 
 * Connects the AI orchestration layer to the secure execution environment.
 * All actions requiring real-world effects (email, messages, calls) go through here.
 */

import * as net from 'net';

export interface ActionRequest {
  action: string;
  params: Record<string, any>;
  requestId?: string;
}

export interface ActionResponse {
  status: 'approved' | 'pending_approval' | 'denied' | 'error' | 'success';
  requestId?: string;
  approvalId?: string;
  message?: string;
  error?: string;
  result?: Record<string, any>;
}

export interface ExecutorStatus {
  running: boolean;
  killSwitch: {
    active: boolean;
    killed: boolean;
    killEvent: any | null;
  };
  pendingApprovals: number;
}

export interface AvailableAction {
  name: string;
  requiresApproval: string;
  rateLimit: string;
  description: string;
}

const EXECUTOR_HOST = process.env.OPENCLAW_EXECUTOR_HOST || process.env.MOLTBOT_EXECUTOR_HOST || '127.0.0.1';
const EXECUTOR_PORT = parseInt(process.env.OPENCLAW_EXECUTOR_PORT || process.env.MOLTBOT_EXECUTOR_PORT || '9999', 10);
const DEFAULT_TIMEOUT = 30000;

export class SecurityBridge {
  private host: string;
  private port: number;
  private timeout: number;

  constructor(options?: { host?: string; port?: number; timeout?: number }) {
    this.host = options?.host || EXECUTOR_HOST;
    this.port = options?.port || EXECUTOR_PORT;
    this.timeout = options?.timeout || DEFAULT_TIMEOUT;
  }

  private async send<T>(message: Record<string, any>): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let data = '';
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, this.timeout);

      socket.connect(this.port, this.host, () => {
        socket.write(JSON.stringify(message) + '\n');
      });

      socket.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          clearTimeout(timer);
          try {
            const response = JSON.parse(data.trim());
            resolved = true;
            resolve(response as T);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
          cleanup();
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(`Connection error: ${err.message}`));
      });

      socket.on('close', () => {
        clearTimeout(timer);
        if (!resolved) {
          reject(new Error('Connection closed unexpectedly'));
        }
      });
    });
  }

  /**
   * Check if the executor is running and responsive
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.send<{ type: string }>({ type: 'ping' });
      return response.type === 'pong';
    } catch {
      return false;
    }
  }

  /**
   * Get executor status including kill switch state
   */
  async getStatus(): Promise<ExecutorStatus> {
    const response = await this.send<any>({ type: 'status' });
    return {
      running: response.running,
      killSwitch: response.kill_switch,
      pendingApprovals: response.pending_approvals,
    };
  }

  /**
   * List all available actions and their requirements
   */
  async listActions(): Promise<AvailableAction[]> {
    const response = await this.send<{ actions: Record<string, any> }>({ type: 'list_actions' });
    return Object.entries(response.actions).map(([name, info]) => ({
      name,
      requiresApproval: info.requires_approval,
      rateLimit: info.rate_limit,
      description: info.description,
    }));
  }

  /**
   * Request permission to perform an action
   * Returns approval status - may require human approval
   */
  async requestAction(action: string, params: Record<string, any> = {}): Promise<ActionResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const response = await this.send<any>({
      type: 'capability_request',
      action,
      params,
      request_id: requestId,
    });

    return {
      status: response.status,
      requestId: response.request_id,
      approvalId: response.approval_id,
      message: response.message,
      error: response.error,
    };
  }

  /**
   * Execute an approved action
   */
  async executeAction(
    action: string,
    params: Record<string, any> = {},
    approvalId?: string
  ): Promise<ActionResponse> {
    const response = await this.send<any>({
      type: 'capability_execute',
      action,
      params,
      approval_id: approvalId,
    });

    return {
      status: response.status === 'success' ? 'success' : 'error',
      message: response.message,
      error: response.status === 'error' ? response.message : undefined,
      result: response.result,
    };
  }

  /**
   * Convenience method: Request and execute in one call
   * Only works for actions that don't require approval
   */
  async performAction(action: string, params: Record<string, any> = {}): Promise<ActionResponse> {
    const request = await this.requestAction(action, params);

    if (request.status === 'denied') {
      return request;
    }

    if (request.status === 'pending_approval') {
      return {
        status: 'pending_approval',
        approvalId: request.approvalId,
        message: `Action '${action}' requires human approval. Approval ID: ${request.approvalId}`,
      };
    }

    if (request.status === 'approved') {
      return this.executeAction(action, params);
    }

    return request;
  }

  /**
   * Trigger the kill switch (emergency stop)
   */
  async triggerKillSwitch(reason: string = 'manual', triggeredBy: string = 'user'): Promise<void> {
    await this.send({
      type: 'kill',
      reason,
      details: `Kill switch triggered: ${reason}`,
      triggered_by: triggeredBy,
    });
  }

  /**
   * Send sanitized content from Zone 3
   */
  async sendSanitizedContent(
    source: string,
    content: Record<string, any>,
    injectionDetected: boolean = false
  ): Promise<void> {
    await this.send({
      type: 'content_sanitized',
      source,
      content,
      injection_detected: injectionDetected,
    });
  }
}

// Singleton instance
export const securityBridge = new SecurityBridge();

// Convenience exports
export async function ping(): Promise<boolean> {
  return securityBridge.ping();
}

export async function listActions(): Promise<AvailableAction[]> {
  return securityBridge.listActions();
}

export async function performAction(
  action: string,
  params: Record<string, any> = {}
): Promise<ActionResponse> {
  return securityBridge.performAction(action, params);
}

export async function killSwitch(reason?: string): Promise<void> {
  return securityBridge.triggerKillSwitch(reason);
}
