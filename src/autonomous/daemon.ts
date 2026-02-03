#!/usr/bin/env bun
import { executor } from './executor';
import { closeDb } from './db';

process.on('SIGTERM', async () => {
  console.log('[Daemon] Received SIGTERM');
  await executor.stop();
  closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Daemon] Received SIGINT');
  await executor.stop();
  closeDb();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Daemon] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Daemon] Unhandled rejection:', reason);
});

async function main() {
  console.log('[Daemon] Starting autonomous task executor...');
  console.log(`[Daemon] PID: ${process.pid}`);

  executor.on('taskStart', (task) => {
    console.log(`[Task] Started: ${task.title}`);
  });

  executor.on('taskComplete', (task) => {
    console.log(`[Task] Completed: ${task.title}`);
  });

  executor.on('taskFailed', (task, error) => {
    console.error(`[Task] Failed: ${task.title}`, error.message);
  });

  await executor.start();

  console.log('[Daemon] Executor running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  console.error('[Daemon] Fatal error:', error);
  process.exit(1);
});
