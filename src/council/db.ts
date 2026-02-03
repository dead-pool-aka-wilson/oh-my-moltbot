import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const DB_DIR = join(homedir(), '.clawdbot');
const DEFAULT_DB_PATH = join(DB_DIR, 'task-queue.db');

export function initCouncilDb(dbPath: string = DEFAULT_DB_PATH): Database {
  mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(dbPath);
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
      disposition_snapshot TEXT,
      created_at INTEGER NOT NULL,
      retired_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS debate_sessions (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      phase TEXT DEFAULT 'position',
      synthesis TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (council_id) REFERENCES councils(id)
    );

    CREATE TABLE IF NOT EXISTS debate_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES debate_sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS adoption_history (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      user_feedback TEXT,
      disposition_delta TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (session_id) REFERENCES debate_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agents_council ON agents(council_id);
    CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);
    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_score ON memories(disposition_score);
    CREATE INDEX IF NOT EXISTS idx_debate_sessions_council ON debate_sessions(council_id);
    CREATE INDEX IF NOT EXISTS idx_debate_turns_session ON debate_turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_adoption_agent ON adoption_history(agent_id);
  `);

  return db;
}
