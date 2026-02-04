import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initCouncilDb } from '../db';
import { setDb as setStorageDb } from '../storage/council-db';
import { CouncilRouter } from './council-router';

describe('CouncilRouter', () => {
  let router: CouncilRouter;
  let db: Database;

  beforeEach(() => {
    db = initCouncilDb(':memory:');
    setStorageDb(db);
    router = new CouncilRouter();
  });

  afterEach(() => {
    db.close();
  });

  describe('classifyDomain', () => {
    it('should classify food/restaurant prompts as lifestyle', () => {
      const result = router.classifyDomain('Where should I eat dinner? I love good restaurants.');
      expect(result.domain).toBe('lifestyle');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify design/branding prompts as creative', () => {
      const result = router.classifyDomain('Help me design a logo and choose a color palette for my brand.');
      expect(result.domain).toBe('creative');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify career/life prompts as direction', () => {
      const result = router.classifyDomain('Should I take this new job offer? It would change my career path.');
      expect(result.domain).toBe('direction');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return default (lifestyle) for ambiguous prompts', () => {
      const result = router.classifyDomain('What is the weather today?');
      expect(result.domain).toBe('lifestyle');
    });

    it('should return confidence score between 0 and 1', () => {
      const result = router.classifyDomain('I want to buy a new coffee maker.');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include reasoning in classification result', () => {
      const result = router.classifyDomain('Design a website layout.');
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('route', () => {
    it('should create a debate session when routing', async () => {
      const result = await router.route('Where should I eat?');
      expect(result.session).toBeDefined();
      expect(result.session.id).toBeDefined();
      expect(result.session.userPrompt).toBe('Where should I eat?');
      expect(result.session.phase).toBe('position');
    });

    it('should respect explicit council parameter', async () => {
      const result = await router.route('Some prompt', 'creative');
      expect(result.council.domain).toBe('creative');
    });

    it('should initialize council if not exists', async () => {
      const result = await router.route('Design something', 'creative');
      expect(result.council).toBeDefined();
      expect(result.council.id).toBeDefined();
      expect(result.council.domain).toBe('creative');
      expect(result.council.name).toBe('Creative');
    });

    it('should return active agents for council', async () => {
      const result = await router.route('Design something', 'creative');
      expect(result.agents).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
      result.agents.forEach((agent: any) => {
        expect(agent.isActive).toBe(true);
      });
    });

    it('should initialize council with 4 agents', async () => {
      const result = await router.route('Design something', 'creative');
      expect(result.agents.length).toBe(4);
    });
  });

  describe('getCouncils', () => {
    it('should return empty array initially', () => {
      const councils = router.getCouncils();
      expect(Array.isArray(councils)).toBe(true);
      expect(councils.length).toBe(0);
    });

    it('should return councils after routing', async () => {
      await router.route('Design something', 'creative');
      const councils = router.getCouncils();
      expect(councils.length).toBeGreaterThan(0);
    });
  });
});
