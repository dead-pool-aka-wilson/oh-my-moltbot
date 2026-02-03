# oh-my-moltbot 🤖

**Multi-Model Orchestration Plugin for Moltbot**

Batteries-included plugin that provides intelligent model routing, auto-review, and agent management for Moltbot.

## Features

- 🎯 **Intelligent Model Routing** - Automatically selects the best model based on task type
- 🤖 **Named Agents** - Define specialized agents with custom models and prompts
- 📝 **Category-based Routing** - Route tasks by keywords, file types, or explicit hints
- 🔍 **Auto-Review** - Automatic code review with Kimi on edits
- 🔄 **Fallback Chains** - Graceful degradation if primary model is unavailable
- 🪝 **Hook System** - Lifecycle hooks for custom integrations

## Installation

```bash
bun add oh-my-moltbot
# or
npm install oh-my-moltbot
```

## Quick Start

```bash
# Initialize config in your project
oh-my-moltbot init

# Select model for a task
oh-my-moltbot select "implement a REST API for user authentication"
# → Model: github-copilot/gpt-5.2-codex (Trigger match: coding)

oh-my-moltbot select "review this code for security issues" -f src/auth.ts
# → Model: opencode/kimi-k2.5-free (Trigger match: review)

oh-my-moltbot select "翻译这段文字到中文"
# → Model: opencode/kimi-k2.5-free (Trigger match: chinese)
```

## Configuration

Create `oh-my-moltbot.json` in your project root:

```json
{
  "defaultModel": "anthropic/claude-sonnet-4-5",
  
  "agents": {
    "orchestrator": {
      "model": "anthropic/claude-opus-4-5",
      "variant": "high",
      "description": "Complex planning and reasoning"
    },
    "coder": {
      "model": "github-copilot/gpt-5.2-codex",
      "description": "Fast coding"
    },
    "reviewer": {
      "model": "opencode/kimi-k2.5-free",
      "description": "Code review"
    }
  },
  
  "categories": {
    "coding": {
      "model": "github-copilot/gpt-5.2-codex",
      "triggers": ["implement", "code", "write function"],
      "filePatterns": ["*.ts", "*.js", "*.py"]
    },
    "planning": {
      "model": "anthropic/claude-opus-4-5",
      "variant": "high",
      "triggers": ["plan", "design", "architect"]
    },
    "chinese": {
      "model": "opencode/kimi-k2.5-free",
      "triggers": ["翻译", "中文", "chinese"]
    },
    "vision": {
      "model": "google/gemini-2.5-flash-image",
      "triggers": ["image", "screenshot", "visual"]
    }
  },
  
  "review": {
    "enabled": true,
    "model": "opencode/kimi-k2.5-free",
    "blockOnCritical": true,
    "extensions": [".ts", ".js", ".py"]
  },
  
  "fallbackChain": [
    "anthropic/claude-sonnet-4-5",
    "google/gemini-2.5-pro"
  ]
}
```

## Programmatic Usage

```typescript
import { createOrchestrator, selectModelForTask } from 'oh-my-moltbot';

// Quick selection
const result = selectModelForTask("implement a login function", {
  files: ["src/auth.ts"],
});
console.log(result.model);  // github-copilot/gpt-5.2-codex

// With orchestrator instance
const orchestrator = createOrchestrator();
const selection = orchestrator.selectModel({
  message: "review this PR",
  files: ["src/index.ts", "src/utils.ts"],
});
console.log(selection);
// { model: 'opencode/kimi-k2.5-free', reason: 'Trigger match: review', category: 'review' }

// Check if review should be triggered
if (orchestrator.shouldReview(["src/auth.ts"])) {
  // Trigger Kimi review
}
```

## CLI Commands

```bash
oh-my-moltbot init              # Create default config
oh-my-moltbot config            # Show current config
oh-my-moltbot agents            # List configured agents
oh-my-moltbot categories        # List categories
oh-my-moltbot select <message>  # Select model for task
  -a, --agent <name>            # Hint: use specific agent
  -c, --category <name>         # Hint: use specific category
  -f, --file <path>             # Add file context
  --json                        # Output as JSON
```

## Model Recommendations

| Task Type | Recommended Model | Why |
|-----------|------------------|-----|
| Coding | GPT-5.2 Codex | Fast, optimized for code |
| Code Review | Kimi | Good at finding issues |
| Planning | Claude Opus | Strong reasoning |
| Quick Tasks | Gemini Flash | Fast & cheap |
| Vision | Gemini Flash Image | Multimodal support |
| Chinese | Kimi | Native support |
| Long Context | Gemini Pro | 1M+ token window |

## License

MIT
