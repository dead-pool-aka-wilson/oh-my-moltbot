import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type {
  Agent,
  DebateSession,
  AgentPosition,
  AgentChallenge,
  AgentDisposition,
} from '../types';
import { DebateEngine } from './debate-engine';
import { debateSessionDb, debateTurnDb, agentDb } from '../storage/council-db';
import { setDb } from '../storage/council-db';
import { Database } from 'bun:sqlite';

// Mock memory manager
const mockMemoryManager = {
  getRelevantMemories: async () => [
    { id: 'mem1', content: 'Previous insight about cost', agentId: 'agent1', dispositionScore: 0.8, sourceType: 'debate' as const, createdAt: Date.now() },
    { id: 'mem2', content: 'Quality matters most', agentId: 'agent1', dispositionScore: 0.9, sourceType: 'debate' as const, createdAt: Date.now() },
  ],
};

// Create test database
function createTestDb(): Database {
  const db = new Database(':memory:');

  // Create tables
  db.exec(`
    CREATE TABLE councils (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL,
      name TEXT NOT NULL,
      disposition TEXT NOT NULL,
      generation INTEGER NOT NULL,
      memory_capacity INTEGER NOT NULL,
      memory_used INTEGER NOT NULL,
      predecessor_id TEXT,
      is_active INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (council_id) REFERENCES councils(id)
    );

    CREATE TABLE debate_sessions (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      phase TEXT NOT NULL,
      synthesis TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (council_id) REFERENCES councils(id)
    );

    CREATE TABLE debate_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES debate_sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE memories (
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

  return db;
}

describe('DebateEngine', () => {
  let engine: DebateEngine;
  let testDb: Database;
  let mockCouncilId: string;
  let mockAgents: Agent[];
  let mockSession: DebateSession;

  beforeEach(() => {
    testDb = createTestDb();
    setDb(testDb);

    engine = new DebateEngine(mockMemoryManager as any);

    // Create test council
    mockCouncilId = 'council_test_' + Date.now();
    testDb.prepare(`
      INSERT INTO councils (id, name, domain, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(mockCouncilId, 'Test Council', 'lifestyle', 'Test', Date.now());

    // Create test agents
    const disposition: AgentDisposition = {
      orientation: 'pragmatic',
      filterCriteria: {
        keywords: ['cost', 'quality'],
        sentimentBias: 'neutral',
        noveltyPreference: 'balanced',
        riskTolerance: 'moderate',
      },
      priorities: {
        cost: 0.4,
        quality: 0.3,
        novelty: 0.2,
        reliability: 0.1,
      },
      voice: {
        tone: 'analytical',
        vocabulary: ['consider', 'analyze', 'evaluate'],
      },
    };

    mockAgents = [
      {
        id: 'agent1',
        councilId: mockCouncilId,
        name: 'Cost Analyst',
        disposition: { ...disposition, priorities: { cost: 0.5, quality: 0.2, novelty: 0.1, reliability: 0.2 } },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
        createdAt: Date.now(),
      },
      {
        id: 'agent2',
        councilId: mockCouncilId,
        name: 'Quality Champion',
        disposition: { ...disposition, priorities: { cost: 0.1, quality: 0.6, novelty: 0.2, reliability: 0.1 } },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
        createdAt: Date.now(),
      },
      {
        id: 'agent3',
        councilId: mockCouncilId,
        name: 'Innovation Scout',
        disposition: { ...disposition, priorities: { cost: 0.1, quality: 0.2, novelty: 0.6, reliability: 0.1 } },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
        createdAt: Date.now(),
      },
    ];

    // Insert agents into DB
    for (const agent of mockAgents) {
      testDb.prepare(`
        INSERT INTO agents (id, council_id, name, disposition, generation, memory_capacity, memory_used, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agent.id,
        agent.councilId,
        agent.name,
        JSON.stringify(agent.disposition),
        agent.generation,
        agent.memoryCapacity,
        agent.memoryUsed,
        agent.isActive ? 1 : 0,
        agent.createdAt
      );
    }

    // Create test session
    mockSession = {
      id: 'session_test_' + Date.now(),
      councilId: mockCouncilId,
      userPrompt: 'Should we invest in new technology?',
      phase: 'position',
      createdAt: Date.now(),
    };

    testDb.prepare(`
      INSERT INTO debate_sessions (id, council_id, user_prompt, phase, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(mockSession.id, mockSession.councilId, mockSession.userPrompt, mockSession.phase, mockSession.createdAt);
  });

  afterEach(() => {
    testDb.close();
  });

  describe('runDebate', () => {
    it('should return a complete DebateResult', async () => {
      const result = await engine.runDebate(mockSession, mockAgents);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(mockSession.id);
      expect(result.council).toBe('lifestyle');
      expect(result.phases).toBeDefined();
      expect(result.phases.positions).toBeDefined();
      expect(result.phases.challenges).toBeDefined();
      expect(result.phases.synthesis).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.memoriesCreated).toBe(0);
    });

    it('should update session phase through debate lifecycle', async () => {
      await engine.runDebate(mockSession, mockAgents);

      const finalSession = debateSessionDb.getById(mockSession.id);
      expect(finalSession).toBeDefined();
      expect(finalSession?.phase).toBe('complete');
      expect(finalSession?.completedAt).toBeDefined();
      expect(finalSession?.synthesis).toBeDefined();
    });
  });

  describe('runPositionPhase', () => {
    it('should generate positions for all agents', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);

      expect(positions).toHaveLength(mockAgents.length);
      expect(positions.every(p => p.agentId)).toBe(true);
      expect(positions.every(p => p.agentName)).toBe(true);
      expect(positions.every(p => p.position)).toBe(true);
      expect(positions.every(p => p.keyPoints)).toBe(true);
    });

    it('should store positions in database', async () => {
      await engine.runPositionPhase(mockSession, mockAgents);

      const turns = testDb.prepare('SELECT * FROM debate_turns WHERE session_id = ? AND phase = ?').all(mockSession.id, 'position') as any[];
      expect(turns).toHaveLength(mockAgents.length);
    });
  });

  describe('generatePosition', () => {
    it('should use agent disposition to generate position', () => {
      const position = engine.generatePosition(mockAgents[0], 'Test prompt', ['memory1', 'memory2']);

      expect(position.agentId).toBe(mockAgents[0].id);
      expect(position.agentName).toBe(mockAgents[0].name);
      expect(position.position).toBeDefined();
      expect(position.keyPoints).toBeDefined();
      expect(Array.isArray(position.keyPoints)).toBe(true);
    });

    it('should include cost consideration for cost-focused agent', () => {
      const position = engine.generatePosition(mockAgents[0], 'Test prompt', []);

      expect(position.keyPoints.some(p => p.toLowerCase().includes('cost'))).toBe(true);
    });

    it('should include quality consideration for quality-focused agent', () => {
      const position = engine.generatePosition(mockAgents[1], 'Test prompt', []);

      expect(position.keyPoints.some(p => p.toLowerCase().includes('quality'))).toBe(true);
    });

    it('should include novelty consideration for novelty-focused agent', () => {
      const position = engine.generatePosition(mockAgents[2], 'Test prompt', []);

      expect(position.keyPoints.some(p => p.toLowerCase().includes('new'))).toBe(true);
    });
  });

  describe('runChallengePhase', () => {
    it('should generate challenges between agents', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenges = await engine.runChallengePhase(mockSession, positions, mockAgents);

      expect(challenges).toHaveLength(mockAgents.length);
      expect(challenges.every(c => c.challengerId)).toBe(true);
      expect(challenges.every(c => c.targetId)).toBe(true);
      expect(challenges.every(c => c.challenge)).toBe(true);
    });

    it('should store challenges in database', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      await engine.runChallengePhase(mockSession, positions, mockAgents);

      const turns = testDb.prepare('SELECT * FROM debate_turns WHERE session_id = ? AND phase = ?').all(mockSession.id, 'challenge') as any[];
      expect(turns).toHaveLength(mockAgents.length);
    });
  });

  describe('generateChallenge', () => {
    it('should create valid challenge', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenge = engine.generateChallenge(mockAgents[0], mockAgents[1], positions[1]);

      expect(challenge.challengerId).toBe(mockAgents[0].id);
      expect(challenge.challengerName).toBe(mockAgents[0].name);
      expect(challenge.targetId).toBe(mockAgents[1].id);
      expect(challenge.targetName).toBe(mockAgents[1].name);
      expect(challenge.challenge).toBeDefined();
      expect(challenge.counterPoints).toBeDefined();
    });

    it('should generate counter-points based on priority differences', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenge = engine.generateChallenge(mockAgents[0], mockAgents[1], positions[1]);

      // Cost analyst (0.5) vs Quality champion (0.1) - should have counter-point
      expect(challenge.counterPoints.length).toBeGreaterThan(0);
    });
  });

  describe('runSynthesisPhase', () => {
    it('should produce synthesis text', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenges = await engine.runChallengePhase(mockSession, positions, mockAgents);
      const synthesis = await engine.runSynthesisPhase(mockSession, positions, challenges);

      expect(synthesis).toBeDefined();
      expect(typeof synthesis).toBe('string');
      expect(synthesis.length).toBeGreaterThan(0);
      expect(synthesis).toContain('RECOMMENDATION');
    });
  });

  describe('findConsensus', () => {
    it('should identify common key points', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const consensus = engine.findConsensus(positions);

      expect(Array.isArray(consensus)).toBe(true);
    });

    it('should return empty array when no consensus', () => {
      const positions: AgentPosition[] = [
        {
          agentId: 'a1',
          agentName: 'Agent 1',
          position: 'Position 1',
          keyPoints: ['Point A', 'Point B'],
          relevantMemories: [],
        },
        {
          agentId: 'a2',
          agentName: 'Agent 2',
          position: 'Position 2',
          keyPoints: ['Point C', 'Point D'],
          relevantMemories: [],
        },
      ];

      const consensus = engine.findConsensus(positions);
      expect(consensus).toHaveLength(0);
    });

    it('should find consensus when points repeat', () => {
      const positions: AgentPosition[] = [
        {
          agentId: 'a1',
          agentName: 'Agent 1',
          position: 'Position 1',
          keyPoints: ['Common Point', 'Unique A'],
          relevantMemories: [],
        },
        {
          agentId: 'a2',
          agentName: 'Agent 2',
          position: 'Position 2',
          keyPoints: ['Common Point', 'Unique B'],
          relevantMemories: [],
        },
      ];

      const consensus = engine.findConsensus(positions);
      expect(consensus).toContain('Common Point');
    });
  });

  describe('findTensions', () => {
    it('should identify tension points from challenges', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenges = await engine.runChallengePhase(mockSession, positions, mockAgents);
      const tensions = engine.findTensions(challenges);

      expect(Array.isArray(tensions)).toBe(true);
    });

    it('should return empty array when no tensions', () => {
      const challenges: AgentChallenge[] = [
        {
          challengerId: 'c1',
          challengerName: 'Challenger 1',
          targetId: 't1',
          targetName: 'Target 1',
          challenge: 'Challenge text',
          counterPoints: [],
        },
      ];

      const tensions = engine.findTensions(challenges);
      expect(tensions).toHaveLength(0);
    });

    it('should include challenger and target names in tension', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const challenges = await engine.runChallengePhase(mockSession, positions, mockAgents);
      const tensions = engine.findTensions(challenges);

      if (tensions.length > 0) {
        expect(tensions[0]).toContain('vs');
      }
    });
  });

  describe('calculateConfidence', () => {
    it('should return value between 0 and 1', async () => {
      const positions = await engine.runPositionPhase(mockSession, mockAgents);
      const confidence = engine.calculateConfidence(positions);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should return 0 for empty positions', () => {
      const confidence = engine.calculateConfidence([]);
      expect(confidence).toBe(0);
    });

    it('should return higher confidence for aligned positions', () => {
      const alignedPositions: AgentPosition[] = [
        {
          agentId: 'a1',
          agentName: 'Agent 1',
          position: 'Position 1',
          keyPoints: ['Point A', 'Point B', 'Point C'],
          relevantMemories: [],
        },
        {
          agentId: 'a2',
          agentName: 'Agent 2',
          position: 'Position 2',
          keyPoints: ['Point A', 'Point B', 'Point C'],
          relevantMemories: [],
        },
      ];

      const confidence = engine.calculateConfidence(alignedPositions);
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should return lower confidence for divergent positions', () => {
      const divergentPositions: AgentPosition[] = [
        {
          agentId: 'a1',
          agentName: 'Agent 1',
          position: 'Position 1',
          keyPoints: ['Point A', 'Point B'],
          relevantMemories: [],
        },
        {
          agentId: 'a2',
          agentName: 'Agent 2',
          position: 'Position 2',
          keyPoints: ['Point C', 'Point D'],
          relevantMemories: [],
        },
      ];

      const confidence = engine.calculateConfidence(divergentPositions);
      expect(confidence).toBeLessThan(0.5);
    });
  });
});
