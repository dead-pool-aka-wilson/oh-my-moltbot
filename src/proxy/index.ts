/**
 * Proxy Mode
 * 
 * Complete flow:
 * 1. User message → Gateway routes to model
 * 2. Model acts as user's proxy/interviewer
 * 3. Explore concepts, clarify requirements
 * 4. Generate refined prompts
 * 5. Dispatch to executing agents
 */

export { 
  Interviewer, 
  interviewer,
  PROXY_SYSTEM_PROMPT,
  type InterviewSession,
  type Understanding,
  type RefinedPrompt,
} from './interviewer';

export { ProxyOrchestrator, proxy } from './orchestrator';
