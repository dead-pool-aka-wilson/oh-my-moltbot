/**
 * Ultrawork Executor
 * 
 * Main entry points for ultrawork mode.
 * Combines session management, planning, and gateway routing.
 */

import { ParallelSessionManager, sessionManager, type SpawnOptions, type Session } from './session-manager';
import { TaskPlanner, planner, type Task, type TaskPlan } from './planner';
import { gateway } from '../gateway/ollama-gateway';

export interface UltraworkOptions {
  maxConcurrent?: number;
  timeout?: number;
  collectResults?: boolean;
}

export interface UltraworkResult {
  plan: TaskPlan;
  sessions: Session[];
  results: Record<string, string | undefined>;
  timing: {
    totalMs: number;
    perWave: number[];
  };
}

/**
 * Main ultrawork entry point
 * 
 * Takes a list of tasks, creates a parallel plan, and executes.
 */
export async function ultrawork(
  tasks: Task[],
  options: UltraworkOptions = {}
): Promise<UltraworkResult> {
  const startTime = Date.now();
  const manager = new ParallelSessionManager(options.maxConcurrent || 10);
  
  // Create execution plan
  const plan = planner.createPlan(tasks);
  console.log('\n🚀 ULTRAWORK MODE ENABLED!\n');
  console.log(planner.formatPlan(plan));
  
  const waveTiming: number[] = [];
  const sessionIds: string[] = [];
  
  // Execute wave by wave
  for (const wave of plan.waves) {
    const waveStart = Date.now();
    console.log(`\n⚡ Starting Wave ${wave.wave} (${wave.tasks.length} parallel tasks)`);
    
    // Spawn all tasks in wave simultaneously
    const waveSessionIds = await manager.spawnMany(
      wave.tasks.map(task => ({
        prompt: task.prompt,
        options: {
          category: task.category,
          skills: task.skills,
          background: true,
          timeout: options.timeout,
        },
      }))
    );
    
    sessionIds.push(...waveSessionIds);
    
    // Wait for wave to complete
    await manager.waitFor(waveSessionIds);
    
    waveTiming.push(Date.now() - waveStart);
    
    // Log wave results
    const waveResults = waveSessionIds.map(id => manager.get(id)!);
    const completed = waveResults.filter(s => s.status === 'completed').length;
    const failed = waveResults.filter(s => s.status === 'failed').length;
    console.log(`✅ Wave ${wave.wave} complete: ${completed} success, ${failed} failed`);
  }
  
  return {
    plan,
    sessions: manager.getAll(),
    results: options.collectResults !== false ? manager.getResults() : {},
    timing: {
      totalMs: Date.now() - startTime,
      perWave: waveTiming,
    },
  };
}

/**
 * Quick helper: spawn multiple parallel sessions
 * 
 * For exploration/research tasks that don't need planning.
 */
export async function spawnParallel(
  prompts: Array<{ prompt: string; category?: string; skills?: string[] }>,
  options: { timeout?: number; waitForAll?: boolean } = {}
): Promise<{ sessionIds: string[]; results?: Session[] }> {
  console.log(`\n🔀 Spawning ${prompts.length} parallel sessions...`);
  
  const sessionIds = await sessionManager.spawnMany(
    prompts.map(p => ({
      prompt: p.prompt,
      options: {
        category: p.category,
        skills: p.skills,
        background: true,
        timeout: options.timeout,
      },
    }))
  );
  
  if (options.waitForAll) {
    const results = await sessionManager.waitFor(sessionIds);
    return { sessionIds, results };
  }
  
  return { sessionIds };
}

/**
 * Collect results from previously spawned sessions
 */
export async function collectResults(
  sessionIds: string[],
  timeout?: number
): Promise<Session[]> {
  return sessionManager.waitFor(sessionIds, timeout);
}

/**
 * Quick explore: spawn multiple exploration queries
 */
export async function explore(
  queries: string[],
  options: { waitForAll?: boolean } = {}
): Promise<{ sessionIds: string[]; results?: Session[] }> {
  return spawnParallel(
    queries.map(q => ({ prompt: q, category: 'explore' })),
    options
  );
}

/**
 * Execute with gateway routing
 * 
 * Uses Ollama gateway to route each task to the best available model.
 */
export async function ultraworkWithGateway(
  tasks: Task[],
  options: UltraworkOptions = {}
): Promise<UltraworkResult> {
  const startTime = Date.now();
  const manager = new ParallelSessionManager(options.maxConcurrent || 10);
  
  // Create execution plan
  const plan = planner.createPlan(tasks);
  console.log('\n🚀 ULTRAWORK MODE ENABLED! (with Gateway routing)\n');
  console.log(planner.formatPlan(plan));
  
  const waveTiming: number[] = [];
  
  // Execute wave by wave with gateway routing
  for (const wave of plan.waves) {
    const waveStart = Date.now();
    console.log(`\n⚡ Starting Wave ${wave.wave}`);
    
    // Route each task through gateway to find best model
    const routedTasks = await Promise.all(
      wave.tasks.map(async task => {
        const routing = await gateway.process(task.prompt);
        console.log(`  📍 Task "${task.id}" → ${routing.model} (${routing.reasoning})`);
        return {
          ...task,
          resolvedModel: routing.model,
        };
      })
    );
    
    // Spawn with resolved models
    const waveSessionIds = await manager.spawnMany(
      routedTasks.map(task => ({
        prompt: task.prompt,
        options: {
          model: task.resolvedModel,
          category: task.category,
          skills: task.skills,
          background: true,
          timeout: options.timeout,
        },
      }))
    );
    
    // Wait for wave
    await manager.waitFor(waveSessionIds);
    waveTiming.push(Date.now() - waveStart);
    
    console.log(`✅ Wave ${wave.wave} complete`);
  }
  
  return {
    plan,
    sessions: manager.getAll(),
    results: options.collectResults !== false ? manager.getResults() : {},
    timing: {
      totalMs: Date.now() - startTime,
      perWave: waveTiming,
    },
  };
}
