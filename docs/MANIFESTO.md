# Manifesto: Autonomous Companion with Optimal Token Usage

## Why This Exists

I'm building an **autonomous AI companion** that:
1. **Thinks before spending** - Every token has a cost. Route intelligently.
2. **Acts without babysitting** - Runs in background, handles routines, surfaces only when needed.
3. **Remembers efficiently** - Compress, cache, forget. Context is finite.
4. **Executes safely** - Sandboxed, audited, reversible.

This isn't another chatbot. It's a **persistent, cost-aware, autonomous agent** that manages my digital life.

---

## Core Principles

### 1. Token Economics Drive Everything

```
              ┌─────────────────────────────────────────┐
              │     TOKEN COST HIERARCHY                │
              ├─────────────────────────────────────────┤
              │  FREE     │ Local Ollama (7B/14B)       │
              │  CHEAP    │ Cache hit, Skill call       │
              │  MODERATE │ Claude Sonnet, Flash        │
              │  EXPENSIVE│ Claude Opus, GPT-5          │
              └─────────────────────────────────────────┘
                              ↓
              Decision: Use the CHEAPEST option that succeeds
```

**Strategies:**
- **Local-first classification**: Ollama decides routing (cost: $0)
- **Semantic caching**: Same question → cached answer (cost: $0)
- **Skill distillation**: 2000-token instructions → 50-token function call
- **Progressive escalation**: Try cheaper model first, escalate on failure
- **Memory compression**: Summarize at 4K tokens, not 100K

### 2. Autonomy Requires Boundaries

```
                    ┌─────────────────────┐
                    │   PERMISSION MODEL   │
                    ├─────────────────────┤
                    │  REFLEXIVE (auto)   │ → Check calendar, read email
                    │  CONFIRMED (ask)    │ → Send message, create file
                    │  PROHIBITED (never) │ → Delete, payment, sudo
                    └─────────────────────┘
```

The companion should:
- Handle routine tasks without asking (morning briefing, email triage)
- Confirm before actions with external effects (sending messages)
- Never perform destructive/financial operations autonomously

### 3. Context is Precious

Every conversation accumulates tokens. Manage like RAM:
- **Sliding window**: Keep last N turns verbatim
- **Compression threshold**: At 4K tokens, summarize older context
- **Semantic index**: Store retrievable snippets, not full history
- **Session isolation**: Parallel tasks don't pollute each other's context

### 4. Skills Beat Prompts

Instead of explaining how to read email every time:
```
# BAD: 2000 tokens of IMAP explanation
"Use himalaya to connect to IMAP server, authenticate with OAuth2,
 list messages from INBOX, parse headers for subject and sender..."

# GOOD: 50 tokens
skill:mail-management.list_emails(folder="INBOX", count=10)
```

Skills are **pre-compiled intelligence** - validated, sandboxed, efficient.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MOLTBOT CORE                                     │
│                 "Autonomous Companion, Optimal Tokens"                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   LAYER 0: CONTEXT BUDGET                                               │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│   │ Token Tracker│ │Semantic Cache│ │Memory Compress│ │Context Bank │  │
│   │              │ │              │ │              │ │              │  │
│   │ Per-request  │ │ Embedding    │ │ Summarize at │ │ Budget per  │  │
│   │ accounting   │ │ similarity   │ │ threshold    │ │ session     │  │
│   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                │                                        │
│                                ▼                                        │
│   LAYER 1: ROUTING INTELLIGENCE                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │              LOCAL CLASSIFIER (Ollama ~7B, cost: $0)            │  │
│   │  Input: prompt + hints → Output: category, complexity, skill?   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│              │                    │                    │                │
│              ▼                    ▼                    ▼                │
│        ┌──────────┐        ┌──────────┐        ┌──────────┐           │
│        │ TRIVIAL  │        │ STANDARD │        │ COMPLEX  │           │
│        │ Ollama   │        │ Sonnet   │        │ Opus     │           │
│        │ ~$0      │        │ ~$0.01   │        │ ~$0.10   │           │
│        └──────────┘        └──────────┘        └──────────┘           │
│                                                                         │
│   LAYER 2: EXECUTION MODES                                              │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐          │
│   │   REFLEXIVE   │  │  DELIBERATE   │  │    AUTONOMOUS     │          │
│   │               │  │               │  │                   │          │
│   │ Direct answer │  │ Proxy/Plan    │  │ Background daemon │          │
│   │ No planning   │  │ Multi-turn    │  │ Scheduled tasks   │          │
│   │               │  │               │  │ Self-initiated    │          │
│   └───────────────┘  └───────────────┘  └───────────────────┘          │
│                                                                         │
│   LAYER 3: SKILL EXECUTION                                              │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  SKILL REGISTRY        SANDBOX EXECUTOR        AUDIT LOG        │  │
│   │  [mail] [calendar]     Docker (read-only)     /tmp/audit.log    │  │
│   │  [music] [scraper]     Script wrappers                          │  │
│   │  [report] [blog]       Allowlist binaries                       │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   LAYER 4: COMMUNICATION                                                │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Signal DM ←→ Gateway ←→ Email ←→ Obsidian ←→ Content Seeds     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Token Optimization Strategies

| Strategy | How It Works | Estimated Savings |
|----------|--------------|-------------------|
| **Local Classifier** | Ollama routes before API call | 90% of trivial queries free |
| **Semantic Cache** | Embedding match → reuse answer | 100% on cache hit |
| **Skill Distillation** | Pre-baked instructions | ~2000 tokens/skill call |
| **Memory Compression** | Summarize at 4K threshold | ~70% context reduction |
| **Progressive Escalation** | Try cheap model first | Avoid expensive model when unnecessary |
| **Parallel Execution** | Ultrawork waves | Time savings, same token cost |

---

## Execution Modes

### Reflexive (Auto-respond)
For simple queries that don't need planning:
- "What time is it in Tokyo?"
- "Summarize this email"
- "What's on my calendar today?"

→ Direct to cheapest capable model, immediate response.

### Deliberate (Plan-then-execute)
For complex tasks requiring clarification:
- "Build a REST API for my blog"
- "Refactor the auth system"

→ Proxy mode: clarify requirements → generate plan → Ultrawork execution.

### Autonomous (Background daemon)
For scheduled/triggered routines:
- Morning briefing (7am daily)
- Email triage (every 30 min)
- Newsletter digest (weekdays 6pm)
- Self-initiated based on triggers

→ Persistent queue, cron jobs, no human intervention.

---

## Skill Integration

Skills from `openclaw-setup` become first-class citizens:

```typescript
// Instead of prompting "read my latest emails"
// Classifier detects: skill-matchable → mail-management
// Execution: skill:mail-management.list_emails()
// Tokens saved: ~2000 per call

const skills = [
  'mail-management',      // Email operations
  'calendar-schedule',    // Apple Calendar
  'music-collection',     // Apple Music
  'newsletter-digest',    // Parse + summarize
  'daily-reporter',       // Aggregate reports
  'web-scraper',          // RSS/web content
  'meme-collector',       // Trending content
  'daily-blog-gen',       // Blog generation
];
```

---

## Roadmap

### Phase 1: Context Budget (Current Priority)
- [ ] Token tracker per request/session
- [ ] Semantic cache with embedding store
- [ ] Memory compressor at threshold
- [ ] Context bank with budget warnings

### Phase 2: Skill Integration
- [ ] Import skill definitions from openclaw-setup
- [ ] Skill-aware classifier in local Ollama
- [ ] Skill execution bridge to sandbox

### Phase 3: Autonomous Daemon
- [ ] Persistent SQLite task queue
- [ ] Cron-triggered routines
- [ ] Self-initiated based on triggers
- [ ] Background execution with notification

### Phase 4: Advanced Optimization
- [ ] Fine-tuned local classifier
- [ ] Predictive rate limit management
- [ ] Cross-session semantic memory
- [ ] A/B testing model selection

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| **Cost per day** | < $5 | Sustainable autonomous operation |
| **Cache hit rate** | > 30% | Semantic cache effectiveness |
| **Local routing %** | > 60% | Avoid paid APIs for trivial queries |
| **Avg response time** | < 3s | Perceived responsiveness |
| **Autonomous task success** | > 95% | Reliability without human intervention |

---

## Non-Goals

- **General AGI**: This is a personal assistant, not a general intelligence
- **Multi-user**: Single-user deployment, my digital companion
- **Real-time streaming**: Batch is fine, latency is acceptable
- **Mobile app**: CLI/Signal is the interface, not a native app

---

## Closing Thought

> "The best AI assistant is one you forget is AI - it just handles things."

This companion should feel like a competent junior employee who:
- Handles routine tasks without asking
- Knows when to escalate
- Never wastes money
- Never breaks things
- Surfaces relevant information proactively

That's the goal. Let's build it.
