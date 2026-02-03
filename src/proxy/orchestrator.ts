/**
 * Proxy Orchestrator
 * 
 * Manages the complete flow:
 * User → Gateway → Proxy Model → Interview → Refined Prompts → Agents
 */

import { gateway } from '../gateway/ollama-gateway';
import { Interviewer, interviewer, PROXY_SYSTEM_PROMPT } from './interviewer';
import { sessionManager } from '../ultrawork/session-manager';
import { planner } from '../ultrawork/planner';
import type { RefinedPrompt, InterviewSession } from './interviewer';
import type { Task } from '../ultrawork/planner';

export interface ProxyConfig {
  maxTurns: number;         // Max conversation turns before forcing decision
  minConfidence: number;    // Min confidence to proceed (0-1)
  autoDispatch: boolean;    // Auto-dispatch when ready
}

const DEFAULT_CONFIG: ProxyConfig = {
  maxTurns: 10,
  minConfidence: 0.8,
  autoDispatch: false,
};

export class ProxyOrchestrator {
  private config: ProxyConfig;
  private interviewer: Interviewer;

  constructor(config?: Partial<ProxyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.interviewer = new Interviewer();
  }

  /**
   * Start a new proxy session
   */
  async start(userRequest: string): Promise<{
    sessionId: string;
    proxyResponse: string;
    routedTo: string;
  }> {
    // 1. Create interview session
    const session = this.interviewer.startSession(userRequest);
    
    // 2. Route through gateway to get the model
    const routing = await gateway.process(userRequest);
    
    console.log(`\n🎭 Proxy Session Started: ${session.id}`);
    console.log(`   Routed to: ${routing.model}`);
    console.log(`   Reasoning: ${routing.routing.reasoning}`);
    
    // 3. Build proxy prompt
    const proxyPrompt = this.interviewer.buildProxyPrompt(session);
    
    // 4. Get initial response from proxy model
    // For now, return the prompt - in production, this would call the model
    const initialResponse = await this.callProxyModel(routing.model, proxyPrompt);
    
    // 5. Parse any refined prompts from the response
    const refinedPrompts = this.interviewer.parseRefinedPrompts(initialResponse);
    if (refinedPrompts.length > 0) {
      this.interviewer.addRefinedPrompts(session.id, refinedPrompts);
    }
    
    // 6. Add proxy response to history
    this.interviewer.addMessage(session.id, 'proxy', initialResponse);
    
    return {
      sessionId: session.id,
      proxyResponse: initialResponse,
      routedTo: routing.model,
    };
  }

  /**
   * Continue conversation with proxy
   */
  async continue(sessionId: string, userMessage: string): Promise<{
    proxyResponse: string;
    isReady: boolean;
    refinedPrompts?: RefinedPrompt[];
  }> {
    const session = this.interviewer.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    // Add user message
    this.interviewer.addMessage(sessionId, 'user', userMessage);
    
    // Build updated prompt
    const proxyPrompt = this.interviewer.buildProxyPrompt(session);
    
    // Get proxy response (route through gateway again for freshness)
    const routing = await gateway.process(userMessage);
    const proxyResponse = await this.callProxyModel(routing.model, proxyPrompt);
    
    // Parse refined prompts
    const refinedPrompts = this.interviewer.parseRefinedPrompts(proxyResponse);
    if (refinedPrompts.length > 0) {
      this.interviewer.addRefinedPrompts(sessionId, refinedPrompts);
    }
    
    // Add to history
    this.interviewer.addMessage(sessionId, 'proxy', proxyResponse);
    
    // Check if ready
    const isReady = this.interviewer.isReadyForDispatch(sessionId);
    
    // Auto-dispatch if configured
    if (isReady && this.config.autoDispatch) {
      await this.dispatch(sessionId);
    }
    
    return {
      proxyResponse,
      isReady,
      refinedPrompts: isReady ? session.refinedPrompts : undefined,
    };
  }

  /**
   * Force generation of refined prompts
   */
  async finalize(sessionId: string): Promise<RefinedPrompt[]> {
    const session = this.interviewer.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    // Build finalization prompt
    const prompt = `${this.interviewer.buildProxyPrompt(session)}

---

**IMPORTANT**: The user wants to proceed now. Generate REFINED_PROMPT blocks for all identified tasks, even if confidence is not 100%. Do your best with the information available.

Generate at least one REFINED_PROMPT block.`;

    const routing = await gateway.process("finalize prompts");
    const response = await this.callProxyModel(routing.model, prompt);
    
    const refinedPrompts = this.interviewer.parseRefinedPrompts(response);
    this.interviewer.addRefinedPrompts(sessionId, refinedPrompts);
    
    return session.refinedPrompts;
  }

  /**
   * Dispatch refined prompts to executing agents
   */
  async dispatch(sessionId: string): Promise<{
    plan: any;
    sessionIds: string[];
  }> {
    const session = this.interviewer.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    if (session.refinedPrompts.length === 0) {
      throw new Error('No refined prompts to dispatch. Call finalize() first.');
    }
    
    console.log(`\n🚀 Dispatching ${session.refinedPrompts.length} tasks from session ${sessionId}`);
    
    // Convert refined prompts to tasks
    const tasks: Task[] = session.refinedPrompts.map(rp => ({
      id: rp.taskId,
      title: rp.title,
      prompt: rp.prompt,
      category: rp.category,
      dependsOn: rp.dependsOn,
    }));
    
    // Create execution plan
    const plan = planner.createPlan(tasks);
    console.log(planner.formatPlan(plan));
    
    // Spawn sessions for wave 1 (no dependencies)
    const wave1Tasks = plan.waves[0]?.tasks || [];
    const sessionIds = await sessionManager.spawnMany(
      wave1Tasks.map(task => ({
        prompt: task.prompt,
        options: {
          category: task.category,
          background: true,
        },
      }))
    );
    
    // Mark session as dispatched
    this.interviewer.markDispatched(sessionId);
    
    return { plan, sessionIds };
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): InterviewSession | undefined {
    return this.interviewer.getSession(sessionId);
  }

  /**
   * Call the proxy model (via shell for now)
   */
  private async callProxyModel(model: string, prompt: string): Promise<string> {
    // For local Ollama models
    if (model.startsWith('ollama/') || model.includes('qwen')) {
      const ollamaModel = model.replace('ollama/', '');
      try {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel.includes('/') ? 'qwen2.5:14b' : ollamaModel,
            prompt,
            stream: false,
          }),
        });
        const data = await response.json();
        return data.response || 'No response from Ollama';
      } catch (e) {
        console.error('Ollama call failed:', e);
        return 'Ollama call failed';
      }
    }

    // For external models, use opencode
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').slice(0, 10000);
    
    try {
      const { stdout } = await execAsync(
        `opencode run -m "${model}" "${escapedPrompt}"`,
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout;
    } catch (e: any) {
      console.error('Model call failed:', e.message);
      return `Model call failed: ${e.message}`;
    }
  }
}

// Singleton
export const proxy = new ProxyOrchestrator();
