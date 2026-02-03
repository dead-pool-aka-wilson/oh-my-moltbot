/**
 * Task Planner
 * 
 * Creates parallel execution plans with dependency management.
 * Outputs task waves that can be executed concurrently.
 */

export interface Task {
  id: string;
  title: string;
  prompt: string;
  category?: string;
  skills?: string[];
  dependsOn?: string[];  // Task IDs
  estimatedSeconds?: number;
}

export interface TaskWave {
  wave: number;
  tasks: Task[];
  description: string;
}

export interface TaskPlan {
  title: string;
  waves: TaskWave[];
  criticalPath: string[];  // Task IDs in sequence
  estimatedTotalSeconds: number;
  parallelSpeedup: string;  // e.g., "40% faster than sequential"
}

export interface DependencyMatrix {
  [taskId: string]: {
    dependsOn: string[];
    blocks: string[];
    canParallelizeWith: string[];
  };
}

export class TaskPlanner {
  /**
   * Analyze tasks and create parallel execution waves
   */
  createPlan(tasks: Task[]): TaskPlan {
    // Build dependency graph
    const deps = this.buildDependencyMatrix(tasks);
    
    // Create waves based on dependencies
    const waves = this.createWaves(tasks, deps);
    
    // Find critical path
    const criticalPath = this.findCriticalPath(tasks, deps);
    
    // Calculate timing
    const sequential = tasks.reduce((sum, t) => sum + (t.estimatedSeconds || 30), 0);
    const parallel = waves.reduce((sum, w) => {
      const maxInWave = Math.max(...w.tasks.map(t => t.estimatedSeconds || 30));
      return sum + maxInWave;
    }, 0);
    
    const speedup = Math.round((1 - parallel / sequential) * 100);
    
    return {
      title: 'Parallel Execution Plan',
      waves,
      criticalPath,
      estimatedTotalSeconds: parallel,
      parallelSpeedup: `${speedup}% faster than sequential`,
    };
  }

  /**
   * Build dependency matrix
   */
  private buildDependencyMatrix(tasks: Task[]): DependencyMatrix {
    const matrix: DependencyMatrix = {};
    
    for (const task of tasks) {
      matrix[task.id] = {
        dependsOn: task.dependsOn || [],
        blocks: [],
        canParallelizeWith: [],
      };
    }
    
    // Fill "blocks" (reverse of dependsOn)
    for (const task of tasks) {
      for (const depId of task.dependsOn || []) {
        if (matrix[depId]) {
          matrix[depId].blocks.push(task.id);
        }
      }
    }
    
    // Find parallelizable tasks (no dependency relationship)
    for (const task of tasks) {
      for (const other of tasks) {
        if (task.id === other.id) continue;
        
        const hasDep = task.dependsOn?.includes(other.id) || other.dependsOn?.includes(task.id);
        if (!hasDep) {
          matrix[task.id].canParallelizeWith.push(other.id);
        }
      }
    }
    
    return matrix;
  }

  /**
   * Create execution waves
   */
  private createWaves(tasks: Task[], deps: DependencyMatrix): TaskWave[] {
    const waves: TaskWave[] = [];
    const completed = new Set<string>();
    const remaining = new Set(tasks.map(t => t.id));
    
    let waveNum = 1;
    
    while (remaining.size > 0) {
      // Find tasks with all dependencies satisfied
      const ready: Task[] = [];
      
      for (const taskId of remaining) {
        const task = tasks.find(t => t.id === taskId)!;
        const allDepsCompleted = (task.dependsOn || []).every(d => completed.has(d));
        
        if (allDepsCompleted) {
          ready.push(task);
        }
      }
      
      if (ready.length === 0) {
        // Circular dependency or error
        throw new Error(`Circular dependency detected. Remaining: ${[...remaining].join(', ')}`);
      }
      
      waves.push({
        wave: waveNum,
        tasks: ready,
        description: `Wave ${waveNum}: ${ready.length} parallel task(s)`,
      });
      
      // Mark as completed
      for (const task of ready) {
        completed.add(task.id);
        remaining.delete(task.id);
      }
      
      waveNum++;
    }
    
    return waves;
  }

  /**
   * Find critical path (longest dependency chain)
   */
  private findCriticalPath(tasks: Task[], deps: DependencyMatrix): string[] {
    const memo: Map<string, string[]> = new Map();
    
    const findLongestPath = (taskId: string): string[] => {
      if (memo.has(taskId)) return memo.get(taskId)!;
      
      const blocks = deps[taskId]?.blocks || [];
      
      if (blocks.length === 0) {
        const path = [taskId];
        memo.set(taskId, path);
        return path;
      }
      
      let longest: string[] = [];
      for (const nextId of blocks) {
        const path = findLongestPath(nextId);
        if (path.length > longest.length) {
          longest = path;
        }
      }
      
      const result = [taskId, ...longest];
      memo.set(taskId, result);
      return result;
    };
    
    // Start from tasks with no dependencies
    const roots = tasks.filter(t => !t.dependsOn?.length);
    let longestPath: string[] = [];
    
    for (const root of roots) {
      const path = findLongestPath(root.id);
      if (path.length > longestPath.length) {
        longestPath = path;
      }
    }
    
    return longestPath;
  }

  /**
   * Format plan for display
   */
  formatPlan(plan: TaskPlan): string {
    const lines: string[] = [];
    
    lines.push(`# ${plan.title}`);
    lines.push('');
    lines.push(`**Estimated Time:** ${plan.estimatedTotalSeconds}s`);
    lines.push(`**Parallel Speedup:** ${plan.parallelSpeedup}`);
    lines.push(`**Critical Path:** ${plan.criticalPath.join(' → ')}`);
    lines.push('');
    
    for (const wave of plan.waves) {
      lines.push(`## Wave ${wave.wave} (${wave.tasks.length} parallel)`);
      for (const task of wave.tasks) {
        const deps = task.dependsOn?.length ? ` [depends: ${task.dependsOn.join(', ')}]` : '';
        const cat = task.category ? ` → ${task.category}` : '';
        lines.push(`- **${task.id}**: ${task.title}${deps}${cat}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
}

// Export singleton
export const planner = new TaskPlanner();
