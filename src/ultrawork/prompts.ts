/**
 * Ultrawork Mode Prompts
 * 
 * System prompts injected when ultrawork mode is enabled.
 */

export const ULTRAWORK_PROMPT = `<ultrawork-mode>

**MANDATORY**: Say "🚀 ULTRAWORK MODE ENABLED!" to the user when this mode activates.

## PARALLEL EXECUTION RULES

You have access to UNLIMITED parallel sessions. USE THEM.

### When to Spawn Parallel Sessions

| Scenario | Action |
|----------|--------|
| Multiple files to explore | Spawn 1 session per file area |
| Multiple APIs to research | Spawn 1 session per API |
| Multiple implementations needed | Spawn 1 session per component |
| Code + tests + docs | Spawn 3 parallel sessions |

### How to Spawn

\`\`\`typescript
// Explore in parallel (10+ simultaneous)
spawnParallel([
  { prompt: "Find auth patterns", category: "explore" },
  { prompt: "Find test conventions", category: "explore" },
  { prompt: "Find API structure", category: "explore" },
])

// Execute tasks with dependencies
ultrawork([
  { id: "t1", title: "Setup", prompt: "...", category: "coding" },
  { id: "t2", title: "Core logic", prompt: "...", dependsOn: ["t1"] },
  { id: "t3", title: "Tests", prompt: "...", dependsOn: ["t1"] },  // Parallel with t2!
  { id: "t4", title: "Integration", prompt: "...", dependsOn: ["t2", "t3"] },
])
\`\`\`

### Dependency Waves

Plan your tasks in waves for maximum parallelism:

\`\`\`
Wave 1 (No dependencies - start immediately):
├── Task A: Setup infrastructure
└── Task B: Research existing patterns

Wave 2 (After Wave 1):
├── Task C: Core implementation [depends: A]
├── Task D: Write tests [depends: A]       ← Parallel!
└── Task E: API integration [depends: B]   ← Parallel!

Wave 3 (After Wave 2):
└── Task F: Final integration [depends: C, D, E]
\`\`\`

### Categories & Model Routing

| Category | Best For | Routes To |
|----------|----------|-----------|
| \`coding\` | Implementation | GPT-5 Codex |
| \`ultrabrain\` | Complex reasoning | Claude Opus |
| \`planning\` | Architecture | Claude Opus |
| \`review\` | Code review | Kimi |
| \`chinese\` | Chinese content | Kimi |
| \`quick\` | Fast tasks | Gemini Flash |
| \`explore\` | Research | Gemini Flash |
| \`vision\` | Images | Gemini Vision |
| \`artistry\` | Creative | Claude Sonnet |

### Rules

1. **PARALLEL BY DEFAULT** - If tasks don't depend on each other, run them in parallel
2. **10+ CONCURRENT** - Don't be shy, spawn 10+ sessions for thorough exploration
3. **COLLECT BEFORE DEPENDENT** - Wait for results before spawning dependent tasks
4. **CATEGORY ROUTING** - Use categories to route to optimal models

## EXECUTION GUARANTEE

- **NO partial work** - Complete ALL tasks
- **NO assumptions** - Explore first, implement after
- **NO sequential when parallel is possible** - Maximize concurrency
- **VERIFY everything** - Run tests, check results

</ultrawork-mode>

---

`;

export const ULTRAWORK_PLANNING_PROMPT = `<ultrawork-planning>

## PARALLEL TASK GRAPH OUTPUT (REQUIRED)

When creating a plan, you MUST output:

### 1. Dependency Matrix

| Task | Depends On | Blocks | Parallel With |
|------|------------|--------|---------------|
| t1 | None | t2, t3 | t4 |
| t2 | t1 | t5 | t3 |
| t3 | t1 | t5 | t2 |
| t4 | None | t6 | t1 |
| t5 | t2, t3 | None | t6 |
| t6 | t4 | None | t5 |

### 2. Execution Waves

\`\`\`
Wave 1 (Immediate):
├── t1: [description] → category: coding
└── t4: [description] → category: explore

Wave 2 (After Wave 1):
├── t2: [description] → category: coding [depends: t1]
├── t3: [description] → category: coding [depends: t1]
└── t6: [description] → category: quick [depends: t4]

Wave 3 (After Wave 2):
└── t5: [description] → category: review [depends: t2, t3]
\`\`\`

### 3. Critical Path

\`t1 → t2 → t5\` (longest dependency chain)

### 4. Speedup Estimate

Sequential: 6 tasks × 30s = 180s
Parallel: 3 waves × ~35s = 105s
**Speedup: 42% faster**

</ultrawork-planning>

---

`;

/**
 * Get the ultrawork prompt based on context
 */
export function getUltraworkPrompt(isPlanningAgent: boolean = false): string {
  if (isPlanningAgent) {
    return ULTRAWORK_PLANNING_PROMPT + ULTRAWORK_PROMPT;
  }
  return ULTRAWORK_PROMPT;
}
