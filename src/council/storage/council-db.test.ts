import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initCouncilDb } from '../db';
import {
  councilDb,
  agentDb,
  memoryDb,
  generationDb,
  debateSessionDb,
  debateTurnDb,
  adoptionDb,
  setDb,
} from './council-db';
import type {
  Council,
  Agent,
  Memory,
  Generation,
  DebateSession,
  DebateTurn,
  AdoptionRecord,
  AgentDisposition,
} from '../types';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB_PATH = join(homedir(), '.clawdbot', 'test-council-crud.db');

describe('Council CRUD Storage Layer', () => {
  let db: Database;

  beforeAll(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initCouncilDb(TEST_DB_PATH);
    setDb(db);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  const cleanupCouncils = () => {
    db.exec('DELETE FROM adoption_history');
    db.exec('DELETE FROM debate_turns');
    db.exec('DELETE FROM debate_sessions');
    db.exec('DELETE FROM generations');
    db.exec('DELETE FROM memories');
    db.exec('DELETE FROM agents');
    db.exec('DELETE FROM councils');
  };

  // ============================================================================
  // Council CRUD Tests
  // ============================================================================

  describe('Council CRUD', () => {
    it('should insert a council and return it with generated ID', () => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Lifestyle Council',
        domain: 'lifestyle',
        description: 'Discusses lifestyle decisions',
      });

      expect(council.id).toBeDefined();
      expect(council.id.startsWith('council_')).toBe(true);
      expect(council.name).toBe('Lifestyle Council');
      expect(council.domain).toBe('lifestyle');
      expect(council.createdAt).toBeDefined();
      expect(typeof council.createdAt).toBe('number');
    });

    it('should get council by ID', () => {
      cleanupCouncils();
      const inserted = councilDb.insert({
        name: 'Creative Council',
        domain: 'creative',
        description: 'Discusses creative projects',
      });

      const retrieved = councilDb.getById(inserted.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.name).toBe('Creative Council');
    });

    it('should return null for non-existent council ID', () => {
      const result = councilDb.getById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should get council by domain', () => {
      cleanupCouncils();
      const inserted = councilDb.insert({
        name: 'Direction Council',
        domain: 'direction',
        description: 'Discusses direction',
      });

      const retrieved = councilDb.getByDomain('direction');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.domain).toBe('direction');
      expect(retrieved?.id).toBe(inserted.id);
    });

    it('should get all councils', () => {
      cleanupCouncils();
      councilDb.insert({
        name: 'Council 1',
        domain: 'lifestyle',
      });
      councilDb.insert({
        name: 'Council 2',
        domain: 'creative',
      });
      councilDb.insert({
        name: 'Council 3',
        domain: 'direction',
      });

      const all = councilDb.getAll();
      expect(all.length).toBe(3);
    });

    it('should update a council', () => {
      cleanupCouncils();
      const inserted = councilDb.insert({
        name: 'Original Name',
        domain: 'lifestyle',
      });

      const updated = councilDb.update(inserted.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(updated).toBe(true);

      const retrieved = councilDb.getById(inserted.id);
      expect(retrieved?.name).toBe('Updated Name');
      expect(retrieved?.description).toBe('New description');
    });

    it('should return false when updating non-existent council', () => {
      const result = councilDb.update('non-existent-id', { name: 'Test' });
      expect(result).toBe(false);
    });

    it('should delete a council', () => {
      cleanupCouncils();
      const inserted = councilDb.insert({
        name: 'To Delete',
        domain: 'lifestyle',
      });

      const deleted = councilDb.delete(inserted.id);
      expect(deleted).toBe(true);

      const retrieved = councilDb.getById(inserted.id);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent council', () => {
      const result = councilDb.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Agent CRUD Tests
  // ============================================================================

  describe('Agent CRUD', () => {
    let councilId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Agents',
        domain: 'lifestyle',
      });
      councilId = council.id;
    });

    const createTestDisposition = (): AgentDisposition => ({
      orientation: 'pragmatic',
      filterCriteria: {
        keywords: ['practical', 'efficient'],
        sentimentBias: 'neutral',
        noveltyPreference: 'balanced',
        riskTolerance: 'moderate',
      },
      priorities: {
        cost: 0.3,
        quality: 0.3,
        novelty: 0.2,
        reliability: 0.2,
      },
      voice: {
        tone: 'professional',
        vocabulary: ['efficient', 'practical'],
      },
    });

    it('should insert an agent and return it with generated ID', () => {
      const agent = agentDb.insert({
        councilId,
        name: 'Pragmatist',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      expect(agent.id).toBeDefined();
      expect(agent.id.startsWith('agent_')).toBe(true);
      expect(agent.name).toBe('Pragmatist');
      expect(agent.councilId).toBe(councilId);
      expect(agent.generation).toBe(1);
      expect(agent.createdAt).toBeDefined();
    });

    it('should get agent by ID', () => {
      const inserted = agentDb.insert({
        councilId,
        name: 'Idealist',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const retrieved = agentDb.getById(inserted.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.name).toBe('Idealist');
    });

    it('should get agents by council', () => {
      agentDb.insert({
        councilId,
        name: 'Agent 1',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      agentDb.insert({
        councilId,
        name: 'Agent 2',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const agents = agentDb.getByCouncil(councilId);
      expect(agents.length).toBeGreaterThanOrEqual(2);
      expect(agents.every((a) => a.councilId === councilId)).toBe(true);
    });

    it('should get only active agents by council', () => {
      const active = agentDb.insert({
        councilId,
        name: 'Active Agent',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const inactive = agentDb.insert({
        councilId,
        name: 'Inactive Agent',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: false,
      });

      const activeAgents = agentDb.getActiveByCouncil(councilId);
      expect(activeAgents.every((a) => a.isActive)).toBe(true);
      expect(activeAgents.some((a) => a.id === active.id)).toBe(true);
      expect(activeAgents.some((a) => a.id === inactive.id)).toBe(false);
    });

    it('should update an agent', () => {
      const inserted = agentDb.insert({
        councilId,
        name: 'Original Name',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const updated = agentDb.update(inserted.id, {
        name: 'Updated Name',
        generation: 2,
        isActive: false,
      });

      expect(updated).toBe(true);

      const retrieved = agentDb.getById(inserted.id);
      expect(retrieved?.name).toBe('Updated Name');
      expect(retrieved?.generation).toBe(2);
      expect(retrieved?.isActive).toBe(false);
    });

    it('should delete an agent', () => {
      const inserted = agentDb.insert({
        councilId,
        name: 'To Delete',
        disposition: createTestDisposition(),
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const deleted = agentDb.delete(inserted.id);
      expect(deleted).toBe(true);

      const retrieved = agentDb.getById(inserted.id);
      expect(retrieved).toBeNull();
    });
  });

  // ============================================================================
  // Memory CRUD Tests
  // ============================================================================

  describe('Memory CRUD', () => {
    let agentId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Memories',
        domain: 'lifestyle',
      });

      const agent = agentDb.insert({
        councilId: council.id,
        name: 'Test Agent',
        disposition: {
          orientation: 'pragmatic',
          filterCriteria: {
            keywords: ['test'],
            sentimentBias: 'neutral',
            noveltyPreference: 'balanced',
            riskTolerance: 'moderate',
          },
          priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
          voice: { tone: 'neutral', vocabulary: ['test'] },
        },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      agentId = agent.id;
    });

    it('should insert a memory and return it with generated ID', () => {
      const memory = memoryDb.insert({
        agentId,
        content: 'Test memory content',
        dispositionScore: 0.8,
        sourceType: 'debate',
        sourceRef: 'session-123',
      });

      expect(memory.id).toBeDefined();
      expect(memory.id.startsWith('memory_')).toBe(true);
      expect(memory.content).toBe('Test memory content');
      expect(memory.dispositionScore).toBe(0.8);
      expect(memory.createdAt).toBeDefined();
    });

    it('should get memory by ID', () => {
      const inserted = memoryDb.insert({
        agentId,
        content: 'Specific memory',
        dispositionScore: 0.7,
        sourceType: 'observation',
      });

      const retrieved = memoryDb.getById(inserted.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.content).toBe('Specific memory');
    });

    it('should get memories by agent', () => {
      memoryDb.insert({
        agentId,
        content: 'Memory 1',
        dispositionScore: 0.6,
        sourceType: 'debate',
      });

      memoryDb.insert({
        agentId,
        content: 'Memory 2',
        dispositionScore: 0.7,
        sourceType: 'observation',
      });

      const memories = memoryDb.getByAgent(agentId);
      expect(memories.length).toBeGreaterThanOrEqual(2);
      expect(memories.every((m) => m.agentId === agentId)).toBe(true);
    });

    it('should get lowest scoring memory for displacement', () => {
      memoryDb.insert({
        agentId,
        content: 'High score',
        dispositionScore: 0.9,
        sourceType: 'debate',
      });

      memoryDb.insert({
        agentId,
        content: 'Low score',
        dispositionScore: 0.2,
        sourceType: 'observation',
      });

      const lowest = memoryDb.getLowestScoring(agentId);
      expect(lowest).not.toBeNull();
      expect(lowest?.dispositionScore).toBeLessThanOrEqual(0.3);
    });

    it('should get top memories by score', () => {
      memoryDb.insert({
        agentId,
        content: 'Top 1',
        dispositionScore: 0.95,
        sourceType: 'debate',
      });

      memoryDb.insert({
        agentId,
        content: 'Top 2',
        dispositionScore: 0.92,
        sourceType: 'debate',
      });

      memoryDb.insert({
        agentId,
        content: 'Low',
        dispositionScore: 0.3,
        sourceType: 'observation',
      });

      const top = memoryDb.getTopByScore(agentId, 2);
      expect(top.length).toBeLessThanOrEqual(2);
      expect(top[0].dispositionScore).toBeGreaterThanOrEqual(top[1]?.dispositionScore || 0);
    });

    it('should update a memory', () => {
      const inserted = memoryDb.insert({
        agentId,
        content: 'Original content',
        dispositionScore: 0.5,
        sourceType: 'debate',
      });

      const updated = memoryDb.update(inserted.id, {
        content: 'Updated content',
        dispositionScore: 0.8,
      });

      expect(updated).toBe(true);

      const retrieved = memoryDb.getById(inserted.id);
      expect(retrieved?.content).toBe('Updated content');
      expect(retrieved?.dispositionScore).toBe(0.8);
    });

    it('should delete a memory', () => {
      const inserted = memoryDb.insert({
        agentId,
        content: 'To delete',
        dispositionScore: 0.5,
        sourceType: 'debate',
      });

      const deleted = memoryDb.delete(inserted.id);
      expect(deleted).toBe(true);

      const retrieved = memoryDb.getById(inserted.id);
      expect(retrieved).toBeNull();
    });

    it('should count memories by agent', () => {
      const before = memoryDb.countByAgent(agentId);
      memoryDb.insert({
        agentId,
        content: 'New memory',
        dispositionScore: 0.5,
        sourceType: 'debate',
      });
      const after = memoryDb.countByAgent(agentId);
      expect(after).toBeGreaterThan(before);
    });
  });

  // ============================================================================
  // Generation CRUD Tests
  // ============================================================================

  describe('Generation CRUD', () => {
    let agentId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Generations',
        domain: 'lifestyle',
      });

      const agent = agentDb.insert({
        councilId: council.id,
        name: 'Test Agent',
        disposition: {
          orientation: 'pragmatic',
          filterCriteria: {
            keywords: ['test'],
            sentimentBias: 'neutral',
            noveltyPreference: 'balanced',
            riskTolerance: 'moderate',
          },
          priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
          voice: { tone: 'neutral', vocabulary: ['test'] },
        },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      agentId = agent.id;
    });

    it('should insert a generation and return it with generated ID', () => {
      const disposition = {
        orientation: 'pragmatic',
        filterCriteria: {
          keywords: ['test'],
          sentimentBias: 'neutral' as const,
          noveltyPreference: 'balanced' as const,
          riskTolerance: 'moderate' as const,
        },
        priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
        voice: { tone: 'neutral', vocabulary: ['test'] },
      };

      const generation = generationDb.insert({
        agentId,
        generationNum: 1,
        dispositionSnapshot: disposition,
        seedMemories: ['mem-1', 'mem-2'],
      });

      expect(generation.id).toBeDefined();
      expect(generation.id.startsWith('gen_')).toBe(true);
      expect(generation.generationNum).toBe(1);
      expect(generation.createdAt).toBeDefined();
    });

    it('should get generation by ID', () => {
      const disposition = {
        orientation: 'pragmatic',
        filterCriteria: {
          keywords: ['test'],
          sentimentBias: 'neutral' as const,
          noveltyPreference: 'balanced' as const,
          riskTolerance: 'moderate' as const,
        },
        priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
        voice: { tone: 'neutral', vocabulary: ['test'] },
      };

      const inserted = generationDb.insert({
        agentId,
        generationNum: 2,
        dispositionSnapshot: disposition,
      });

      const retrieved = generationDb.getById(inserted.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.generationNum).toBe(2);
    });

    it('should get generations by agent', () => {
      const disposition = {
        orientation: 'pragmatic',
        filterCriteria: {
          keywords: ['test'],
          sentimentBias: 'neutral' as const,
          noveltyPreference: 'balanced' as const,
          riskTolerance: 'moderate' as const,
        },
        priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
        voice: { tone: 'neutral', vocabulary: ['test'] },
      };

      generationDb.insert({
        agentId,
        generationNum: 3,
        dispositionSnapshot: disposition,
      });

      const generations = generationDb.getByAgent(agentId);
      expect(generations.length).toBeGreaterThanOrEqual(1);
      expect(generations.every((g) => g.agentId === agentId)).toBe(true);
    });

    it('should get latest generation for agent', () => {
      const disposition = {
        orientation: 'pragmatic',
        filterCriteria: {
          keywords: ['test'],
          sentimentBias: 'neutral' as const,
          noveltyPreference: 'balanced' as const,
          riskTolerance: 'moderate' as const,
        },
        priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
        voice: { tone: 'neutral', vocabulary: ['test'] },
      };

      generationDb.insert({
        agentId,
        generationNum: 4,
        dispositionSnapshot: disposition,
      });

      const latest = generationDb.getLatest(agentId);
      expect(latest).not.toBeNull();
      expect(latest?.agentId).toBe(agentId);
    });

    it('should update a generation', () => {
      const disposition = {
        orientation: 'pragmatic',
        filterCriteria: {
          keywords: ['test'],
          sentimentBias: 'neutral' as const,
          noveltyPreference: 'balanced' as const,
          riskTolerance: 'moderate' as const,
        },
        priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
        voice: { tone: 'neutral', vocabulary: ['test'] },
      };

      const inserted = generationDb.insert({
        agentId,
        generationNum: 5,
        dispositionSnapshot: disposition,
      });

      const updated = generationDb.update(inserted.id, {
        retiredAt: Date.now(),
      });

      expect(updated).toBe(true);

      const retrieved = generationDb.getById(inserted.id);
      expect(retrieved?.retiredAt).toBeDefined();
    });
  });

  // ============================================================================
  // DebateSession CRUD Tests
  // ============================================================================

  describe('DebateSession CRUD', () => {
    let councilId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Sessions',
        domain: 'lifestyle',
      });
      councilId = council.id;
    });

    it('should insert a debate session and return it with generated ID', () => {
      const session = debateSessionDb.insert({
        councilId,
        userPrompt: 'Should I change careers?',
        phase: 'position',
      });

      expect(session.id).toBeDefined();
      expect(session.id.startsWith('session_')).toBe(true);
      expect(session.userPrompt).toBe('Should I change careers?');
      expect(session.phase).toBe('position');
      expect(session.createdAt).toBeDefined();
    });

    it('should get debate session by ID', () => {
      const inserted = debateSessionDb.insert({
        councilId,
        userPrompt: 'Test prompt',
        phase: 'challenge',
      });

      const retrieved = debateSessionDb.getById(inserted.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.userPrompt).toBe('Test prompt');
    });

    it('should get debate sessions by council', () => {
      debateSessionDb.insert({
        councilId,
        userPrompt: 'Session 1',
        phase: 'position',
      });

      debateSessionDb.insert({
        councilId,
        userPrompt: 'Session 2',
        phase: 'challenge',
      });

      const sessions = debateSessionDb.getByCouncil(councilId);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.every((s) => s.councilId === councilId)).toBe(true);
    });

    it('should update a debate session', () => {
      const inserted = debateSessionDb.insert({
        councilId,
        userPrompt: 'Original prompt',
        phase: 'position',
      });

      const updated = debateSessionDb.update(inserted.id, {
        phase: 'synthesis',
        synthesis: 'The synthesis is...',
        completedAt: Date.now(),
      });

      expect(updated).toBe(true);

      const retrieved = debateSessionDb.getById(inserted.id);
      expect(retrieved?.phase).toBe('synthesis');
      expect(retrieved?.synthesis).toBe('The synthesis is...');
      expect(retrieved?.completedAt).toBeDefined();
    });
  });

  // ============================================================================
  // DebateTurn CRUD Tests
  // ============================================================================

  describe('DebateTurn CRUD', () => {
    let sessionId: string;
    let agentId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Turns',
        domain: 'lifestyle',
      });

      const agent = agentDb.insert({
        councilId: council.id,
        name: 'Test Agent',
        disposition: {
          orientation: 'pragmatic',
          filterCriteria: {
            keywords: ['test'],
            sentimentBias: 'neutral',
            noveltyPreference: 'balanced',
            riskTolerance: 'moderate',
          },
          priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
          voice: { tone: 'neutral', vocabulary: ['test'] },
        },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const session = debateSessionDb.insert({
        councilId: council.id,
        userPrompt: 'Test debate',
        phase: 'position',
      });

      sessionId = session.id;
      agentId = agent.id;
    });

    it('should insert a debate turn and return it with generated ID', () => {
      const turn = debateTurnDb.insert({
        sessionId,
        agentId,
        phase: 'position',
        content: 'I believe we should...',
      });

      expect(turn.id).toBeDefined();
      expect(turn.id.startsWith('turn_')).toBe(true);
      expect(turn.content).toBe('I believe we should...');
      expect(turn.phase).toBe('position');
      expect(turn.createdAt).toBeDefined();
    });

    it('should get debate turns by session', () => {
      debateTurnDb.insert({
        sessionId,
        agentId,
        phase: 'position',
        content: 'Turn 1',
      });

      debateTurnDb.insert({
        sessionId,
        agentId,
        phase: 'challenge',
        content: 'Turn 2',
      });

      const turns = debateTurnDb.getBySession(sessionId);
      expect(turns.length).toBeGreaterThanOrEqual(2);
      expect(turns.every((t) => t.sessionId === sessionId)).toBe(true);
    });

    it('should get debate turns by session and phase', () => {
      debateTurnDb.insert({
        sessionId,
        agentId,
        phase: 'position',
        content: 'Position turn',
      });

      debateTurnDb.insert({
        sessionId,
        agentId,
        phase: 'challenge',
        content: 'Challenge turn',
      });

      const positionTurns = debateTurnDb.getBySessionAndPhase(sessionId, 'position');
      expect(positionTurns.every((t) => t.phase === 'position')).toBe(true);

      const challengeTurns = debateTurnDb.getBySessionAndPhase(sessionId, 'challenge');
      expect(challengeTurns.every((t) => t.phase === 'challenge')).toBe(true);
    });
  });

  // ============================================================================
  // AdoptionRecord CRUD Tests
  // ============================================================================

  describe('AdoptionRecord CRUD', () => {
    let agentId: string;
    let sessionId: string;

    beforeAll(() => {
      cleanupCouncils();
      const council = councilDb.insert({
        name: 'Test Council for Adoption',
        domain: 'lifestyle',
      });

      const agent = agentDb.insert({
        councilId: council.id,
        name: 'Test Agent',
        disposition: {
          orientation: 'pragmatic',
          filterCriteria: {
            keywords: ['test'],
            sentimentBias: 'neutral',
            noveltyPreference: 'balanced',
            riskTolerance: 'moderate',
          },
          priorities: { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 },
          voice: { tone: 'neutral', vocabulary: ['test'] },
        },
        generation: 1,
        memoryCapacity: 100,
        memoryUsed: 0,
        isActive: true,
      });

      const session = debateSessionDb.insert({
        councilId: council.id,
        userPrompt: 'Test debate',
        phase: 'complete',
      });

      agentId = agent.id;
      sessionId = session.id;
    });

    it('should insert an adoption record and return it with generated ID', () => {
      const record = adoptionDb.insert({
        agentId,
        sessionId,
        decision: 'adopted',
        userFeedback: 'Great suggestion!',
      });

      expect(record.id).toBeDefined();
      expect(record.id.startsWith('adoption_')).toBe(true);
      expect(record.decision).toBe('adopted');
      expect(record.createdAt).toBeDefined();
    });

    it('should get adoption records by agent', () => {
      adoptionDb.insert({
        agentId,
        sessionId,
        decision: 'rejected',
        userFeedback: 'Not applicable',
      });

      adoptionDb.insert({
        agentId,
        sessionId,
        decision: 'partial',
        userFeedback: 'Partially useful',
      });

      const records = adoptionDb.getByAgent(agentId);
      expect(records.length).toBeGreaterThanOrEqual(2);
      expect(records.every((r) => r.agentId === agentId)).toBe(true);
    });

    it('should get adoption records by session', () => {
      adoptionDb.insert({
        agentId,
        sessionId,
        decision: 'adopted',
      });

      const records = adoptionDb.getBySession(sessionId);
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.every((r) => r.sessionId === sessionId)).toBe(true);
    });
  });
});
