import type { AgentDisposition } from '../types';

/**
 * Score content against an agent's disposition
 * @param content - The content to evaluate
 * @param disposition - The agent's disposition
 * @returns Score between 0 and 1
 */
export function scoreAgainstDisposition(
  content: string,
  disposition: AgentDisposition
): number {
  let score = 0;

  const keywordMatches = disposition.filterCriteria.keywords.filter((kw) =>
    content.toLowerCase().includes(kw.toLowerCase())
  ).length;
  score += Math.min(0.3, keywordMatches * 0.1);

  const sentiment = analyzeSentiment(content);
  if (sentiment === disposition.filterCriteria.sentimentBias) {
    score += 0.2;
  } else if (disposition.filterCriteria.sentimentBias === 'neutral') {
    score += 0.1;
  }

  const noveltyScore = assessNovelty(content);
  if (disposition.filterCriteria.noveltyPreference === 'high' && noveltyScore > 0.5) {
    score += 0.2;
  } else if (
    disposition.filterCriteria.noveltyPreference === 'low' &&
    noveltyScore < 0.3
  ) {
    score += 0.2;
  } else if (disposition.filterCriteria.noveltyPreference === 'balanced') {
    score += 0.1;
  }

  const riskScore = assessRisk(content);
  if (disposition.filterCriteria.riskTolerance === 'high' && riskScore > 0.5) {
    score += 0.2;
  } else if (
    disposition.filterCriteria.riskTolerance === 'low' &&
    riskScore < 0.3
  ) {
    score += 0.2;
  } else if (disposition.filterCriteria.riskTolerance === 'moderate') {
    score += 0.1;
  }

  score += assessPriorityAlignment(content, disposition.priorities) * 0.1;

  return Math.min(1, Math.max(0, score));
}

export function analyzeSentiment(content: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = [
    'good',
    'great',
    'excellent',
    'love',
    'best',
    'amazing',
    'wonderful',
    'beautiful',
    'perfect',
    'awesome',
  ];
  const negativeWords = [
    'bad',
    'terrible',
    'awful',
    'hate',
    'worst',
    'horrible',
    'ugly',
    'poor',
    'disappointing',
    'fail',
  ];

  const lowerContent = content.toLowerCase();
  const positiveCount = positiveWords.filter((w) => lowerContent.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => lowerContent.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

export function assessNovelty(content: string): number {
  const noveltyWords = [
    'new',
    'innovative',
    'unique',
    'first',
    'cutting-edge',
    'revolutionary',
    'fresh',
    'novel',
    'emerging',
    'latest',
  ];
  const traditionalWords = [
    'classic',
    'traditional',
    'proven',
    'established',
    'reliable',
    'trusted',
    'standard',
    'conventional',
  ];

  const lowerContent = content.toLowerCase();
  const noveltyCount = noveltyWords.filter((w) => lowerContent.includes(w)).length;
  const traditionalCount = traditionalWords.filter((w) => lowerContent.includes(w)).length;

  const total = noveltyCount + traditionalCount;
  if (total === 0) return 0.5;
  return noveltyCount / total;
}

export function assessRisk(content: string): number {
  const riskWords = [
    'risk',
    'gamble',
    'uncertain',
    'volatile',
    'experimental',
    'speculative',
    'bold',
    'daring',
  ];
  const safeWords = [
    'safe',
    'secure',
    'stable',
    'guaranteed',
    'proven',
    'reliable',
    'conservative',
    'careful',
  ];

  const lowerContent = content.toLowerCase();
  const riskCount = riskWords.filter((w) => lowerContent.includes(w)).length;
  const safeCount = safeWords.filter((w) => lowerContent.includes(w)).length;

  const total = riskCount + safeCount;
  if (total === 0) return 0.5;
  return riskCount / total;
}

export function assessPriorityAlignment(
  content: string,
  priorities: AgentDisposition['priorities']
): number {
  const lowerContent = content.toLowerCase();
  let alignment = 0;

  if (
    priorities.cost > 0.3 &&
    (lowerContent.includes('price') ||
      lowerContent.includes('cost') ||
      lowerContent.includes('value') ||
      lowerContent.includes('budget'))
  ) {
    alignment += priorities.cost;
  }

  if (
    priorities.quality > 0.3 &&
    (lowerContent.includes('quality') ||
      lowerContent.includes('premium') ||
      lowerContent.includes('best') ||
      lowerContent.includes('excellent'))
  ) {
    alignment += priorities.quality;
  }

  if (
    priorities.novelty > 0.3 &&
    (lowerContent.includes('new') ||
      lowerContent.includes('innovative') ||
      lowerContent.includes('trend') ||
      lowerContent.includes('latest'))
  ) {
    alignment += priorities.novelty;
  }

  if (
    priorities.reliability > 0.3 &&
    (lowerContent.includes('reliable') ||
      lowerContent.includes('consistent') ||
      lowerContent.includes('proven') ||
      lowerContent.includes('trusted'))
  ) {
    alignment += priorities.reliability;
  }

  return Math.min(1, alignment);
}
