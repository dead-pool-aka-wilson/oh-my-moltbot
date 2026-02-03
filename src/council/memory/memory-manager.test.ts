import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initCouncilDb } from '../db';
import { setDb, memoryDb, agentDb, councilDb } from '../storage/council-db';
import { MemoryManager } from './memory-manager';
import type { Agent, Memory, AgentDisposition } from '../types';

// Mock vector store
const mockVectorStore = {
  addMemory: async (memoryId: string, agentId: string, content: string) => {
    return `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
  deleteMemory: async (embeddingId: string) => {
    // no-op
  },
  querySimilar: async (agentId: string, query: string, limit: number) => {
    // Return empty for now - tests don't rely on this
    return [];
  },
};

// Create test disposition
const testDisposition: AgentDisposition = {
  orientation: 'pragmatic',
  filterCriteria: {
    keywords: ['quality', 'reliable', 'proven'],
    sentimentBias: 'positive',
    noveltyPreference: 'balanced',
    riskTolerance: 'moderate',
  },
  priorities: {
    cost: 0.2,
    quality: 0.4,
    novelty: 0.2,
    reliability: 0.2,
  },
  voice: {
    tone: 'professional',
    vocabulary: ['excellent', 'robust', 'efficient'],
  },
};

describe('MemoryManager', () => {
  let db: Database;
  let manager: MemoryManager;
  let testAgent: Agent;

  beforeEach(() => {
    db = new Database(':memory:');
    setDb(db);

    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS councils (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        council_id TEXT NOT NULL,
        name TEXT NOT NULL,
        disposition TEXT NOT NULL,
        generation INTEGER DEFAULT 1,
        memory_capacity INTEGER DEFAULT 100,
        memory_used INTEGER DEFAULT 0,
        predecessor_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (council_id) REFERENCES councils(id),
        FOREIGN KEY (predecessor_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        disposition_score REAL NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        embedding_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );
    `);

    const testCouncil = councilDb.insert({
      name: 'Test Council',
      domain: 'lifestyle',
      description: 'Test',
    });

    testAgent = agentDb.insert({
      councilId: testCouncil.id,
      name: 'Test Agent',
      disposition: testDisposition,
      generation: 1,
      memoryCapacity: 3,
      memoryUsed: 0,
      isActive: true,
    });

    manager = new MemoryManager(mockVectorStore as any);
  });

  afterEach(() => {
    db.close();
  });

  describe('evaluateForStorage', () => {
    it('should calculate disposition score correctly', async () => {
      const content = 'This is a quality and reliable solution';
      const evaluation = await manager.evaluateForStorage(testAgent, content);

      expect(evaluation.dispositionScore).toBeGreaterThan(0);
      expect(evaluation.dispositionScore).toBeLessThanOrEqual(1);
      expect(evaluation.content).toBe(content);
    });

    it('should reject content below STORAGE_THRESHOLD', async () => {
      const content = 'xyz abc def'; // No matching keywords
      const evaluation = await manager.evaluateForStorage(testAgent, content);

      expect(evaluation.shouldStore).toBe(false);
      expect(evaluation.reasoning).toContain('below threshold');
    });

    it('should accept content above STORAGE_THRESHOLD', async () => {
      const content = 'This is a quality and reliable proven solution';
      const evaluation = await manager.evaluateForStorage(testAgent, content);

      expect(evaluation.shouldStore).toBe(true);
      expect(evaluation.reasoning).toContain('above threshold');
    });

    it('should identify displacement candidate when memory full', async () => {
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 0',
        dispositionScore: 0.3,
        sourceType: 'observation',
      });
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 1',
        dispositionScore: 0.5,
        sourceType: 'observation',
      });
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 2',
        dispositionScore: 0.55,
        sourceType: 'observation',
      });
      agentDb.update(testAgent.id, { memoryUsed: 3 });

      const updatedAgent = agentDb.getById(testAgent.id)!;
      const content = 'This is a quality and reliable proven solution';
      const evaluation = await manager.evaluateForStorage(updatedAgent, content);

      expect(evaluation.shouldStore).toBe(true);
      expect(evaluation.displacementCandidate).toBeDefined();
      expect(evaluation.reasoning).toContain('beats lowest memory');
    });

    it('should reject storage when full and new score does not beat existing', async () => {
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 0',
        dispositionScore: 0.55,
        sourceType: 'observation',
      });
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 1',
        dispositionScore: 0.6,
        sourceType: 'observation',
      });
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'Memory 2',
        dispositionScore: 0.65,
        sourceType: 'observation',
      });
      agentDb.update(testAgent.id, { memoryUsed: 3 });

      const updatedAgent = agentDb.getById(testAgent.id)!;
      const content = 'This is good';
      const evaluation = await manager.evaluateForStorage(updatedAgent, content);

      expect(evaluation.shouldStore).toBe(false);
      expect(evaluation.reasoning).toContain("doesn't beat existing");
    });
  });

  describe('storeMemory', () => {
    it('should store memory when above threshold and capacity available', async () => {
      const content = 'This is a quality and reliable solution';
      const result = await manager.storeMemory(testAgent.id, content, 'observation');

      expect(result.stored).toBe(true);
      expect(result.memory).toBeDefined();
      expect(result.memory?.content).toBe(content);
      expect(result.memory?.sourceType).toBe('observation');
      expect(result.displaced).toBeUndefined();
    });

    it('should reject memory when below threshold', async () => {
      const content = 'xyz abc def';
      const result = await manager.storeMemory(testAgent.id, content, 'observation');

      expect(result.stored).toBe(false);
      expect(result.reason).toContain('below threshold');
    });

    it('should displace lowest scoring memory when full', async () => {
      // Fill memory
      const memories: Memory[] = [];
      for (let i = 0; i < 3; i++) {
        const mem = memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: 0.3 + i * 0.1,
          sourceType: 'observation',
        });
        memories.push(mem);
      }
      agentDb.update(testAgent.id, { memoryUsed: 3 });

      // Store high-scoring content
      const content = 'This is a quality and reliable proven solution';
      const result = await manager.storeMemory(testAgent.id, content, 'debate');

      expect(result.stored).toBe(true);
      expect(result.displaced).toBeDefined();
      expect(result.displaced?.id).toBe(memories[0].id); // Lowest scoring
      expect(result.memory?.content).toBe(content);
    });

    it('should update agent memoryUsed count on store', async () => {
      const content = 'This is a quality and reliable solution';
      await manager.storeMemory(testAgent.id, content, 'observation');

      const updated = agentDb.getById(testAgent.id);
      expect(updated?.memoryUsed).toBe(1);
    });

    it('should keep memoryUsed same when displacing', async () => {
      // Fill memory
      for (let i = 0; i < 3; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: 0.3 + i * 0.1,
          sourceType: 'observation',
        });
      }
      agentDb.update(testAgent.id, { memoryUsed: 3 });

      const content = 'This is a quality and reliable proven solution';
      await manager.storeMemory(testAgent.id, content, 'debate');

      const updated = agentDb.getById(testAgent.id);
      expect(updated?.memoryUsed).toBe(3); // Still 3, not 4
    });

    it('should return error when agent not found', async () => {
      const result = await manager.storeMemory('nonexistent_agent', 'content', 'observation');

      expect(result.stored).toBe(false);
      expect(result.reason).toContain('Agent not found');
    });

    it('should include sourceRef when provided', async () => {
      const content = 'This is a quality and reliable solution';
      const result = await manager.storeMemory(
        testAgent.id,
        content,
        'debate',
        'session_123'
      );

      expect(result.stored).toBe(true);
      expect(result.memory?.sourceRef).toBe('session_123');
    });
  });

  describe('getRelevantMemories', () => {
    it('should return similar memories', async () => {
      // Store some memories
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'quality and reliable solution',
        dispositionScore: 0.7,
        sourceType: 'observation',
      });
      memoryDb.insert({
        agentId: testAgent.id,
        content: 'proven approach',
        dispositionScore: 0.6,
        sourceType: 'observation',
      });

      // Mock vector store to return results
      const mockVS = {
        ...mockVectorStore,
        querySimilar: async (agentId: string, query: string, limit: number) => {
          const memories = memoryDb.getByAgent(agentId);
          return memories.slice(0, limit).map((m) => ({
            memoryId: m.id,
            similarity: 0.8,
          }));
        },
      };

      const managerWithMock = new MemoryManager(mockVS as any);
      const memories = await managerWithMock.getRelevantMemories(testAgent.id, 'quality', 5);

      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].agentId).toBe(testAgent.id);
    });

    it('should respect limit parameter', async () => {
      // Store multiple memories
      for (let i = 0; i < 5; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: 0.5,
          sourceType: 'observation',
        });
      }

      // Mock vector store
      const mockVS = {
        ...mockVectorStore,
        querySimilar: async (agentId: string, query: string, limit: number) => {
          const memories = memoryDb.getByAgent(agentId);
          return memories.slice(0, limit).map((m) => ({
            memoryId: m.id,
            similarity: 0.8,
          }));
        },
      };

      const managerWithMock = new MemoryManager(mockVS as any);
      const memories = await managerWithMock.getRelevantMemories(testAgent.id, 'query', 2);

      expect(memories.length).toBeLessThanOrEqual(2);
    });
  });

  describe('shouldSpawnSuccessor', () => {
    it('should return true when at capacity', () => {
      const fullAgent = { ...testAgent, memoryUsed: 3, memoryCapacity: 3 };
      expect(manager.shouldSpawnSuccessor(fullAgent)).toBe(true);
    });

    it('should return false when below capacity', () => {
      const partialAgent = { ...testAgent, memoryUsed: 2, memoryCapacity: 3 };
      expect(manager.shouldSpawnSuccessor(partialAgent)).toBe(false);
    });

    it('should return false when empty', () => {
      const emptyAgent = { ...testAgent, memoryUsed: 0, memoryCapacity: 3 };
      expect(manager.shouldSpawnSuccessor(emptyAgent)).toBe(false);
    });
  });
});
