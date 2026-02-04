export interface VectorStoreConfig {
  type: 'mock' | 'chromadb';
}

export interface VectorEntry {
  id: string;
  agentId: string;
  content: string;
  embedding?: number[];
}

export interface SimilarityResult {
  memoryId: string;
  similarity: number;
}

export interface VectorStore {
  initialize(): Promise<void>;
  addMemory(memoryId: string, agentId: string, content: string): Promise<string>;
  querySimilar(agentId: string, query: string, limit: number): Promise<SimilarityResult[]>;
  deleteMemory(embeddingId: string): Promise<void>;
  clear(): Promise<void>;
}

function calculateKeywordOverlap(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export class MockVectorStore implements VectorStore {
  private entries: Map<string, VectorEntry> = new Map();

  async initialize(): Promise<void> {
    // No-op for mock
  }

  async addMemory(memoryId: string, agentId: string, content: string): Promise<string> {
    const embeddingId = `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.entries.set(embeddingId, { id: embeddingId, agentId, content });
    return embeddingId;
  }

  async querySimilar(agentId: string, query: string, limit: number): Promise<SimilarityResult[]> {
    const agentEntries = Array.from(this.entries.values()).filter((e) => e.agentId === agentId);

    const results = agentEntries.map((entry) => ({
      memoryId: entry.id,
      similarity: calculateKeywordOverlap(query, entry.content),
    }));

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  async deleteMemory(embeddingId: string): Promise<void> {
    this.entries.delete(embeddingId);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

export function createVectorStore(config?: VectorStoreConfig): VectorStore {
  return new MockVectorStore();
}

export const vectorStore = createVectorStore();
