import { Database } from 'bun:sqlite';
import { initCouncilDb } from '../db';
import type {
  Council,
  Agent,
  Memory,
  Generation,
  DebateSession,
  DebateTurn,
  AdoptionRecord,
  AgentDisposition,
  CouncilDomain,
} from '../types';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = initCouncilDb();
  }
  return db;
}

export function setDb(database: Database): void {
  db = database;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const councilDb = {
  insert(council: Omit<Council, 'id' | 'createdAt'>): Council {
    const db = getDb();
    const id = generateId('council');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO councils (id, name, domain, description, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, council.name, council.domain, council.description || null, createdAt);

    return {
      id,
      name: council.name,
      domain: council.domain,
      description: council.description,
      createdAt,
    };
  },

  getById(id: string): Council | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM councils WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      domain: row.domain as CouncilDomain,
      description: row.description,
      createdAt: row.created_at,
    };
  },

  getByDomain(domain: CouncilDomain): Council | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM councils WHERE domain = ?');
    const row = stmt.get(domain) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      domain: row.domain as CouncilDomain,
      description: row.description,
      createdAt: row.created_at,
    };
  },

  getAll(): Council[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM councils ORDER BY created_at DESC');
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain as CouncilDomain,
      description: row.description,
      createdAt: row.created_at,
    }));
  },

  update(id: string, updates: Partial<Council>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE councils SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  },

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM councils WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },
};

export const agentDb = {
  insert(agent: Omit<Agent, 'id' | 'createdAt'>): Agent {
    const db = getDb();
    const id = generateId('agent');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO agents (id, council_id, name, disposition, generation, memory_capacity, memory_used, predecessor_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      agent.councilId,
      agent.name,
      JSON.stringify(agent.disposition),
      agent.generation,
      agent.memoryCapacity,
      agent.memoryUsed,
      agent.predecessorId || null,
      agent.isActive ? 1 : 0,
      createdAt
    );

    return {
      id,
      councilId: agent.councilId,
      name: agent.name,
      disposition: agent.disposition,
      generation: agent.generation,
      memoryCapacity: agent.memoryCapacity,
      memoryUsed: agent.memoryUsed,
      predecessorId: agent.predecessorId,
      isActive: agent.isActive,
      createdAt,
    };
  },

  getById(id: string): Agent | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      councilId: row.council_id,
      name: row.name,
      disposition: JSON.parse(row.disposition),
      generation: row.generation,
      memoryCapacity: row.memory_capacity,
      memoryUsed: row.memory_used,
      predecessorId: row.predecessor_id,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
    };
  },

  getByCouncil(councilId: string): Agent[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM agents WHERE council_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(councilId) as any[];

    return rows.map((row) => ({
      id: row.id,
      councilId: row.council_id,
      name: row.name,
      disposition: JSON.parse(row.disposition),
      generation: row.generation,
      memoryCapacity: row.memory_capacity,
      memoryUsed: row.memory_used,
      predecessorId: row.predecessor_id,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
    }));
  },

  getActiveByCouncil(councilId: string): Agent[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM agents WHERE council_id = ? AND is_active = 1 ORDER BY created_at DESC'
    );
    const rows = stmt.all(councilId) as any[];

    return rows.map((row) => ({
      id: row.id,
      councilId: row.council_id,
      name: row.name,
      disposition: JSON.parse(row.disposition),
      generation: row.generation,
      memoryCapacity: row.memory_capacity,
      memoryUsed: row.memory_used,
      predecessorId: row.predecessor_id,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
    }));
  },

  update(id: string, updates: Partial<Agent>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.disposition !== undefined) {
      fields.push('disposition = ?');
      values.push(JSON.stringify(updates.disposition));
    }
    if (updates.generation !== undefined) {
      fields.push('generation = ?');
      values.push(updates.generation);
    }
    if (updates.memoryCapacity !== undefined) {
      fields.push('memory_capacity = ?');
      values.push(updates.memoryCapacity);
    }
    if (updates.memoryUsed !== undefined) {
      fields.push('memory_used = ?');
      values.push(updates.memoryUsed);
    }
    if (updates.predecessorId !== undefined) {
      fields.push('predecessor_id = ?');
      values.push(updates.predecessorId || null);
    }
    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.isActive ? 1 : 0);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  },

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },
};

export const memoryDb = {
  insert(memory: Omit<Memory, 'id' | 'createdAt'>): Memory {
    const db = getDb();
    const id = generateId('memory');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO memories (id, agent_id, content, disposition_score, source_type, source_ref, embedding_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      memory.agentId,
      memory.content,
      memory.dispositionScore,
      memory.sourceType,
      memory.sourceRef || null,
      memory.embeddingId || null,
      createdAt
    );

    return {
      id,
      agentId: memory.agentId,
      content: memory.content,
      dispositionScore: memory.dispositionScore,
      sourceType: memory.sourceType,
      sourceRef: memory.sourceRef,
      embeddingId: memory.embeddingId,
      createdAt,
    };
  },

  getById(id: string): Memory | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      dispositionScore: row.disposition_score,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      embeddingId: row.embedding_id,
      createdAt: row.created_at,
    };
  },

  getByAgent(agentId: string): Memory[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(agentId) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      dispositionScore: row.disposition_score,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      embeddingId: row.embedding_id,
      createdAt: row.created_at,
    }));
  },

  getLowestScoring(agentId: string): Memory | null {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM memories WHERE agent_id = ? ORDER BY disposition_score ASC LIMIT 1'
    );
    const row = stmt.get(agentId) as any;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      dispositionScore: row.disposition_score,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      embeddingId: row.embedding_id,
      createdAt: row.created_at,
    };
  },

  getTopByScore(agentId: string, limit: number): Memory[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM memories WHERE agent_id = ? ORDER BY disposition_score DESC LIMIT ?'
    );
    const rows = stmt.all(agentId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      content: row.content,
      dispositionScore: row.disposition_score,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      embeddingId: row.embedding_id,
      createdAt: row.created_at,
    }));
  },

  update(id: string, updates: Partial<Memory>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.dispositionScore !== undefined) {
      fields.push('disposition_score = ?');
      values.push(updates.dispositionScore);
    }
    if (updates.sourceType !== undefined) {
      fields.push('source_type = ?');
      values.push(updates.sourceType);
    }
    if (updates.sourceRef !== undefined) {
      fields.push('source_ref = ?');
      values.push(updates.sourceRef || null);
    }
    if (updates.embeddingId !== undefined) {
      fields.push('embedding_id = ?');
      values.push(updates.embeddingId || null);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  },

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  countByAgent(agentId: string): number {
    const db = getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM memories WHERE agent_id = ?');
    const row = stmt.get(agentId) as any;
    return row.count;
  },
};

export const generationDb = {
  insert(generation: Omit<Generation, 'id' | 'createdAt'>): Generation {
    const db = getDb();
    const id = generateId('gen');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO generations (id, agent_id, generation_num, seed_memories, disposition_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      generation.agentId,
      generation.generationNum,
      generation.seedMemories ? JSON.stringify(generation.seedMemories) : null,
      JSON.stringify(generation.dispositionSnapshot),
      createdAt
    );

    return {
      id,
      agentId: generation.agentId,
      generationNum: generation.generationNum,
      seedMemories: generation.seedMemories,
      dispositionSnapshot: generation.dispositionSnapshot,
      createdAt,
    };
  },

  getById(id: string): Generation | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM generations WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      generationNum: row.generation_num,
      seedMemories: row.seed_memories ? JSON.parse(row.seed_memories) : undefined,
      dispositionSnapshot: JSON.parse(row.disposition_snapshot),
      createdAt: row.created_at,
      retiredAt: row.retired_at,
    };
  },

  getByAgent(agentId: string): Generation[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM generations WHERE agent_id = ? ORDER BY generation_num DESC'
    );
    const rows = stmt.all(agentId) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      generationNum: row.generation_num,
      seedMemories: row.seed_memories ? JSON.parse(row.seed_memories) : undefined,
      dispositionSnapshot: JSON.parse(row.disposition_snapshot),
      createdAt: row.created_at,
      retiredAt: row.retired_at,
    }));
  },

  getLatest(agentId: string): Generation | null {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM generations WHERE agent_id = ? ORDER BY generation_num DESC LIMIT 1'
    );
    const row = stmt.get(agentId) as any;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      generationNum: row.generation_num,
      seedMemories: row.seed_memories ? JSON.parse(row.seed_memories) : undefined,
      dispositionSnapshot: JSON.parse(row.disposition_snapshot),
      createdAt: row.created_at,
      retiredAt: row.retired_at,
    };
  },

  update(id: string, updates: Partial<Generation>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.seedMemories !== undefined) {
      fields.push('seed_memories = ?');
      values.push(updates.seedMemories ? JSON.stringify(updates.seedMemories) : null);
    }
    if (updates.dispositionSnapshot !== undefined) {
      fields.push('disposition_snapshot = ?');
      values.push(JSON.stringify(updates.dispositionSnapshot));
    }
    if (updates.retiredAt !== undefined) {
      fields.push('retired_at = ?');
      values.push(updates.retiredAt || null);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE generations SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  },
};

export const debateSessionDb = {
  insert(session: Omit<DebateSession, 'id' | 'createdAt'>): DebateSession {
    const db = getDb();
    const id = generateId('session');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO debate_sessions (id, council_id, user_prompt, phase, synthesis, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      session.councilId,
      session.userPrompt,
      session.phase,
      session.synthesis || null,
      createdAt,
      session.completedAt || null
    );

    return {
      id,
      councilId: session.councilId,
      userPrompt: session.userPrompt,
      phase: session.phase,
      synthesis: session.synthesis,
      createdAt,
      completedAt: session.completedAt,
    };
  },

  getById(id: string): DebateSession | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM debate_sessions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      councilId: row.council_id,
      userPrompt: row.user_prompt,
      phase: row.phase,
      synthesis: row.synthesis,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  },

  getByCouncil(councilId: string): DebateSession[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM debate_sessions WHERE council_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(councilId) as any[];

    return rows.map((row) => ({
      id: row.id,
      councilId: row.council_id,
      userPrompt: row.user_prompt,
      phase: row.phase,
      synthesis: row.synthesis,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  },

  update(id: string, updates: Partial<DebateSession>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.phase !== undefined) {
      fields.push('phase = ?');
      values.push(updates.phase);
    }
    if (updates.synthesis !== undefined) {
      fields.push('synthesis = ?');
      values.push(updates.synthesis || null);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt || null);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE debate_sessions SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  },
};

export const debateTurnDb = {
  insert(turn: Omit<DebateTurn, 'id' | 'createdAt'>): DebateTurn {
    const db = getDb();
    const id = generateId('turn');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO debate_turns (id, session_id, agent_id, phase, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, turn.sessionId, turn.agentId, turn.phase, turn.content, createdAt);

    return {
      id,
      sessionId: turn.sessionId,
      agentId: turn.agentId,
      phase: turn.phase,
      content: turn.content,
      createdAt,
    };
  },

  getBySession(sessionId: string): DebateTurn[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM debate_turns WHERE session_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      phase: row.phase,
      content: row.content,
      createdAt: row.created_at,
    }));
  },

  getBySessionAndPhase(sessionId: string, phase: string): DebateTurn[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM debate_turns WHERE session_id = ? AND phase = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(sessionId, phase) as any[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      phase: row.phase,
      content: row.content,
      createdAt: row.created_at,
    }));
  },
};

export const adoptionDb = {
  insert(record: Omit<AdoptionRecord, 'id' | 'createdAt'>): AdoptionRecord {
    const db = getDb();
    const id = generateId('adoption');
    const createdAt = Date.now();

    const stmt = db.prepare(
      'INSERT INTO adoption_history (id, agent_id, session_id, decision, user_feedback, disposition_delta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      id,
      record.agentId,
      record.sessionId,
      record.decision,
      record.userFeedback || null,
      record.dispositionDelta ? JSON.stringify(record.dispositionDelta) : null,
      createdAt
    );

    return {
      id,
      agentId: record.agentId,
      sessionId: record.sessionId,
      decision: record.decision,
      userFeedback: record.userFeedback,
      dispositionDelta: record.dispositionDelta,
      createdAt,
    };
  },

  getByAgent(agentId: string): AdoptionRecord[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM adoption_history WHERE agent_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(agentId) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id,
      decision: row.decision,
      userFeedback: row.user_feedback,
      dispositionDelta: row.disposition_delta ? JSON.parse(row.disposition_delta) : undefined,
      createdAt: row.created_at,
    }));
  },

  getBySession(sessionId: string): AdoptionRecord[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT * FROM adoption_history WHERE session_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id,
      decision: row.decision,
      userFeedback: row.user_feedback,
      dispositionDelta: row.disposition_delta ? JSON.parse(row.disposition_delta) : undefined,
      createdAt: row.created_at,
    }));
  },
};
