import { describe, it, expect } from 'bun:test';
import { councilConfig } from './councils';
import type { CouncilConfig, CouncilDefinition, AgentDefinition } from '../types';

describe('Council Configuration - 12 Agent Dispositions', () => {
  describe('Config Structure', () => {
    it('should export councilConfig', () => {
      expect(councilConfig).toBeDefined();
      expect(typeof councilConfig).toBe('object');
    });

    it('should have exactly 3 councils', () => {
      expect(councilConfig.councils).toBeDefined();
      expect(councilConfig.councils.length).toBe(3);
    });

    it('should have councils with correct domains', () => {
      const domains = councilConfig.councils.map((c) => c.domain);
      expect(domains).toContain('lifestyle');
      expect(domains).toContain('creative');
      expect(domains).toContain('direction');
    });
  });

  describe('Council A: Lifestyle', () => {
    let lifestyleCouncil: CouncilDefinition;

    it('should find lifestyle council', () => {
      lifestyleCouncil = councilConfig.councils.find((c) => c.domain === 'lifestyle')!;
      expect(lifestyleCouncil).toBeDefined();
      expect(lifestyleCouncil.name).toBe('Lifestyle');
      expect(lifestyleCouncil.description).toContain('Daily choices');
    });

    it('should have exactly 4 agents', () => {
      expect(lifestyleCouncil.agents.length).toBe(4);
    });

    it('should have Pragmatist agent with correct disposition', () => {
      const pragmatist = lifestyleCouncil.agents.find((a) => a.name === 'Pragmatist')!;
      expect(pragmatist).toBeDefined();
      expect(pragmatist.disposition.orientation).toBe('Optimizes for cost-efficiency and practical utility');
      expect(pragmatist.disposition.voice.tone).toBe('Analytical');
      expect(pragmatist.disposition.voice.vocabulary).toContain('practical');
    });

    it('should have Aesthete agent with correct disposition', () => {
      const aesthete = lifestyleCouncil.agents.find((a) => a.name === 'Aesthete')!;
      expect(aesthete).toBeDefined();
      expect(aesthete.disposition.orientation).toContain('visual quality');
      expect(aesthete.disposition.voice.tone).toBe('Enthusiastic');
    });

    it('should have Explorer agent with correct disposition', () => {
      const explorer = lifestyleCouncil.agents.find((a) => a.name === 'Explorer')!;
      expect(explorer).toBeDefined();
      expect(explorer.disposition.orientation).toContain('novelty');
      expect(explorer.disposition.voice.tone).toBe('Curious');
    });

    it('should have Anchor agent with correct disposition', () => {
      const anchor = lifestyleCouncil.agents.find((a) => a.name === 'Anchor')!;
      expect(anchor).toBeDefined();
      expect(anchor.disposition.orientation).toContain('proven');
      expect(anchor.disposition.voice.tone).toBe('Cautious');
    });
  });

  describe('Council B: Creative', () => {
    let creativeCouncil: CouncilDefinition;

    it('should find creative council', () => {
      creativeCouncil = councilConfig.councils.find((c) => c.domain === 'creative')!;
      expect(creativeCouncil).toBeDefined();
      expect(creativeCouncil.name).toBe('Creative');
      expect(creativeCouncil.description.toLowerCase()).toContain('artistic');
    });

    it('should have exactly 4 agents', () => {
      expect(creativeCouncil.agents.length).toBe(4);
    });

    it('should have Minimalist agent with correct disposition', () => {
      const minimalist = creativeCouncil.agents.find((a) => a.name === 'Minimalist')!;
      expect(minimalist).toBeDefined();
      expect(minimalist.disposition.orientation).toContain('Less is more');
      expect(minimalist.disposition.voice.tone).toBe('Sparse');
    });

    it('should have Maximalist agent with correct disposition', () => {
      const maximalist = creativeCouncil.agents.find((a) => a.name === 'Maximalist')!;
      expect(maximalist).toBeDefined();
      expect(maximalist.disposition.orientation).toContain('More is more');
      expect(maximalist.disposition.voice.tone).toBe('Exuberant');
    });

    it('should have Traditionalist agent with correct disposition', () => {
      const traditionalist = creativeCouncil.agents.find((a) => a.name === 'Traditionalist')!;
      expect(traditionalist).toBeDefined();
      expect(traditionalist.disposition.orientation).toContain('established conventions');
      expect(traditionalist.disposition.voice.tone).toBe('Reverent');
    });

    it('should have Avant-garde agent with correct disposition', () => {
      const avantGarde = creativeCouncil.agents.find((a) => a.name === 'Avant-garde')!;
      expect(avantGarde).toBeDefined();
      expect(avantGarde.disposition.orientation).toContain('boundaries');
      expect(avantGarde.disposition.voice.tone).toBe('Provocative');
    });
  });

  describe('Council C: Direction', () => {
    let directionCouncil: CouncilDefinition;

    it('should find direction council', () => {
      directionCouncil = councilConfig.councils.find((c) => c.domain === 'direction')!;
      expect(directionCouncil).toBeDefined();
      expect(directionCouncil.name).toBe('Direction');
      expect(directionCouncil.description.toLowerCase()).toContain('path');
    });

    it('should have exactly 4 agents', () => {
      expect(directionCouncil.agents.length).toBe(4);
    });

    it('should have Strategist agent with correct disposition', () => {
      const strategist = directionCouncil.agents.find((a) => a.name === 'Strategist')!;
      expect(strategist).toBeDefined();
      expect(strategist.disposition.orientation).toContain('Long-term planning');
      expect(strategist.disposition.voice.tone).toBe('Deliberate');
    });

    it('should have Opportunist agent with correct disposition', () => {
      const opportunist = directionCouncil.agents.find((a) => a.name === 'Opportunist')!;
      expect(opportunist).toBeDefined();
      expect(opportunist.disposition.orientation).toContain('Seize the moment');
      expect(opportunist.disposition.voice.tone).toBe('Urgent');
    });

    it('should have Conservative agent with correct disposition', () => {
      const conservative = directionCouncil.agents.find((a) => a.name === 'Conservative')!;
      expect(conservative).toBeDefined();
      expect(conservative.disposition.orientation).toContain('Preserve');
      expect(conservative.disposition.voice.tone).toBe('Prudent');
    });

    it('should have Intuitive agent with correct disposition', () => {
      const intuitive = directionCouncil.agents.find((a) => a.name === 'Intuitive')!;
      expect(intuitive).toBeDefined();
      expect(intuitive.disposition.orientation).toContain('Trust your gut');
      expect(intuitive.disposition.voice.tone).toBe('Reflective');
    });
  });

  describe('Priority Validation', () => {
    it('should have all 12 agents with valid priorities', () => {
      let agentCount = 0;
      councilConfig.councils.forEach((council) => {
        council.agents.forEach((agent) => {
          agentCount++;
          const priorities = agent.disposition.priorities;
          const sum = priorities.cost + priorities.quality + priorities.novelty + priorities.reliability;
          expect(sum).toBeCloseTo(1.0, 2); // ±0.01 tolerance
        });
      });
      expect(agentCount).toBe(12);
    });

    it('Pragmatist should have priorities [0.4, 0.3, 0.1, 0.2]', () => {
      const pragmatist = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Pragmatist')!;
      const p = pragmatist.disposition.priorities;
      expect(p.cost).toBe(0.4);
      expect(p.quality).toBe(0.3);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.2);
    });

    it('Aesthete should have priorities [0.1, 0.5, 0.2, 0.2]', () => {
      const aesthete = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Aesthete')!;
      const p = aesthete.disposition.priorities;
      expect(p.cost).toBe(0.1);
      expect(p.quality).toBe(0.5);
      expect(p.novelty).toBe(0.2);
      expect(p.reliability).toBe(0.2);
    });

    it('Explorer should have priorities [0.1, 0.2, 0.5, 0.2]', () => {
      const explorer = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Explorer')!;
      const p = explorer.disposition.priorities;
      expect(p.cost).toBe(0.1);
      expect(p.quality).toBe(0.2);
      expect(p.novelty).toBe(0.5);
      expect(p.reliability).toBe(0.2);
    });

    it('Anchor should have priorities [0.2, 0.2, 0.1, 0.5]', () => {
      const anchor = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Anchor')!;
      const p = anchor.disposition.priorities;
      expect(p.cost).toBe(0.2);
      expect(p.quality).toBe(0.2);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.5);
    });

    it('Minimalist should have priorities [0.3, 0.4, 0.1, 0.2]', () => {
      const minimalist = councilConfig.councils
        .find((c) => c.domain === 'creative')!
        .agents.find((a) => a.name === 'Minimalist')!;
      const p = minimalist.disposition.priorities;
      expect(p.cost).toBe(0.3);
      expect(p.quality).toBe(0.4);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.2);
    });

    it('Maximalist should have priorities [0.1, 0.3, 0.4, 0.2]', () => {
      const maximalist = councilConfig.councils
        .find((c) => c.domain === 'creative')!
        .agents.find((a) => a.name === 'Maximalist')!;
      const p = maximalist.disposition.priorities;
      expect(p.cost).toBe(0.1);
      expect(p.quality).toBe(0.3);
      expect(p.novelty).toBe(0.4);
      expect(p.reliability).toBe(0.2);
    });

    it('Traditionalist should have priorities [0.2, 0.3, 0.1, 0.4]', () => {
      const traditionalist = councilConfig.councils
        .find((c) => c.domain === 'creative')!
        .agents.find((a) => a.name === 'Traditionalist')!;
      const p = traditionalist.disposition.priorities;
      expect(p.cost).toBe(0.2);
      expect(p.quality).toBe(0.3);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.4);
    });

    it('Avant-garde should have priorities [0.1, 0.2, 0.5, 0.2]', () => {
      const avantGarde = councilConfig.councils
        .find((c) => c.domain === 'creative')!
        .agents.find((a) => a.name === 'Avant-garde')!;
      const p = avantGarde.disposition.priorities;
      expect(p.cost).toBe(0.1);
      expect(p.quality).toBe(0.2);
      expect(p.novelty).toBe(0.5);
      expect(p.reliability).toBe(0.2);
    });

    it('Strategist should have priorities [0.2, 0.4, 0.1, 0.3]', () => {
      const strategist = councilConfig.councils
        .find((c) => c.domain === 'direction')!
        .agents.find((a) => a.name === 'Strategist')!;
      const p = strategist.disposition.priorities;
      expect(p.cost).toBe(0.2);
      expect(p.quality).toBe(0.4);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.3);
    });

    it('Opportunist should have priorities [0.2, 0.2, 0.4, 0.2]', () => {
      const opportunist = councilConfig.councils
        .find((c) => c.domain === 'direction')!
        .agents.find((a) => a.name === 'Opportunist')!;
      const p = opportunist.disposition.priorities;
      expect(p.cost).toBe(0.2);
      expect(p.quality).toBe(0.2);
      expect(p.novelty).toBe(0.4);
      expect(p.reliability).toBe(0.2);
    });

    it('Conservative should have priorities [0.3, 0.2, 0.1, 0.4]', () => {
      const conservative = councilConfig.councils
        .find((c) => c.domain === 'direction')!
        .agents.find((a) => a.name === 'Conservative')!;
      const p = conservative.disposition.priorities;
      expect(p.cost).toBe(0.3);
      expect(p.quality).toBe(0.2);
      expect(p.novelty).toBe(0.1);
      expect(p.reliability).toBe(0.4);
    });

    it('Intuitive should have priorities [0.1, 0.3, 0.3, 0.3]', () => {
      const intuitive = councilConfig.councils
        .find((c) => c.domain === 'direction')!
        .agents.find((a) => a.name === 'Intuitive')!;
      const p = intuitive.disposition.priorities;
      expect(p.cost).toBe(0.1);
      expect(p.quality).toBe(0.3);
      expect(p.novelty).toBe(0.3);
      expect(p.reliability).toBe(0.3);
    });
  });

  describe('Required Fields', () => {
    it('should have all required fields on each agent', () => {
      councilConfig.councils.forEach((council) => {
        expect(council.domain).toBeDefined();
        expect(council.name).toBeDefined();
        expect(council.description).toBeDefined();
        expect(council.agents).toBeDefined();

        council.agents.forEach((agent) => {
          expect(agent.name).toBeDefined();
          expect(agent.disposition).toBeDefined();
          expect(agent.disposition.orientation).toBeDefined();
          expect(agent.disposition.priorities).toBeDefined();
          expect(agent.disposition.voice).toBeDefined();
          expect(agent.disposition.voice.tone).toBeDefined();
          expect(agent.disposition.voice.vocabulary).toBeDefined();
          expect(Array.isArray(agent.disposition.voice.vocabulary)).toBe(true);
        });
      });
    });
  });

  describe('Voice Vocabulary', () => {
    it('Pragmatist should have practical vocabulary', () => {
      const pragmatist = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Pragmatist')!;
      const vocab = pragmatist.disposition.voice.vocabulary;
      expect(vocab.length).toBeGreaterThan(0);
      expect(vocab.some((v) => v.includes('practical') || v.includes('efficient') || v.includes('proven'))).toBe(true);
    });

    it('Aesthete should have sensory vocabulary', () => {
      const aesthete = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Aesthete')!;
      const vocab = aesthete.disposition.voice.vocabulary;
      expect(vocab.length).toBeGreaterThan(0);
    });

    it('Explorer should have discovery vocabulary', () => {
      const explorer = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Explorer')!;
      const vocab = explorer.disposition.voice.vocabulary;
      expect(vocab.length).toBeGreaterThan(0);
    });

    it('Anchor should have stability vocabulary', () => {
      const anchor = councilConfig.councils
        .find((c) => c.domain === 'lifestyle')!
        .agents.find((a) => a.name === 'Anchor')!;
      const vocab = anchor.disposition.voice.vocabulary;
      expect(vocab.length).toBeGreaterThan(0);
    });
  });
});
