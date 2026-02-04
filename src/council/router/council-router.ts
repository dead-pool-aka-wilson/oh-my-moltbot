import type { Council, Agent, DebateSession, CouncilDomain } from '../types';
import { councilDb, agentDb, debateSessionDb } from '../storage/council-db';

const DOMAIN_KEYWORDS: Record<CouncilDomain, string[]> = {
  lifestyle: [
    'food', 'restaurant', 'eat', 'drink', 'coffee', 'bar',
    'fashion', 'clothes', 'wear', 'style', 'outfit',
    'place', 'visit', 'travel', 'hotel', 'vacation',
    'buy', 'purchase', 'shop', 'product', 'price',
    'daily', 'routine', 'habit', 'activity'
  ],
  creative: [
    'design', 'color', 'palette', 'font', 'typography',
    'write', 'writing', 'copy', 'content', 'story',
    'brand', 'branding', 'logo', 'visual', 'aesthetic',
    'art', 'artistic', 'creative', 'style', 'layout',
    'portfolio', 'project', 'presentation'
  ],
  direction: [
    'career', 'job', 'work', 'profession', 'role',
    'relationship', 'partner', 'friend', 'family',
    'life', 'future', 'goal', 'path', 'decision',
    'value', 'priority', 'important', 'meaning',
    'change', 'move', 'opportunity', 'offer', 'accept'
  ],
};

export interface RouteResult {
  council: Council;
  agents: Agent[];
  session: DebateSession;
}

export interface ClassificationResult {
  domain: CouncilDomain;
  confidence: number;
  reasoning: string;
}

export class CouncilRouter {
  classifyDomain(prompt: string): ClassificationResult {
    const lowerPrompt = prompt.toLowerCase();
    const scores: Record<CouncilDomain, number> = {
      lifestyle: 0,
      creative: 0,
      direction: 0,
    };

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerPrompt.includes(keyword)) {
          scores[domain as CouncilDomain]++;
        }
      }
    }

    let maxDomain: CouncilDomain = 'lifestyle';
    let maxScore = 0;
    let totalScore = 0;

    for (const [domain, score] of Object.entries(scores)) {
      totalScore += score;
      if (score > maxScore) {
        maxScore = score;
        maxDomain = domain as CouncilDomain;
      }
    }

    const confidence = totalScore > 0 ? maxScore / totalScore : 0.33;

    return {
      domain: maxDomain,
      confidence,
      reasoning: totalScore > 0
        ? `Matched ${maxScore} keywords for ${maxDomain}`
        : 'No keywords matched, defaulting to lifestyle',
    };
  }

  async route(prompt: string, explicitCouncil?: CouncilDomain): Promise<RouteResult> {
    const domain = explicitCouncil || this.classifyDomain(prompt).domain;

    let council = councilDb.getByDomain(domain);
    if (!council) {
      council = await this.initializeCouncil(domain);
    }

    const agents = agentDb.getActiveByCouncil(council.id);

    const session = debateSessionDb.insert({
      councilId: council.id,
      userPrompt: prompt,
      phase: 'position',
    });

    return { council, agents, session };
  }

  private async initializeCouncil(domain: CouncilDomain): Promise<Council> {
    const { councilConfig } = await import('../config/councils');
    const councilDef = councilConfig.councils.find(c => c.domain === domain);

    if (!councilDef) {
      throw new Error(`No council definition found for domain: ${domain}`);
    }

    const council = councilDb.insert({
      name: councilDef.name,
      domain: councilDef.domain,
      description: councilDef.description,
    });

    for (const agentDef of councilDef.agents) {
      agentDb.insert({
        councilId: council.id,
        name: agentDef.name,
        disposition: agentDef.disposition,
        generation: 1,
        memoryCapacity: agentDef.memoryCapacity || 100,
        memoryUsed: 0,
        isActive: true,
      });
    }

    return council;
  }

  getCouncils(): Council[] {
    return councilDb.getAll();
  }
}

export const councilRouter = new CouncilRouter();
