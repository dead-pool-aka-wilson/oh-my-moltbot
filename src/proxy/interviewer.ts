/**
 * Interviewer / Proxy Mode
 * 
 * The model acts as the user's proxy:
 * 1. Understands user's intent
 * 2. Explores concepts through conversation
 * 3. Clarifies architecture and requirements
 * 4. Generates refined prompts for agents
 * 
 * Different from oh-my-opencode: 
 * - More conversational, less directive
 * - Treats user as the authority
 * - Builds understanding iteratively
 */

export interface InterviewSession {
  id: string;
  originalRequest: string;
  understanding: Understanding;
  conversationHistory: Message[];
  refinedPrompts: RefinedPrompt[];
  status: 'exploring' | 'clarifying' | 'ready' | 'dispatched';
}

export interface Understanding {
  goal: string;
  concepts: string[];
  architecture?: string;
  constraints: string[];
  openQuestions: string[];
  confidence: number;  // 0-1
}

export interface Message {
  role: 'user' | 'proxy';
  content: string;
  timestamp: number;
}

export interface RefinedPrompt {
  taskId: string;
  title: string;
  prompt: string;
  category: string;
  reasoning: string;
  dependsOn?: string[];
}

export const PROXY_SYSTEM_PROMPT = `You are the user's proxy and thought partner. Your job is NOT to execute tasks yourself, but to:

## Your Role

1. **UNDERSTAND** - Deeply understand what the user actually wants (not assume)
2. **EXPLORE** - Discuss concepts, trade-offs, and approaches WITH the user
3. **CLARIFY** - Ask questions when anything is unclear
4. **REFINE** - Transform vague ideas into crystal-clear task specifications
5. **DISPATCH** - Generate proper prompts for execution agents

## How to Act

You represent the user. Think of yourself as their senior technical advisor who:
- Listens carefully before suggesting
- Asks clarifying questions
- Explores alternatives together
- Never rushes to implementation
- Treats the user as the decision-maker

## Conversation Flow

1. **Initial Understanding**
   - Restate what you understood
   - Identify any ambiguities
   - Ask 1-3 focused questions

2. **Exploration Phase**
   - Discuss architectural options
   - Explore trade-offs
   - Share relevant patterns/approaches
   - Let the user guide decisions

3. **Clarification Phase**
   - Summarize the agreed approach
   - List concrete tasks
   - Confirm understanding

4. **Prompt Generation**
   When ready (confidence > 0.8), generate refined prompts:
   
   \`\`\`
   REFINED_PROMPT:
   Task: [clear title]
   Category: [coding|review|explore|etc]
   Prompt: [detailed, unambiguous prompt for the executing agent]
   Reasoning: [why this task, why this approach]
   DependsOn: [task IDs if any]
   \`\`\`

## Key Principles

- **ASK, don't assume** - When in doubt, ask the user
- **EXPLORE together** - "What if we..." / "Have you considered..."
- **RESPECT user authority** - They make the decisions, you advise
- **BE HONEST** - If something is unclear, say so
- **ITERATE** - Better to refine 3x than execute wrong once

## Anti-Patterns (AVOID)

- Jumping to implementation without understanding
- Making decisions without consulting the user
- Generating vague prompts
- Ignoring user's constraints or preferences
- Being overly directive ("You should do X")

Remember: You're a proxy, not a boss. Explore WITH the user, not FOR them.
`;

export class Interviewer {
  private sessions: Map<string, InterviewSession> = new Map();

  /**
   * Start a new interview session
   */
  startSession(request: string): InterviewSession {
    const session: InterviewSession = {
      id: `int_${Date.now().toString(36)}`,
      originalRequest: request,
      understanding: {
        goal: '',
        concepts: [],
        constraints: [],
        openQuestions: [],
        confidence: 0,
      },
      conversationHistory: [
        { role: 'user', content: request, timestamp: Date.now() }
      ],
      refinedPrompts: [],
      status: 'exploring',
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Process user message and update understanding
   */
  addMessage(sessionId: string, role: 'user' | 'proxy', content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Update understanding from proxy analysis
   */
  updateUnderstanding(sessionId: string, update: Partial<Understanding>): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.understanding = { ...session.understanding, ...update };

    // Update status based on confidence
    if (session.understanding.confidence >= 0.8) {
      session.status = 'ready';
    } else if (session.understanding.openQuestions.length === 0) {
      session.status = 'clarifying';
    }
  }

  /**
   * Add refined prompts ready for dispatch
   */
  addRefinedPrompts(sessionId: string, prompts: RefinedPrompt[]): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.refinedPrompts.push(...prompts);
  }

  /**
   * Get session
   */
  getSession(sessionId: string): InterviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Build prompt for proxy model
   */
  buildProxyPrompt(session: InterviewSession): string {
    const history = session.conversationHistory
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    return `${PROXY_SYSTEM_PROMPT}

## Current Session

**Original Request:**
${session.originalRequest}

**Current Understanding:**
- Goal: ${session.understanding.goal || '[not yet clear]'}
- Concepts: ${session.understanding.concepts.join(', ') || '[none identified]'}
- Constraints: ${session.understanding.constraints.join(', ') || '[none identified]'}
- Open Questions: ${session.understanding.openQuestions.join(', ') || '[none]'}
- Confidence: ${Math.round(session.understanding.confidence * 100)}%

**Conversation So Far:**
${history}

---

Continue the conversation. If confidence is high enough, generate REFINED_PROMPT blocks.
`;
  }

  /**
   * Parse refined prompts from proxy response
   */
  parseRefinedPrompts(response: string): RefinedPrompt[] {
    const prompts: RefinedPrompt[] = [];
    const regex = /REFINED_PROMPT:\s*\n([\s\S]*?)(?=REFINED_PROMPT:|$)/g;
    
    let match;
    while ((match = regex.exec(response)) !== null) {
      const block = match[1];
      
      const taskMatch = block.match(/Task:\s*(.+)/);
      const categoryMatch = block.match(/Category:\s*(.+)/);
      const promptMatch = block.match(/Prompt:\s*([\s\S]*?)(?=Reasoning:|DependsOn:|$)/);
      const reasoningMatch = block.match(/Reasoning:\s*(.+)/);
      const dependsMatch = block.match(/DependsOn:\s*(.+)/);

      if (taskMatch && promptMatch) {
        prompts.push({
          taskId: `t_${Date.now().toString(36)}_${prompts.length}`,
          title: taskMatch[1].trim(),
          prompt: promptMatch[1].trim(),
          category: categoryMatch?.[1].trim() || 'coding',
          reasoning: reasoningMatch?.[1].trim() || '',
          dependsOn: dependsMatch?.[1].split(',').map(s => s.trim()),
        });
      }
    }

    return prompts;
  }

  /**
   * Check if session is ready for dispatch
   */
  isReadyForDispatch(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === 'ready' && session.refinedPrompts.length > 0;
  }

  /**
   * Mark session as dispatched
   */
  markDispatched(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'dispatched';
    }
  }
}

// Singleton
export const interviewer = new Interviewer();
