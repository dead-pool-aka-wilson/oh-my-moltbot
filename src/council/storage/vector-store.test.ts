import { describe, it, expect, beforeEach } from 'bun:test';
import {
  VectorStore,
  VectorEntry,
  SimilarityResult,
  MockVectorStore,
  createVectorStore,
} from './vector-store';

describe('VectorStore - Mock Implementation', () => {
  let vectorStore: VectorStore;

  beforeEach(async () => {
    vectorStore = createVectorStore();
    await vectorStore.clear();
  });

  describe('initialize()', () => {
    it('should complete without error', async () => {
      await expect(vectorStore.initialize()).resolves.toBeUndefined();
    });
  });

  describe('addMemory()', () => {
    it('should return an embedding ID', async () => {
      const embeddingId = await vectorStore.addMemory(
        'mem_1',
        'agent_1',
        'This is test content'
      );

      expect(embeddingId).toBeDefined();
      expect(typeof embeddingId).toBe('string');
      expect(embeddingId.startsWith('emb_')).toBe(true);
    });

    it('should store memory with correct agentId', async () => {
      const embeddingId = await vectorStore.addMemory(
        'mem_1',
        'agent_1',
        'Test content'
      );

      const results = await vectorStore.querySimilar('agent_1', 'Test', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memoryId).toBe(embeddingId);
    });

    it('should allow multiple memories per agent', async () => {
      const id1 = await vectorStore.addMemory('mem_1', 'agent_1', 'First memory');
      const id2 = await vectorStore.addMemory('mem_2', 'agent_1', 'Second memory');

      expect(id1).not.toBe(id2);

      const results = await vectorStore.querySimilar('agent_1', 'memory', 10);
      expect(results.length).toBe(2);
    });
  });

  describe('querySimilar()', () => {
    beforeEach(async () => {
      await vectorStore.addMemory('mem_1', 'agent_1', 'The quick brown fox jumps');
      await vectorStore.addMemory('mem_2', 'agent_1', 'The lazy dog sleeps');
      await vectorStore.addMemory('mem_3', 'agent_2', 'The quick brown fox runs');
    });

    it('should return results sorted by similarity (highest first)', async () => {
      const results = await vectorStore.querySimilar('agent_1', 'quick fox', 10);

      expect(results.length).toBeGreaterThan(0);
      // First result should be more similar than second
      if (results.length > 1) {
        expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
      }
    });

    it('should filter results by agentId', async () => {
      const agent1Results = await vectorStore.querySimilar('agent_1', 'quick', 10);
      const agent2Results = await vectorStore.querySimilar('agent_2', 'quick', 10);

      expect(agent1Results.length).toBe(2);
      expect(agent2Results.length).toBe(1);
    });

    it('should respect limit parameter', async () => {
      const results = await vectorStore.querySimilar('agent_1', 'the', 1);
      expect(results.length).toBe(1);

      const allResults = await vectorStore.querySimilar('agent_1', 'the', 10);
      expect(allResults.length).toBe(2);
    });

    it('should return empty array when no matches for agentId', async () => {
      const results = await vectorStore.querySimilar('agent_999', 'quick', 10);
      expect(results.length).toBe(0);
    });

    it('should calculate similarity based on keyword overlap', async () => {
      // mem_1: "The quick brown fox jumps"
      // mem_2: "The lazy dog sleeps"
      // Query: "quick fox" should match mem_1 better than mem_2

      const results = await vectorStore.querySimilar('agent_1', 'quick fox', 10);

      expect(results.length).toBe(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('should return similarity scores between 0 and 1', async () => {
      const results = await vectorStore.querySimilar('agent_1', 'quick', 10);

      results.forEach((result) => {
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('deleteMemory()', () => {
    it('should remove the entry', async () => {
      const embeddingId = await vectorStore.addMemory(
        'mem_1',
        'agent_1',
        'Test content'
      );

      let results = await vectorStore.querySimilar('agent_1', 'Test', 10);
      expect(results.length).toBe(1);

      await vectorStore.deleteMemory(embeddingId);

      results = await vectorStore.querySimilar('agent_1', 'Test', 10);
      expect(results.length).toBe(0);
    });

    it('should not affect other entries', async () => {
      const id1 = await vectorStore.addMemory('mem_1', 'agent_1', 'First');
      const id2 = await vectorStore.addMemory('mem_2', 'agent_1', 'Second');

      await vectorStore.deleteMemory(id1);

      const results = await vectorStore.querySimilar('agent_1', 'Second', 10);
      expect(results.length).toBe(1);
      expect(results[0].memoryId).toBe(id2);
    });
  });

  describe('clear()', () => {
    it('should remove all entries', async () => {
      await vectorStore.addMemory('mem_1', 'agent_1', 'Content 1');
      await vectorStore.addMemory('mem_2', 'agent_1', 'Content 2');
      await vectorStore.addMemory('mem_3', 'agent_2', 'Content 3');

      let results1 = await vectorStore.querySimilar('agent_1', 'Content', 10);
      let results2 = await vectorStore.querySimilar('agent_2', 'Content', 10);
      expect(results1.length + results2.length).toBe(3);

      await vectorStore.clear();

      results1 = await vectorStore.querySimilar('agent_1', 'Content', 10);
      results2 = await vectorStore.querySimilar('agent_2', 'Content', 10);
      expect(results1.length + results2.length).toBe(0);
    });
  });

  describe('Similarity Scoring', () => {
    it('should give higher scores to more similar content', async () => {
      await vectorStore.addMemory('mem_1', 'agent_1', 'apple banana cherry');
      await vectorStore.addMemory('mem_2', 'agent_1', 'apple banana date');
      await vectorStore.addMemory('mem_3', 'agent_1', 'dog cat bird');

      const results = await vectorStore.querySimilar('agent_1', 'apple banana', 10);

      // Results should be sorted by similarity
      expect(results[0].similarity).toBeGreaterThan(results[2].similarity);
    });

    it('should handle empty query gracefully', async () => {
      await vectorStore.addMemory('mem_1', 'agent_1', 'test content');

      const results = await vectorStore.querySimilar('agent_1', '', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle single-word queries', async () => {
      await vectorStore.addMemory('mem_1', 'agent_1', 'hello world');
      await vectorStore.addMemory('mem_2', 'agent_1', 'goodbye world');

      const results = await vectorStore.querySimilar('agent_1', 'hello', 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
