import type { Agent, Memory, MemorySourceType, MemoryEvaluation, VectorStore } from '../types';
import { memoryDb, agentDb } from '../storage/council-db';
import { scoreAgainstDisposition } from '../scoring/disposition-scorer';

const STORAGE_THRESHOLD = 0.4;

export interface StoreResult {
  stored: boolean;
  memory?: Memory;
  displaced?: Memory;
  reason: string;
}

export class MemoryManager {
  constructor(private vectorStore: VectorStore) {}

  async evaluateForStorage(agent: Agent, content: string): Promise<MemoryEvaluation> {
    const dispositionScore = scoreAgainstDisposition(content, agent.disposition);
    const shouldStore = dispositionScore >= STORAGE_THRESHOLD;

    let displacementCandidate: string | undefined;
    let reasoning: string;

    if (!shouldStore) {
      reasoning = `Score ${dispositionScore.toFixed(2)} below threshold ${STORAGE_THRESHOLD}`;
    } else if (agent.memoryUsed >= agent.memoryCapacity) {
      const lowest = memoryDb.getLowestScoring(agent.id);
      if (lowest && lowest.dispositionScore < dispositionScore) {
        displacementCandidate = lowest.id;
        reasoning = `Score ${dispositionScore.toFixed(2)} beats lowest memory ${lowest.dispositionScore.toFixed(2)}`;
      } else {
        reasoning = `Memory full and new score doesn't beat existing memories`;
      }
    } else {
      reasoning = `Score ${dispositionScore.toFixed(2)} above threshold, capacity available`;
    }

    return {
      content,
      dispositionScore,
      shouldStore: shouldStore && (agent.memoryUsed < agent.memoryCapacity || !!displacementCandidate),
      displacementCandidate,
      reasoning,
    };
  }

  async storeMemory(
    agentId: string,
    content: string,
    sourceType: MemorySourceType,
    sourceRef?: string
  ): Promise<StoreResult> {
    const agent = agentDb.getById(agentId);
    if (!agent) {
      return { stored: false, reason: 'Agent not found' };
    }

    const evaluation = await this.evaluateForStorage(agent, content);

    if (!evaluation.shouldStore) {
      return { stored: false, reason: evaluation.reasoning };
    }

    let displaced: Memory | undefined;

    if (evaluation.displacementCandidate) {
      const toDisplace = memoryDb.getById(evaluation.displacementCandidate);
      if (toDisplace) {
        if (toDisplace.embeddingId) {
          await this.vectorStore.deleteMemory(toDisplace.embeddingId);
        }
        memoryDb.delete(toDisplace.id);
        displaced = toDisplace;
      }
    }

    const embeddingId = await this.vectorStore.addMemory(agentId, agentId, content);

    const memory = memoryDb.insert({
      agentId,
      content,
      dispositionScore: evaluation.dispositionScore,
      sourceType,
      sourceRef,
      embeddingId,
    });

    const newCount = displaced ? agent.memoryUsed : agent.memoryUsed + 1;
    agentDb.update(agentId, { memoryUsed: newCount });

    return {
      stored: true,
      memory,
      displaced,
      reason: evaluation.reasoning,
    };
  }

  async getRelevantMemories(agentId: string, prompt: string, limit: number = 5): Promise<Memory[]> {
    const similar = await this.vectorStore.querySimilar(agentId, prompt, limit);

    const memories: Memory[] = [];
    for (const result of similar) {
      const memory = memoryDb.getById(result.memoryId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  shouldSpawnSuccessor(agent: Agent): boolean {
    return agent.memoryUsed >= agent.memoryCapacity;
  }
}
