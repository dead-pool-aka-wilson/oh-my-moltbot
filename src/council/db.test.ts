import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initCouncilDb } from './db';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB_PATH = join(homedir(), '.clawdbot', 'test-council.db');

describe('Council Database Schema', () => {
  let db: Database;

  beforeAll(() => {
    // Clean up test db if it exists
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initCouncilDb(TEST_DB_PATH);
  });

  afterAll(() => {
    db.close();
    // Clean up test db
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Table Creation', () => {
    it('should create councils table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(councils)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('domain');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('created_at');
      expect(columnNames.length).toBe(5);
    });

    it('should create agents table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(agents)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('council_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('disposition');
      expect(columnNames).toContain('generation');
      expect(columnNames).toContain('memory_capacity');
      expect(columnNames).toContain('memory_used');
      expect(columnNames).toContain('predecessor_id');
      expect(columnNames).toContain('is_active');
      expect(columnNames).toContain('created_at');
      expect(columnNames.length).toBe(10);
    });

    it('should create memories table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(memories)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('agent_id');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('disposition_score');
      expect(columnNames).toContain('source_type');
      expect(columnNames).toContain('source_ref');
      expect(columnNames).toContain('embedding_id');
      expect(columnNames).toContain('created_at');
      expect(columnNames.length).toBe(8);
    });

    it('should create generations table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(generations)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('agent_id');
      expect(columnNames).toContain('generation_num');
      expect(columnNames).toContain('seed_memories');
      expect(columnNames).toContain('disposition_snapshot');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('retired_at');
      expect(columnNames.length).toBe(7);
    });

    it('should create debate_sessions table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(debate_sessions)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('council_id');
      expect(columnNames).toContain('user_prompt');
      expect(columnNames).toContain('phase');
      expect(columnNames).toContain('synthesis');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('completed_at');
      expect(columnNames.length).toBe(7);
    });

    it('should create debate_turns table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(debate_turns)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('session_id');
      expect(columnNames).toContain('agent_id');
      expect(columnNames).toContain('phase');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('created_at');
      expect(columnNames.length).toBe(6);
    });

    it('should create adoption_history table with correct columns', () => {
      const result = db.prepare("PRAGMA table_info(adoption_history)").all() as any[];
      const columnNames = result.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('agent_id');
      expect(columnNames).toContain('session_id');
      expect(columnNames).toContain('decision');
      expect(columnNames).toContain('user_feedback');
      expect(columnNames).toContain('disposition_delta');
      expect(columnNames).toContain('created_at');
      expect(columnNames.length).toBe(7);
    });
  });

  describe('Indexes', () => {
    it('should create idx_agents_council index', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agents_council'")
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_agents_active index', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agents_active'")
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_memories_agent index', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memories_agent'")
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_memories_score index', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memories_score'")
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_debate_sessions_council index', () => {
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_debate_sessions_council'"
        )
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_debate_turns_session index', () => {
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_debate_turns_session'"
        )
        .all();
      expect(result.length).toBe(1);
    });

    it('should create idx_adoption_agent index', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_adoption_agent'")
        .all();
      expect(result.length).toBe(1);
    });
  });

  describe('Foreign Keys', () => {
    it('should enforce foreign key constraints', () => {
      db.exec('PRAGMA foreign_keys = ON');

      // Insert a council first
      db.prepare(
        'INSERT INTO councils (id, name, domain, created_at) VALUES (?, ?, ?, ?)'
      ).run('test-council', 'Test Council', 'test', Date.now());

      // Try to insert an agent with non-existent council_id (should fail)
      expect(() => {
        db.prepare(
          'INSERT INTO agents (id, council_id, name, disposition, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run('test-agent', 'non-existent-council', 'Test Agent', '{}', Date.now());
      }).toThrow();

      // Clean up
      db.prepare('DELETE FROM councils WHERE id = ?').run('test-council');
    });

    it('should allow valid foreign key references', () => {
      db.exec('PRAGMA foreign_keys = ON');

      // Insert a council
      db.prepare(
        'INSERT INTO councils (id, name, domain, created_at) VALUES (?, ?, ?, ?)'
      ).run('test-council-2', 'Test Council 2', 'test2', Date.now());

      // Insert an agent with valid council_id
      expect(() => {
        db.prepare(
          'INSERT INTO agents (id, council_id, name, disposition, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run('test-agent-2', 'test-council-2', 'Test Agent 2', '{}', Date.now());
      }).not.toThrow();

      // Clean up
      db.prepare('DELETE FROM agents WHERE id = ?').run('test-agent-2');
      db.prepare('DELETE FROM councils WHERE id = ?').run('test-council-2');
    });
  });

  describe('Table Existence', () => {
    it('should have all 7 tables created', () => {
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .all() as any[];

      const tableNames = result.map((row) => row.name).sort();
      const expectedTables = [
        'adoption_history',
        'agents',
        'councils',
        'debate_sessions',
        'debate_turns',
        'generations',
        'memories',
      ].sort();

      expect(tableNames).toEqual(expectedTables);
    });
  });
});
