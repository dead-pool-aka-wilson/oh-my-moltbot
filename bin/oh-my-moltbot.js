#!/usr/bin/env bun
/**
 * oh-my-moltbot CLI
 * Usage: oh-my-moltbot <command> [options]
 */

import { loadConfig, createOrchestrator, selectModelForTask, defaultConfig } from '../src/index.ts';
import { writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
oh-my-moltbot - Multi-Model Orchestration for Moltbot

Commands:
  init              Create default configuration file
  select <message>  Select best model for a task
  agents            List configured agents
  categories        List configured categories
  config            Show current configuration

Options:
  -a, --agent <name>     Specify agent hint
  -c, --category <name>  Specify category hint
  -f, --file <path>      Add file context (can repeat)
  -w, --workspace <dir>  Workspace directory
  --json                 Output as JSON

Examples:
  oh-my-moltbot select "implement a REST API"
  oh-my-moltbot select "review this code" -f src/index.ts
  oh-my-moltbot select "翻译这段文字"
  oh-my-moltbot init
`);
}

function parseArgs(rawArgs) {
  const options = { files: [] };
  const messageparts = [];
  
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg === '-a' || arg === '--agent') {
      options.agent = rawArgs[++i];
    } else if (arg === '-c' || arg === '--category') {
      options.category = rawArgs[++i];
    } else if (arg === '-f' || arg === '--file') {
      options.files.push(rawArgs[++i]);
    } else if (arg === '-w' || arg === '--workspace') {
      options.workspaceDir = rawArgs[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      messageparts.push(arg);
    }
    i++;
  }
  
  return { message: messageparts.join(' '), options };
}

async function main() {
  if (!command || command === 'help' || command === '-h' || command === '--help') {
    printHelp();
    process.exit(0);
  }

  if (command === 'init') {
    const configPath = join(process.cwd(), 'oh-my-moltbot.json');
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`✅ Created ${configPath}`);
    process.exit(0);
  }

  if (command === 'config') {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }

  if (command === 'agents') {
    const config = loadConfig();
    console.log('\n📋 Configured Agents:\n');
    for (const [name, agent] of Object.entries(config.agents || {})) {
      console.log(`  ${name}`);
      console.log(`    Model: ${agent.model}`);
      if (agent.variant) console.log(`    Variant: ${agent.variant}`);
      if (agent.description) console.log(`    ${agent.description}`);
      console.log();
    }
    process.exit(0);
  }

  if (command === 'categories') {
    const config = loadConfig();
    console.log('\n📋 Configured Categories:\n');
    for (const [name, cat] of Object.entries(config.categories || {})) {
      console.log(`  ${name}`);
      console.log(`    Model: ${cat.model}`);
      if (cat.triggers?.length) console.log(`    Triggers: ${cat.triggers.join(', ')}`);
      if (cat.filePatterns?.length) console.log(`    Files: ${cat.filePatterns.join(', ')}`);
      console.log();
    }
    process.exit(0);
  }

  if (command === 'select') {
    const { message, options } = parseArgs(args.slice(1));
    
    if (!message) {
      console.error('Error: No message provided');
      process.exit(1);
    }

    const result = selectModelForTask(message, options);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n🤖 Model Selection:`);
      console.log(`   Model: ${result.model}`);
      if (result.variant) console.log(`   Variant: ${result.variant}`);
      console.log(`   Reason: ${result.reason}`);
      console.log();
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch(console.error);
