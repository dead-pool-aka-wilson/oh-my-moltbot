/**
 * Seed Harvester
 * 
 * Automatically extracts blog-worthy content from conversations:
 * - Ideas and concepts discussed
 * - Mistakes made and how we fixed them
 * - Technical solutions discovered
 * - Lessons learned
 * - Interesting Q&A
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { lockSync, unlockSync } from 'proper-lockfile';

export interface Seed {
  title: string;
  context: string;
  insight: string;
  type: 'idea' | 'mistake' | 'solution' | 'lesson' | 'qa' | 'discovery';
  tags: string[];
  timestamp: string;
  conversationSnippet?: string;
}

export interface HarvestConfig {
  seedsDir: string;  // Where to save seeds
  autoHarvest: boolean;  // Auto-detect blog-worthy content
  minInsightLength: number;
  patterns: HarvestPattern[];
}

export interface HarvestPattern {
  type: Seed['type'];
  triggers: string[];
  extractionHint: string;
}

const DEFAULT_PATTERNS: HarvestPattern[] = [
  {
    type: 'mistake',
    triggers: [
      'that was wrong',
      'the issue was',
      'bug was',
      'mistake was',
      'error because',
      'fixed by',
      'the problem',
      'didn\'t work because',
    ],
    extractionHint: 'Extract the mistake and the fix',
  },
  {
    type: 'solution',
    triggers: [
      'the solution is',
      'solved by',
      'here\'s how',
      'the trick is',
      'works because',
      'the approach',
      'implemented',
    ],
    extractionHint: 'Extract the problem and solution',
  },
  {
    type: 'lesson',
    triggers: [
      'learned that',
      'realized',
      'turns out',
      'important to',
      'best practice',
      'should always',
      'never do',
    ],
    extractionHint: 'Extract the lesson learned',
  },
  {
    type: 'idea',
    triggers: [
      'what if we',
      'could we',
      'idea:',
      'thinking about',
      'might be interesting',
      'cool to',
    ],
    extractionHint: 'Extract the idea and potential',
  },
  {
    type: 'discovery',
    triggers: [
      'discovered',
      'found out',
      'didn\'t know',
      'interesting that',
      'TIL',
      'today I learned',
    ],
    extractionHint: 'Extract the discovery',
  },
];

const DEFAULT_CONFIG: HarvestConfig = {
  seedsDir: join(process.env.HOME || '', 'Dev/personal-blog/content/.seeds'),
  autoHarvest: true,
  minInsightLength: 50,
  patterns: DEFAULT_PATTERNS,
};

export class SeedHarvester {
  private config: HarvestConfig;

  constructor(config?: Partial<HarvestConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureSeedsDir();
  }

  private ensureSeedsDir(): void {
    if (!existsSync(this.config.seedsDir)) {
      mkdirSync(this.config.seedsDir, { recursive: true });
    }
  }

  /**
   * Analyze conversation for potential seeds
   */
  analyzeConversation(messages: { role: string; content: string }[]): Seed[] {
    const seeds: Seed[] = [];
    const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    for (const pattern of this.config.patterns) {
      for (const trigger of pattern.triggers) {
        if (conversation.toLowerCase().includes(trigger.toLowerCase())) {
          // Found potential seed
          const snippetStart = conversation.toLowerCase().indexOf(trigger.toLowerCase());
          const snippetEnd = Math.min(snippetStart + 500, conversation.length);
          const snippet = conversation.slice(Math.max(0, snippetStart - 100), snippetEnd);
          
          seeds.push({
            title: `${pattern.type}: ${trigger}`,
            context: pattern.extractionHint,
            insight: '', // To be filled by AI or manual review
            type: pattern.type,
            tags: [pattern.type],
            timestamp: new Date().toISOString(),
            conversationSnippet: snippet,
          });
        }
      }
    }

    return seeds;
  }

  /**
   * Save a seed to today's file
   */
  saveSeed(seed: Seed): string {
    const today = new Date().toISOString().split('T')[0];
    const filePath = join(this.config.seedsDir, `${today}.md`);
    
    const seedMarkdown = `
## ${seed.title}

**Type:** ${seed.type}
**Time:** ${seed.timestamp}
**Tags:** ${seed.tags.map(t => `#${t}`).join(' ')}

### Context
${seed.context}

### Insight
${seed.insight || '_To be filled_'}

${seed.conversationSnippet ? `### Conversation Snippet\n\`\`\`\n${seed.conversationSnippet}\n\`\`\`` : ''}

---
`;

    if (!existsSync(filePath)) {
      writeFileSync(filePath, '');
    }
    
    let release: (() => void) | undefined;
    try {
      release = lockSync(filePath, { retries: { retries: 5, minTimeout: 100 } });
      appendFileSync(filePath, seedMarkdown);
    } finally {
      if (release) unlockSync(filePath);
    }
    return filePath;
  }

  /**
   * Manual seed creation
   */
  createSeed(
    title: string,
    insight: string,
    type: Seed['type'],
    tags: string[],
    context?: string
  ): Seed {
    const seed: Seed = {
      title,
      context: context || '',
      insight,
      type,
      tags,
      timestamp: new Date().toISOString(),
    };

    this.saveSeed(seed);
    return seed;
  }

  /**
   * Get seeds for a specific date
   */
  getSeedsForDate(date: string): string | null {
    const filePath = join(this.config.seedsDir, `${date}.md`);
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  /**
   * Get recent seeds (last N days)
   */
  getRecentSeeds(days: number = 7): { date: string; content: string }[] {
    const seeds: { date: string; content: string }[] = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const content = this.getSeedsForDate(dateStr);
      if (content) {
        seeds.push({ date: dateStr, content });
      }
    }
    
    return seeds;
  }
}

// Export singleton
export const harvester = new SeedHarvester();

/**
 * Quick helper to save a seed from anywhere
 */
export function saveSeed(
  title: string,
  insight: string,
  type: Seed['type'] = 'discovery',
  tags: string[] = []
): void {
  harvester.createSeed(title, insight, type, tags);
}
