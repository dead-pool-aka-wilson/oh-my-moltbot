import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  runCouncil,
  getCouncilStatus,
  formatDebateResult,
  parseCouncilCommand,
} from './index';
import type { DebateRequest, DebateResult, CouncilDomain } from './types';
import { setDb } from './storage/council-db';
import { initCouncilDb } from './db';

describe('Council Plugin Integration', () => {
  let testDb: any;

  beforeEach(() => {
    // Use in-memory database for tests
    testDb = initCouncilDb(':memory:');
    setDb(testDb);
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
  });

  describe('runCouncil', () => {
    it('should return a valid DebateResult', async () => {
      const request: DebateRequest = {
        prompt: 'Should I try the new restaurant downtown?',
      };

      const result = await runCouncil(request);

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.council).toBeDefined();
      expect(result.phases).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should route to correct council based on prompt', async () => {
      const lifestyleRequest: DebateRequest = {
        prompt: 'Should I buy this new coffee maker?',
      };

      const result = await runCouncil(lifestyleRequest);

      expect(result.council).toBe('lifestyle');
    });

    it('should route to explicit council when specified', async () => {
      const request: DebateRequest = {
        prompt: 'What should I do?',
        council: 'creative',
      };

      const result = await runCouncil(request);

      expect(result.council).toBe('creative');
    });

    it('should include all debate phases in result', async () => {
      const request: DebateRequest = {
        prompt: 'Should I change careers?',
      };

      const result = await runCouncil(request);

      expect(result.phases.positions).toBeDefined();
      expect(Array.isArray(result.phases.positions)).toBe(true);
      expect(result.phases.challenges).toBeDefined();
      expect(Array.isArray(result.phases.challenges)).toBe(true);
      expect(result.phases.synthesis).toBeDefined();
      expect(typeof result.phases.synthesis).toBe('string');
    });

    it('should pass options to debate engine', async () => {
      const request: DebateRequest = {
        prompt: 'Design a new logo',
        options: {
          verbose: true,
          includeAncestors: true,
        },
      };

      const result = await runCouncil(request);

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('getCouncilStatus', () => {
    it('should return a status object with councils array', () => {
      const status = getCouncilStatus();

      expect(status).toBeDefined();
      expect(status.councils).toBeDefined();
      expect(Array.isArray(status.councils)).toBe(true);
    });

    it('should include council metadata in status', () => {
      const status = getCouncilStatus();

      if (status.councils.length > 0) {
        const council = status.councils[0];
        expect(council.domain).toBeDefined();
        expect(council.name).toBeDefined();
        expect(typeof council.agentCount).toBe('number');
        expect(typeof council.activeAgents).toBe('number');
      }
    });

    it('should include total debates count', () => {
      const status = getCouncilStatus();

      expect(typeof status.totalDebates).toBe('number');
      expect(status.totalDebates).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatDebateResult', () => {
    let mockResult: DebateResult;

    beforeEach(() => {
      mockResult = {
        sessionId: 'session_123',
        council: 'lifestyle',
        phases: {
          positions: [
            {
              agentId: 'agent_1',
              agentName: 'Pragmatist',
              position: 'We should go with the budget option',
              keyPoints: ['Cost-effective', 'Proven track record'],
              relevantMemories: [],
            },
            {
              agentId: 'agent_2',
              agentName: 'Innovator',
              position: 'We should try the premium option',
              keyPoints: ['Better features', 'Latest technology'],
              relevantMemories: [],
            },
          ],
          challenges: [
            {
              challengerId: 'agent_2',
              challengerName: 'Innovator',
              targetId: 'agent_1',
              targetName: 'Pragmatist',
              challenge: 'Budget option lacks modern features',
              counterPoints: ['Missing AI integration', 'Outdated interface'],
            },
          ],
          synthesis:
            'Consider a middle-ground approach that balances cost and features.',
        },
        recommendation: 'Go with the mid-tier option',
        confidence: 0.75,
        memoriesCreated: 2,
      };
    });

    it('should produce readable formatted output', () => {
      const formatted = formatDebateResult(mockResult);

      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should include council name in output', () => {
      const formatted = formatDebateResult(mockResult);

      expect(formatted).toContain('COUNCIL');
      expect(formatted).toContain('Lifestyle');
    });

    it('should include all debate phases in output', () => {
      const formatted = formatDebateResult(mockResult);

      expect(formatted).toContain('PHASE 1');
      expect(formatted).toContain('POSITIONS');
      expect(formatted).toContain('PHASE 2');
      expect(formatted).toContain('CHALLENGES');
      expect(formatted).toContain('PHASE 3');
      expect(formatted).toContain('SYNTHESIS');
    });

    it('should include agent positions with key points', () => {
      const formatted = formatDebateResult(mockResult);

      expect(formatted).toContain('Pragmatist');
      expect(formatted).toContain('Innovator');
      expect(formatted).toContain('Cost-effective');
      expect(formatted).toContain('Better features');
    });

    it('should include confidence percentage', () => {
      const formatted = formatDebateResult(mockResult);

      expect(formatted).toContain('CONFIDENCE');
      expect(formatted).toContain('75');
    });

    it('should include session ID', () => {
      const formatted = formatDebateResult(mockResult);

      expect(formatted).toContain('session_123');
    });
  });

  describe('parseCouncilCommand', () => {
    it('should extract prompt from /council command', () => {
      const input = '/council Should I buy this new laptop?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe('Should I buy this new laptop?');
    });

    it('should extract explicit council with -c flag', () => {
      const input = '/council -c creative Design a new logo';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.council).toBe('creative');
      expect(result?.prompt).toContain('Design a new logo');
    });

    it('should extract explicit council with --council flag', () => {
      const input = '/council --council direction Should I change jobs?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.council).toBe('direction');
    });

    it('should extract verbose flag', () => {
      const input = '/council -v Should I try this restaurant?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.options?.verbose).toBe(true);
    });

    it('should extract ancestors flag', () => {
      const input = '/council -a Should I buy this?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.options?.includeAncestors).toBe(true);
    });

    it('should handle multiple flags together', () => {
      const input = '/council -c lifestyle -v -a Should I go to this place?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.council).toBe('lifestyle');
      expect(result?.options?.verbose).toBe(true);
      expect(result?.options?.includeAncestors).toBe(true);
    });

    it('should return null for empty input', () => {
      const input = '/council';
      const result = parseCouncilCommand(input);

      expect(result).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const input = '/council   ';
      const result = parseCouncilCommand(input);

      expect(result).toBeNull();
    });

    it('should handle input without /council prefix', () => {
      const input = 'Should I buy this?';
      const result = parseCouncilCommand(input);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe('Should I buy this?');
    });
  });

  describe('Exports', () => {
    it('should export all necessary types', async () => {
      const module = await import('./index');

      expect(module.runCouncil).toBeDefined();
      expect(module.getCouncilStatus).toBeDefined();
      expect(module.formatDebateResult).toBeDefined();
      expect(module.parseCouncilCommand).toBeDefined();
    });

    it('should re-export types from types module', async () => {
      const module = await import('./index');

      // Check that types are available
      expect(module).toBeDefined();
    });

    it('should re-export councilRouter', async () => {
      const module = await import('./index');

      expect(module.councilRouter).toBeDefined();
    });

    it('should re-export debateEngine', async () => {
      const module = await import('./index');

      expect(module.debateEngine).toBeDefined();
    });

    it('should re-export MemoryManager class', async () => {
      const module = await import('./index');

      expect(module.MemoryManager).toBeDefined();
    });

    it('should re-export generationManager', async () => {
      const module = await import('./index');

      expect(module.generationManager).toBeDefined();
    });
  });
});
