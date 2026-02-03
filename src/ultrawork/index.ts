/**
 * Ultrawork Mode
 * 
 * Parallel multi-model execution with dependency management.
 * 
 * Flow:
 * 1. User request → Analyze task
 * 2. Create parallel execution waves
 * 3. Spawn multiple sessions simultaneously
 * 4. Collect results, trigger dependent tasks
 * 5. Final aggregation
 */

export { ParallelSessionManager, type Session, type SessionStatus } from './session-manager';
export { TaskPlanner, type TaskPlan, type TaskWave, type Task } from './planner';
export { getUltraworkPrompt } from './prompts';
export { ultrawork, spawnParallel, collectResults } from './executor';
