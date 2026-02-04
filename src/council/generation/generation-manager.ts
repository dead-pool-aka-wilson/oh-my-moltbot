import type { Agent, Generation, Memory, SuccessionEvent, AgentDisposition } from '../types';
import { agentDb, memoryDb, generationDb } from '../storage/council-db';

const SEED_MEMORY_PERCENTAGE = 0.2;

export class GenerationManager {
  shouldSpawnSuccessor(agent: Agent): boolean {
    return agent.memoryUsed >= agent.memoryCapacity;
  }

  async spawnSuccessor(agent: Agent): Promise<SuccessionEvent> {
    agentDb.update(agent.id, { isActive: false });

    const seedCount = Math.ceil(agent.memoryCapacity * SEED_MEMORY_PERCENTAGE);
    const topMemories = memoryDb.getTopByScore(agent.id, seedCount);

    const successor = agentDb.insert({
      councilId: agent.councilId,
      name: agent.name,
      disposition: agent.disposition,
      generation: agent.generation + 1,
      memoryCapacity: agent.memoryCapacity,
      memoryUsed: topMemories.length,
      predecessorId: agent.id,
      isActive: true,
    });

    for (const memory of topMemories) {
      memoryDb.insert({
        agentId: successor.id,
        content: memory.content,
        dispositionScore: memory.dispositionScore,
        sourceType: 'seed',
        sourceRef: memory.id,
      });
    }

    generationDb.insert({
      agentId: agent.id,
      generationNum: agent.generation,
      seedMemories: topMemories.map((m) => m.id),
      dispositionSnapshot: agent.disposition,
    });

    return {
      predecessorId: agent.id,
      successorId: successor.id,
      generationNum: successor.generation,
      seedMemories: topMemories.map((m) => m.id),
      inheritedDisposition: agent.disposition,
    };
  }

  async summonAncestor(currentAgentId: string, generationNum: number): Promise<Agent | null> {
    let agent = agentDb.getById(currentAgentId);

    while (agent && agent.generation > generationNum) {
      if (!agent.predecessorId) return null;
      agent = agentDb.getById(agent.predecessorId);
    }

    if (agent && agent.generation === generationNum) {
      return agent;
    }

    return null;
  }

  async getLineage(agentId: string): Promise<Agent[]> {
    const lineage: Agent[] = [];
    let agent = agentDb.getById(agentId);

    while (agent) {
      lineage.push(agent);
      if (!agent.predecessorId) break;
      agent = agentDb.getById(agent.predecessorId);
    }

    return lineage.reverse();
  }
}

export const generationManager = new GenerationManager();
