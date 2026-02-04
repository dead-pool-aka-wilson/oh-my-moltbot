import type {
  Agent,
  DebateSession,
  DebateResult,
  AgentPosition,
  AgentChallenge,
  DebatePhase,
  Memory,
} from '../types';
import { debateSessionDb, debateTurnDb } from '../storage/council-db';
import { MemoryManager as MemoryManagerClass } from '../memory/memory-manager';
import { vectorStore } from '../storage/vector-store';

export interface PositionPrompt {
  agent: Agent;
  userPrompt: string;
  relevantMemories: string[];
}

export interface ChallengePrompt {
  challenger: Agent;
  target: Agent;
  targetPosition: string;
}

export interface MemoryManager {
  getRelevantMemories(agentId: string, prompt: string, limit: number): Promise<Memory[]>;
}

export class DebateEngine {
  constructor(private memoryManager: MemoryManager) {}

  async runDebate(session: DebateSession, agents: Agent[]): Promise<DebateResult> {
    debateSessionDb.update(session.id, { phase: 'position' });

    const positions = await this.runPositionPhase(session, agents);

    debateSessionDb.update(session.id, { phase: 'challenge' });

    const challenges = await this.runChallengePhase(session, positions, agents);

    debateSessionDb.update(session.id, { phase: 'synthesis' });

    const synthesis = await this.runSynthesisPhase(session, positions, challenges);

    debateSessionDb.update(session.id, {
      phase: 'complete',
      synthesis,
      completedAt: Date.now(),
    });

    const confidence = this.calculateConfidence(positions);

    return {
      sessionId: session.id,
      council: 'lifestyle',
      phases: { positions, challenges, synthesis },
      recommendation: synthesis,
      confidence,
      memoriesCreated: 0,
    };
  }

  async runPositionPhase(session: DebateSession, agents: Agent[]): Promise<AgentPosition[]> {
    const positions: AgentPosition[] = [];

    for (const agent of agents) {
      const memories = await this.memoryManager.getRelevantMemories(agent.id, session.userPrompt, 3);

      const position = this.generatePosition(agent, session.userPrompt, memories.map((m) => m.content));

      debateTurnDb.insert({
        sessionId: session.id,
        agentId: agent.id,
        phase: 'position',
        content: position.position,
      });

      positions.push(position);
    }

    return positions;
  }

  generatePosition(agent: Agent, userPrompt: string, memories: string[]): AgentPosition {
    const { disposition } = agent;
    const { priorities, voice } = disposition;

    const keyPoints: string[] = [];

    if (priorities.cost > 0.3) {
      keyPoints.push('Consider the cost-value tradeoff');
    }
    if (priorities.quality > 0.3) {
      keyPoints.push('Quality should be the priority');
    }
    if (priorities.novelty > 0.3) {
      keyPoints.push('This is an opportunity to try something new');
    }
    if (priorities.reliability > 0.3) {
      keyPoints.push('Stick with what has worked before');
    }

    const position = `From my ${voice.tone} perspective on "${userPrompt}": ${keyPoints.join('. ')}.`;

    return {
      agentId: agent.id,
      agentName: agent.name,
      position,
      keyPoints,
      relevantMemories: memories,
    };
  }

  async runChallengePhase(
    session: DebateSession,
    positions: AgentPosition[],
    agents: Agent[]
  ): Promise<AgentChallenge[]> {
    const challenges: AgentChallenge[] = [];

    for (let i = 0; i < agents.length; i++) {
      const challenger = agents[i];
      const targetIdx = (i + 1) % agents.length;
      const target = agents[targetIdx];
      const targetPosition = positions[targetIdx];

      const challenge = this.generateChallenge(challenger, target, targetPosition);

      debateTurnDb.insert({
        sessionId: session.id,
        agentId: challenger.id,
        phase: 'challenge',
        content: challenge.challenge,
      });

      challenges.push(challenge);
    }

    return challenges;
  }

  generateChallenge(challenger: Agent, target: Agent, targetPosition: AgentPosition): AgentChallenge {
    const counterPoints: string[] = [];

    if (challenger.disposition.priorities.cost > target.disposition.priorities.cost) {
      counterPoints.push('You overlooked the cost implications');
    }
    if (challenger.disposition.priorities.quality > target.disposition.priorities.quality) {
      counterPoints.push('Quality concerns were not adequately addressed');
    }
    if (challenger.disposition.priorities.novelty > target.disposition.priorities.novelty) {
      counterPoints.push('You missed the opportunity for innovation');
    }
    if (challenger.disposition.priorities.reliability > target.disposition.priorities.reliability) {
      counterPoints.push('The reliability factor was underweighted');
    }

    const challenge =
      `As ${challenger.name}, I challenge ${target.name}: ${counterPoints.join('. ') || 'Your perspective needs more nuance'}.`;

    return {
      challengerId: challenger.id,
      challengerName: challenger.name,
      targetId: target.id,
      targetName: target.name,
      challenge,
      counterPoints,
    };
  }

  async runSynthesisPhase(
    session: DebateSession,
    positions: AgentPosition[],
    challenges: AgentChallenge[]
  ): Promise<string> {
    const consensusPoints = this.findConsensus(positions);
    const tensionPoints = this.findTensions(challenges);

    return `Based on the council's deliberation on "${session.userPrompt}":

RECOMMENDATION: ${consensusPoints.length > 0 ? consensusPoints.join(' ') : 'Consider all perspectives carefully.'}

CONSENSUS POINTS: ${consensusPoints.join('; ') || 'Limited consensus reached.'}

KEY TENSIONS: ${tensionPoints.join('; ') || 'No major disagreements.'}`;
  }

  findConsensus(positions: AgentPosition[]): string[] {
    const allPoints = positions.flatMap((p) => p.keyPoints);
    const pointCounts = new Map<string, number>();

    for (const point of allPoints) {
      pointCounts.set(point, (pointCounts.get(point) || 0) + 1);
    }

    return Array.from(pointCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([point]) => point);
  }

  findTensions(challenges: AgentChallenge[]): string[] {
    return challenges
      .filter((c) => c.counterPoints.length > 0)
      .map((c) => `${c.challengerName} vs ${c.targetName}: ${c.counterPoints[0]}`);
  }

  calculateConfidence(positions: AgentPosition[]): number {
    if (positions.length === 0) return 0;

    const allPoints = positions.flatMap((p) => p.keyPoints);
    const uniquePoints = new Set(allPoints);

    const overlapRatio = uniquePoints.size / allPoints.length;
    return Math.max(0, Math.min(1, 1 - overlapRatio + 0.3));
  }
}

export const debateEngine = new DebateEngine(new MemoryManagerClass(vectorStore));
