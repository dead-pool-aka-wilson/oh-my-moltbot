import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initCouncilDb } from '../db';
import { setDb, agentDb, memoryDb, generationDb } from '../storage/council-db';
import { GenerationManager } from './generation-manager';
import type { Agent, AgentDisposition } from '../types';

describe('GenerationManager', () => {
  let db: Database;
  let manager: GenerationManager;
  let testDisposition: AgentDisposition;
  let testAgent: Agent;

  beforeEach(() => {
    db = new Database(':memory:');
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

      CREATE TABLE IF NOT EXISTS generations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        generation_num INTEGER NOT NULL,
        seed_memories TEXT,
        disposition_snapshot TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retired_at INTEGER,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );
    `);
    setDb(db);
    manager = new GenerationManager();

    testDisposition = {
      orientation: 'pragmatic',
      filterCriteria: {
        keywords: ['efficiency', 'cost'],
        sentimentBias: 'neutral',
        noveltyPreference: 'low',
        riskTolerance: 'low',
      },
      priorities: {
        cost: 0.4,
        quality: 0.3,
        novelty: 0.1,
        reliability: 0.2,
      },
      voice: {
        tone: 'direct',
        vocabulary: ['practical', 'proven'],
      },
    };

    const stmt = db.prepare(
      'INSERT INTO councils (id, name, domain, description, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run('council_test', 'Test Council', 'lifestyle', 'Test', Date.now());

    testAgent = agentDb.insert({
      councilId: 'council_test',
      name: 'TestAgent',
      disposition: testDisposition,
      generation: 1,
      memoryCapacity: 100,
      memoryUsed: 0,
      isActive: true,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('shouldSpawnSuccessor', () => {
    it('returns true when agent is at memory capacity', () => {
      const agent = agentDb.insert({
        councilId: 'council_test',
        name: 'FullAgent',
        disposition: testDisposition,
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 100,
        isActive: true,
      });

      expect(manager.shouldSpawnSuccessor(agent)).toBe(true);
    });

    it('returns false when agent is below memory capacity', () => {
      const agent = agentDb.insert({
        councilId: 'council_test',
        name: 'PartialAgent',
        disposition: testDisposition,
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 50,
        isActive: true,
      });

      expect(manager.shouldSpawnSuccessor(agent)).toBe(false);
    });

    it('returns false when agent has no memories', () => {
      expect(manager.shouldSpawnSuccessor(testAgent)).toBe(false);
    });
  });

  describe('spawnSuccessor', () => {
    it('marks predecessor as inactive', async () => {
      // Add some memories to trigger succession
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: Math.random(),
          sourceType: 'debate',
        });
      }

      const updatedAgent = agentDb.getById(testAgent.id)!;
      updatedAgent.memoryUsed = 100;
      agentDb.update(testAgent.id, { memoryUsed: 100 });

      const event = await manager.spawnSuccessor(updatedAgent);

      const predecessor = agentDb.getById(event.predecessorId)!;
      expect(predecessor.isActive).toBe(false);
    });

    it('creates successor with incremented generation', async () => {
      // Add memories
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: Math.random(),
          sourceType: 'debate',
        });
      }

      agentDb.update(testAgent.id, { memoryUsed: 100 });
      const updatedAgent = agentDb.getById(testAgent.id)!;

      const event = await manager.spawnSuccessor(updatedAgent);
      const successor = agentDb.getById(event.successorId)!;

      expect(successor.generation).toBe(testAgent.generation + 1);
      expect(successor.generation).toBe(2);
    });

    it('copies seed memories (top 20%)', async () => {
      // Add 100 memories with varying scores
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: i / 100, // 0.0 to 0.99
          sourceType: 'debate',
        });
      }

      agentDb.update(testAgent.id, { memoryUsed: 100 });
      const updatedAgent = agentDb.getById(testAgent.id)!;

      const event = await manager.spawnSuccessor(updatedAgent);
      const successor = agentDb.getById(event.successorId)!;

      // Should have 20% of capacity = 20 memories
      expect(event.seedMemories.length).toBe(20);
      expect(successor.memoryUsed).toBe(20);

      // Verify seed memories were copied
      const successorMemories = memoryDb.getByAgent(successor.id);
      expect(successorMemories.length).toBe(20);

      // Verify they're marked as 'seed' source
      successorMemories.forEach((mem) => {
        expect(mem.sourceType).toBe('seed');
      });
    });

    it('preserves disposition in successor', async () => {
      // Add memories
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: Math.random(),
          sourceType: 'debate',
        });
      }

      agentDb.update(testAgent.id, { memoryUsed: 100 });
      const updatedAgent = agentDb.getById(testAgent.id)!;

      const event = await manager.spawnSuccessor(updatedAgent);
      const successor = agentDb.getById(event.successorId)!;

      expect(successor.disposition).toEqual(testDisposition);
      expect(event.inheritedDisposition).toEqual(testDisposition);
    });

    it('records generation event', async () => {
      // Add memories
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: Math.random(),
          sourceType: 'debate',
        });
      }

      agentDb.update(testAgent.id, { memoryUsed: 100 });
      const updatedAgent = agentDb.getById(testAgent.id)!;

      const event = await manager.spawnSuccessor(updatedAgent);

      const generations = generationDb.getByAgent(event.predecessorId);
      expect(generations.length).toBeGreaterThan(0);

      const latestGen = generations[0];
      expect(latestGen.generationNum).toBe(testAgent.generation);
      expect(latestGen.seedMemories).toEqual(event.seedMemories);
      expect(latestGen.dispositionSnapshot).toEqual(testDisposition);
    });

    it('sets predecessor reference on successor', async () => {
      // Add memories
      for (let i = 0; i < 100; i++) {
        memoryDb.insert({
          agentId: testAgent.id,
          content: `Memory ${i}`,
          dispositionScore: Math.random(),
          sourceType: 'debate',
        });
      }

      agentDb.update(testAgent.id, { memoryUsed: 100 });
      const updatedAgent = agentDb.getById(testAgent.id)!;

      const event = await manager.spawnSuccessor(updatedAgent);
      const successor = agentDb.getById(event.successorId)!;

      expect(successor.predecessorId).toBe(testAgent.id);
    });
  });

  describe('summonAncestor', () => {
    it('returns correct generation when found', async () => {
      // Create a lineage: Gen 1 -> Gen 2 -> Gen 3
      let currentAgent = testAgent;

      for (let gen = 2; gen <= 3; gen++) {
        // Add memories to current agent
        for (let i = 0; i < 100; i++) {
          memoryDb.insert({
            agentId: currentAgent.id,
            content: `Memory ${i}`,
            dispositionScore: Math.random(),
            sourceType: 'debate',
          });
        }

        agentDb.update(currentAgent.id, { memoryUsed: 100 });
        const updatedAgent = agentDb.getById(currentAgent.id)!;

        const event = await manager.spawnSuccessor(updatedAgent);
        currentAgent = agentDb.getById(event.successorId)!;
      }

      // Now summon generation 1 from generation 3
      const ancestor = await manager.summonAncestor(currentAgent.id, 1);
      expect(ancestor).not.toBeNull();
      expect(ancestor!.generation).toBe(1);
      expect(ancestor!.name).toBe('TestAgent');
    });

    it('returns null for non-existent generation', async () => {
      const ancestor = await manager.summonAncestor(testAgent.id, 5);
      expect(ancestor).toBeNull();
    });

    it('returns null when generation is higher than current', async () => {
      const ancestor = await manager.summonAncestor(testAgent.id, 0);
      expect(ancestor).toBeNull();
    });
  });

  describe('getLineage', () => {
    it('returns all generations oldest-first', async () => {
      // Create a lineage: Gen 1 -> Gen 2 -> Gen 3
      let currentAgent = testAgent;

      for (let gen = 2; gen <= 3; gen++) {
        // Add memories
        for (let i = 0; i < 100; i++) {
          memoryDb.insert({
            agentId: currentAgent.id,
            content: `Memory ${i}`,
            dispositionScore: Math.random(),
            sourceType: 'debate',
          });
        }

        agentDb.update(currentAgent.id, { memoryUsed: 100 });
        const updatedAgent = agentDb.getById(currentAgent.id)!;

        const event = await manager.spawnSuccessor(updatedAgent);
        currentAgent = agentDb.getById(event.successorId)!;
      }

      // Get lineage from generation 3
      const lineage = await manager.getLineage(currentAgent.id);

      expect(lineage.length).toBe(3);
      expect(lineage[0].generation).toBe(1);
      expect(lineage[1].generation).toBe(2);
      expect(lineage[2].generation).toBe(3);
    });

    it('returns single agent for generation 1', async () => {
      const lineage = await manager.getLineage(testAgent.id);

      expect(lineage.length).toBe(1);
      expect(lineage[0].generation).toBe(1);
      expect(lineage[0].id).toBe(testAgent.id);
    });
  });
});
