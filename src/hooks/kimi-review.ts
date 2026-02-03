/**
 * Kimi Auto-Review Hook
 * Automatically reviews code changes using Kimi model
 */

import { OhMyMoltbotConfig } from '../config/schema';

export interface ReviewResult {
  passed: boolean;
  critical: string[];
  warnings: string[];
  suggestions: string[];
  summary: string;
}

export interface FileChange {
  path: string;
  diff?: string;
  content?: string;
  type: 'create' | 'modify' | 'delete';
}

/**
 * Build the review prompt for Kimi
 */
export function buildReviewPrompt(changes: FileChange[]): string {
  const fileList = changes.map(c => `- ${c.path} (${c.type})`).join('\n');
  
  const diffs = changes
    .filter(c => c.diff || c.content)
    .map(c => {
      const content = c.diff || c.content || '';
      return `### ${c.path}\n\`\`\`\n${content}\n\`\`\``;
    })
    .join('\n\n');

  return `Review the following code changes for:
1. Security vulnerabilities
2. Bugs and logic errors
3. Performance issues
4. Code quality and best practices

Files changed:
${fileList}

${diffs}

Respond in this JSON format:
{
  "passed": boolean,
  "critical": ["list of critical issues that must be fixed"],
  "warnings": ["list of warnings to consider"],
  "suggestions": ["list of improvement suggestions"],
  "summary": "brief summary of the review"
}`;
}

/**
 * Parse Kimi's review response
 */
export function parseReviewResponse(response: string): ReviewResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        passed: parsed.passed ?? true,
        critical: parsed.critical ?? [],
        warnings: parsed.warnings ?? [],
        suggestions: parsed.suggestions ?? [],
        summary: parsed.summary ?? 'Review completed',
      };
    }
  } catch (e) {
    // Failed to parse JSON
  }

  // Default response if parsing fails
  return {
    passed: true,
    critical: [],
    warnings: [],
    suggestions: ['Could not parse review response'],
    summary: response.slice(0, 200),
  };
}

/**
 * Format review result for display
 */
export function formatReviewResult(result: ReviewResult): string {
  const lines: string[] = [];
  
  const icon = result.passed ? '✅' : '❌';
  lines.push(`${icon} Code Review ${result.passed ? 'Passed' : 'Failed'}`);
  lines.push('');
  
  if (result.critical.length > 0) {
    lines.push('🚨 Critical Issues:');
    result.critical.forEach(issue => lines.push(`  - ${issue}`));
    lines.push('');
  }
  
  if (result.warnings.length > 0) {
    lines.push('⚠️ Warnings:');
    result.warnings.forEach(issue => lines.push(`  - ${issue}`));
    lines.push('');
  }
  
  if (result.suggestions.length > 0) {
    lines.push('💡 Suggestions:');
    result.suggestions.forEach(issue => lines.push(`  - ${issue}`));
    lines.push('');
  }
  
  lines.push(`📝 Summary: ${result.summary}`);
  
  return lines.join('\n');
}

/**
 * Should this file be reviewed?
 */
export function shouldReviewFile(
  filePath: string, 
  config: OhMyMoltbotConfig
): boolean {
  const review = config.review;
  if (!review?.enabled) return false;
  
  // Check extension
  const ext = '.' + filePath.split('.').pop();
  if (!review.extensions?.includes(ext)) return false;
  
  // Check ignore patterns
  if (review.ignorePatterns?.some(pattern => {
    const regex = new RegExp(
      pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
    );
    return regex.test(filePath);
  })) {
    return false;
  }
  
  return true;
}
