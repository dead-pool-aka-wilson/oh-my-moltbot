import { describe, it, expect } from 'bun:test';
import type { AgentDisposition } from '../types';
import {
  scoreAgainstDisposition,
  analyzeSentiment,
  assessNovelty,
  assessRisk,
  assessPriorityAlignment,
} from './disposition-scorer';

describe('Disposition Scorer', () => {
  // Sample dispositions for testing
  const pragmatistDisposition: AgentDisposition = {
    orientation: 'Pragmatist',
    filterCriteria: {
      keywords: ['cost', 'efficiency', 'practical', 'proven'],
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
      vocabulary: ['practical', 'efficient', 'proven'],
    },
  };

  const explorerDisposition: AgentDisposition = {
    orientation: 'Explorer',
    filterCriteria: {
      keywords: ['innovative', 'novel', 'experimental', 'cutting-edge'],
      sentimentBias: 'positive',
      noveltyPreference: 'high',
      riskTolerance: 'high',
    },
    priorities: {
      cost: 0.1,
      quality: 0.2,
      novelty: 0.5,
      reliability: 0.2,
    },
    voice: {
      tone: 'enthusiastic',
      vocabulary: ['innovative', 'exciting', 'breakthrough'],
    },
  };

  describe('scoreAgainstDisposition', () => {
    it('should return a value between 0 and 1', () => {
      const content = 'This is a test content';
      const score = scoreAgainstDisposition(content, pragmatistDisposition);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score higher when content matches disposition keywords', () => {
      const pragmaticContent = 'This is a cost-effective and proven solution';
      const score = scoreAgainstDisposition(pragmaticContent, pragmatistDisposition);
      expect(score).toBeGreaterThan(0.1);
    });

    it('should score differently for different dispositions on same content', () => {
      const content = 'This is an innovative and cutting-edge approach';
      const pragmaticScore = scoreAgainstDisposition(content, pragmatistDisposition);
      const explorerScore = scoreAgainstDisposition(content, explorerDisposition);
      expect(pragmaticScore).not.toEqual(explorerScore);
      expect(explorerScore).toBeGreaterThan(pragmaticScore);
    });

    it('should never exceed 1.0', () => {
      const content =
        'This is a cost-effective proven practical efficient solution with excellent quality and amazing innovation';
      const score = scoreAgainstDisposition(content, pragmatistDisposition);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle empty content', () => {
      const score = scoreAgainstDisposition('', pragmatistDisposition);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score pragmatist higher for cost-focused content', () => {
      const costContent = 'We need to reduce costs and improve efficiency';
      const score = scoreAgainstDisposition(costContent, pragmatistDisposition);
      expect(score).toBeGreaterThan(0.15);
    });

    it('should score explorer higher for novelty-focused content', () => {
      const noveltyContent = 'This is a revolutionary and innovative breakthrough';
      const score = scoreAgainstDisposition(noveltyContent, explorerDisposition);
      expect(score).toBeGreaterThan(0.15);
    });
  });

  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      const sentiment = analyzeSentiment('This is great and amazing');
      expect(sentiment).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      const sentiment = analyzeSentiment('This is terrible and awful');
      expect(sentiment).toBe('negative');
    });

    it('should detect neutral sentiment', () => {
      const sentiment = analyzeSentiment('This is a regular sentence');
      expect(sentiment).toBe('neutral');
    });

    it('should handle mixed sentiment with more positive words', () => {
      const sentiment = analyzeSentiment('Good and bad but excellent overall');
      expect(sentiment).toBe('positive');
    });

    it('should handle mixed sentiment with more negative words', () => {
      const sentiment = analyzeSentiment('Great but terrible and awful');
      expect(sentiment).toBe('negative');
    });
  });

  describe('assessNovelty', () => {
    it('should return high novelty score for novel content', () => {
      const score = assessNovelty('This is a new and innovative approach');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return low novelty score for traditional content', () => {
      const score = assessNovelty('This is a classic and proven method');
      expect(score).toBeLessThan(0.5);
    });

    it('should return neutral score for balanced content', () => {
      const score = assessNovelty('This is a new traditional approach');
      expect(score).toBeCloseTo(0.5, 0.1);
    });

    it('should return 0.5 for content with no novelty indicators', () => {
      const score = assessNovelty('This is a regular sentence');
      expect(score).toBe(0.5);
    });

    it('should return value between 0 and 1', () => {
      const score = assessNovelty('Any content here');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('assessRisk', () => {
    it('should return high risk score for risky content', () => {
      const score = assessRisk('This is a bold and experimental approach');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return low risk score for safe content', () => {
      const score = assessRisk('This is a safe and proven method');
      expect(score).toBeLessThan(0.5);
    });

    it('should return neutral score for balanced content', () => {
      const score = assessRisk('This is a risky safe approach');
      expect(score).toBeCloseTo(0.5, 0.1);
    });

    it('should return 0.5 for content with no risk indicators', () => {
      const score = assessRisk('This is a regular sentence');
      expect(score).toBe(0.5);
    });

    it('should return value between 0 and 1', () => {
      const score = assessRisk('Any content here');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('assessPriorityAlignment', () => {
    it('should score high when content aligns with cost priority', () => {
      const priorities = { cost: 0.5, quality: 0.2, novelty: 0.1, reliability: 0.2 };
      const score = assessPriorityAlignment('We need to reduce costs and budget', priorities);
      expect(score).toBeGreaterThan(0);
    });

    it('should score high when content aligns with quality priority', () => {
      const priorities = { cost: 0.1, quality: 0.6, novelty: 0.1, reliability: 0.2 };
      const score = assessPriorityAlignment('This is premium quality and excellent', priorities);
      expect(score).toBeGreaterThan(0);
    });

    it('should score high when content aligns with novelty priority', () => {
      const priorities = { cost: 0.1, quality: 0.2, novelty: 0.6, reliability: 0.1 };
      const score = assessPriorityAlignment('This is new and innovative and latest', priorities);
      expect(score).toBeGreaterThan(0);
    });

    it('should score high when content aligns with reliability priority', () => {
      const priorities = { cost: 0.1, quality: 0.2, novelty: 0.1, reliability: 0.6 };
      const score = assessPriorityAlignment('This is reliable and proven and trusted', priorities);
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 when content does not align with any priority', () => {
      const priorities = { cost: 0.1, quality: 0.1, novelty: 0.1, reliability: 0.1 };
      const score = assessPriorityAlignment('Random unrelated content', priorities);
      expect(score).toBe(0);
    });

    it('should return value between 0 and 1', () => {
      const priorities = { cost: 0.25, quality: 0.25, novelty: 0.25, reliability: 0.25 };
      const score = assessPriorityAlignment('Any content here', priorities);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should ignore priorities with low weights', () => {
      const priorities = { cost: 0.05, quality: 0.05, novelty: 0.05, reliability: 0.05 };
      const score = assessPriorityAlignment('This is very expensive and costly', priorities);
      expect(score).toBe(0);
    });
  });

  describe('Integration tests', () => {
    it('should score pragmatist higher for practical, cost-focused content', () => {
      const content =
        'We should use proven technologies to reduce costs and improve efficiency';
      const pragmaticScore = scoreAgainstDisposition(content, pragmatistDisposition);
      const explorerScore = scoreAgainstDisposition(content, explorerDisposition);
      expect(pragmaticScore).toBeGreaterThan(explorerScore);
    });

    it('should score explorer higher for innovative, novel content', () => {
      const content =
        'We should experiment with cutting-edge technologies and innovative approaches';
      const pragmaticScore = scoreAgainstDisposition(content, pragmatistDisposition);
      const explorerScore = scoreAgainstDisposition(content, explorerDisposition);
      expect(explorerScore).toBeGreaterThan(pragmaticScore);
    });

    it('should handle complex content with mixed signals', () => {
      const content =
        'This innovative solution is cost-effective and proven, with excellent quality';
      const pragmaticScore = scoreAgainstDisposition(content, pragmatistDisposition);
      const explorerScore = scoreAgainstDisposition(content, explorerDisposition);
      expect(pragmaticScore).toBeGreaterThan(0);
      expect(explorerScore).toBeGreaterThan(0);
    });
  });
});
