# oh-my-moltbot

**Autonomous Companion with Optimal Token Usage**

> *The best AI assistant is one you forget is AI - it just handles things.*

See [MANIFESTO.md](docs/MANIFESTO.md) for the full vision.

## What This Is

A **cost-aware, autonomous AI agent** that:
- Routes every request to the **cheapest capable model**
- Runs **background routines** without babysitting
- **Caches semantically** to avoid redundant API calls
- Executes **safely in a sandbox** with audit trails

## Features

- 🧠 **Local-First Routing** - Ollama classifies before paid API calls (~90% free)
- 🎭 **Proxy Mode** - Model as thought partner for complex planning
- 🚀 **Ultrawork Mode** - Parallel execution with dependency waves
- 🌱 **Seed Harvesting** - Auto-extract blog content from conversations
- 📦 **Skill Integration** - Pre-baked instructions save ~2000 tokens/call
- 🔒 **Sandbox Execution** - Docker isolation with allowlist security

## Installation

### As Moltbot Plugin

```bash
# Install the plugin
npm install oh-my-moltbot

# Or add to your Moltbot config
```

Add to your Moltbot configuration:
```json
{
  "plugins": ["oh-my-moltbot"]
}
```

### Standalone CLI

```bash
# Clone and use directly
git clone https://github.com/dead-pool-aka-wilson/oh-my-moltbot
cd oh-my-moltbot
bun install

# Run CLI
bun bin/oh-my-moltbot.js --help
```

## Usage

### Commands (in Moltbot)

```
/ultrawork     - Toggle Ultrawork parallel execution mode
/proxy <task>  - Start a proxy session (model becomes your thought partner)
/gateway       - Show gateway status and rate limits  
/dispatch      - Dispatch tasks from current proxy session
```

### CLI

```bash
# Check gateway status
oh-my-moltbot gateway

# Route a prompt
oh-my-moltbot route "implement a REST API"

# Select model for task
oh-my-moltbot select "review this code"

# Spawn background session
oh-my-moltbot spawn "explore auth patterns" -c explore
```

## Architecture

### Ollama Gateway Flow

```
You → Ollama Gateway → Check Claude Opus (rate limited?)
                         ↓ YES
                       Check Claude Sonnet
                         ↓ YES
                       Check GPT-5
                         ↓ YES
                       Check Kimi
                         ↓ YES (ALL unavailable!)
                       Ollama responds itself (qwen2.5:14b)
```

### Proxy Mode Flow

```
You: "Build a REST API"
        ↓
    Gateway → Routes to best model
        ↓
    Model (as YOUR proxy):
        "Let me understand..."
        "Have you considered...?"
        "What about...?"
        ↓
    [Conversation until understanding is clear]
        ↓
    REFINED_PROMPT blocks generated
        ↓
    /dispatch → Tasks go to executing agents
```

### Ultrawork Mode

```
Wave 1 (No dependencies - parallel):
├── Task A: Setup infrastructure
└── Task B: Research patterns

Wave 2 (After Wave 1 - parallel):
├── Task C: Core impl [depends: A]
├── Task D: Tests [depends: A]      ← Run together!
└── Task E: API [depends: B]

Wave 3 (Final):
└── Task F: Integration [depends: C, D, E]
```

## Category → Model Routing

| Category | Routes To |
|----------|-----------|
| `coding` | GPT-5 Codex |
| `ultrabrain` | Claude Opus |
| `planning` | Claude Opus |
| `review` | Kimi |
| `chinese` | Kimi |
| `quick` | Gemini Flash |
| `explore` | Gemini Flash |
| `vision` | Gemini Vision |
| `artistry` | Claude Sonnet |

## Programmatic Usage

```typescript
import { gateway, proxy, ultrawork, saveSeed } from 'oh-my-moltbot';

// Route through gateway
const routing = await gateway.process("complex task");
console.log(routing.model);  // → selected model

// Start proxy session
const { sessionId, proxyResponse } = await proxy.start("Build an API");
// ... conversation ...
const { plan } = await proxy.dispatch(sessionId);

// Parallel execution
const result = await ultrawork([
  { id: 't1', title: 'Setup', prompt: '...', category: 'coding' },
  { id: 't2', title: 'Core', prompt: '...', dependsOn: ['t1'] },
  { id: 't3', title: 'Tests', prompt: '...', dependsOn: ['t1'] },
]);

// Save blog seed
saveSeed('API Design Lesson', 'Always version your APIs from day 1', 'lesson', ['api', 'design']);
```

## Configuration

Create `oh-my-moltbot.json` in your workspace:

```json
{
  "gateway": {
    "ollamaUrl": "http://localhost:11434",
    "ollamaModel": "qwen2.5:14b",
    "fallbackChain": [
      { "name": "Claude Opus", "model": "anthropic/claude-opus-4-5", "maxRequestsPerMinute": 50 },
      { "name": "Claude Sonnet", "model": "anthropic/claude-sonnet-4-5", "maxRequestsPerMinute": 60 },
      { "name": "GPT-5", "model": "github-copilot/gpt-5.2-codex", "maxRequestsPerMinute": 60 },
      { "name": "Kimi", "model": "opencode/kimi-k2.5-free", "maxRequestsPerMinute": 100 }
    ]
  },
  "ultrawork": {
    "maxConcurrent": 10
  },
  "seeds": {
    "directory": "~/Dev/personal-blog/content/.seeds"
  }
}
```

## Requirements

- **Ollama** running locally with `qwen2.5:14b` model
- **Moltbot** (for plugin mode)
- **Bun** runtime

```bash
# Install Ollama
brew install ollama
brew services start ollama
ollama pull qwen2.5:14b
```

## License

MIT
