import type {
  CouncilDomain,
  DebateResult,
  DebateRequest,
  DebateOptions,
} from './types';
import { councilRouter } from './router/council-router';
import { debateEngine } from './debate/debate-engine';
import { councilDb, agentDb } from './storage/council-db';

export interface CouncilStatus {
  councils: Array<{
    domain: CouncilDomain;
    name: string;
    agentCount: number;
    activeAgents: number;
  }>;
  totalDebates: number;
}

/**
 * Main entry point for council debates
 */
export async function runCouncil(request: DebateRequest): Promise<DebateResult> {
  const { prompt, council: explicitCouncil, options } = request;

  const { council, agents, session } = await councilRouter.route(
    prompt,
    explicitCouncil
  );

  const result = await debateEngine.runDebate(session, agents);

  result.council = council.domain;

  return result;
}

/**
 * Get council system status
 */
export function getCouncilStatus(): CouncilStatus {
  const councils = councilDb.getAll();

  return {
    councils: councils.map((council) => {
      const allAgents = agentDb.getByCouncil(council.id);
      const activeAgents = agentDb.getActiveByCouncil(council.id);
      return {
        domain: council.domain,
        name: council.name,
        agentCount: allAgents.length,
        activeAgents: activeAgents.length,
      };
    }),
    totalDebates: 0,
  };
}

/**
 * Format debate result for CLI output
 */
export function formatDebateResult(result: DebateResult): string {
  const lines: string[] = [];

  lines.push(
    `🏛️ COUNCIL: ${result.council.charAt(0).toUpperCase() + result.council.slice(1)}`
  );
  lines.push('');

  lines.push('━━━ PHASE 1: POSITIONS ━━━');
  lines.push('');
  for (const pos of result.phases.positions) {
    lines.push(`🎯 ${pos.agentName.toUpperCase()}`);
    lines.push(`   Position: ${pos.position}`);
    if (pos.keyPoints.length > 0) {
      lines.push('   Key Points:');
      for (const point of pos.keyPoints) {
        lines.push(`   • ${point}`);
      }
    }
    lines.push('');
  }

  lines.push('━━━ PHASE 2: CHALLENGES ━━━');
  lines.push('');
  for (const ch of result.phases.challenges) {
    lines.push(`${ch.challengerName} → ${ch.targetName}:`);
    lines.push(`   "${ch.challenge}"`);
    lines.push('');
  }

  lines.push('━━━ PHASE 3: SYNTHESIS ━━━');
  lines.push('');
  lines.push(result.phases.synthesis);
  lines.push('');
  lines.push(`CONFIDENCE: ${(result.confidence * 100).toFixed(0)}%`);
  lines.push('');
  lines.push(`Session: ${result.sessionId}`);

  return lines.join('\n');
}

/**
 * Parse /council command
 */
export function parseCouncilCommand(input: string): DebateRequest | null {
  const text = input.replace(/^\/council\s*/i, '').trim();

  if (!text) return null;

  const councilMatch = text.match(
    /(?:-c|--council)\s+(lifestyle|creative|direction)/i
  );
  let council: CouncilDomain | undefined;
  let prompt = text;

  if (councilMatch) {
    council = councilMatch[1].toLowerCase() as CouncilDomain;
    prompt = text.replace(councilMatch[0], '').trim();
  }

  const verbose = /(?:-v|--verbose)/.test(text);
  if (verbose) {
    prompt = prompt.replace(/(?:-v|--verbose)/, '').trim();
  }

  const includeAncestors = /(?:-a|--ancestors)/.test(text);
  if (includeAncestors) {
    prompt = prompt.replace(/(?:-a|--ancestors)/, '').trim();
  }

  const options: DebateOptions = {};
  if (verbose) options.verbose = true;
  if (includeAncestors) options.includeAncestors = true;

  return {
    prompt,
    council,
    options: Object.keys(options).length > 0 ? options : undefined,
  };
}

export * from './types';
export { councilRouter } from './router/council-router';
export { debateEngine } from './debate/debate-engine';
export { MemoryManager } from './memory/memory-manager';
export { generationManager } from './generation/generation-manager';
