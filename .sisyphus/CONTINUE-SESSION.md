# Moltbot Gateway & Security - Session Continuation

**Last Updated**: 2026-02-03 16:30 KST
**Session Purpose**: Local-First Gateway implementation + Security Architecture

---

## PHASE 1 SECURITY STATUS (2026-02-03)

| Task | Status | Notes |
|------|--------|-------|
| 1.1 | ⏸️ PENDING | Requires sudo password - user presence needed |
| 1.2 | ✅ COMPLETE | FileVault: ON, SIP: enabled |
| 1.3 | ⏭️ SKIPPED | Would break SSH/Tailscale connection |
| 1.4 | ✅ COMPLETE | OrbStack v2.0.5 installed, VM test passed |
| 1.5 | ✅ COMPLETE | age v1.3.1, sops v3.11.0, keypair generated |

### Task 1.1 Commands (for user to run)

```bash
# Create user
sudo sysadminctl -addUser moltbot -fullName "Moltbot Service" -password - -home /Users/moltbot -shell /bin/bash

# Remove from admin
sudo dseditgroup -o edit -d moltbot -t user admin

# Set restrictive umask
echo "umask 077" | sudo tee /Users/moltbot/.bash_profile

# Hide from GUI login
sudo dscl . -create /Users/moltbot IsHidden 1

# Set permissions
sudo chmod 700 /Users/moltbot
sudo chown -R moltbot:moltbot /Users/moltbot

# Verify
id moltbot  # Should show uid, gid, groups (NOT admin)
stat -f "%OLp" /Users/moltbot  # Should be 700
```

### Age/Sops Setup Details

- Public key: `age10x2g7nxy0uytsarpce2t9sgu9h56cecs2txmf2zaggmgnyx6uqeqr7pw7w`
- Key location: `~/.config/sops/age/keys.txt` (600 permissions)

---

## QUICK START PROMPT

Copy this entire block to continue work in a new session:

```
Continue the Moltbot Gateway & Security Architecture work.

## CRITICAL CONTEXT

### Current Git State
- Repo: /Users/koed/Dev/oh-my-moltbot
- Branch: 2-feat-local-first-gateway
- Issue: https://github.com/dead-pool-aka-wilson/oh-my-moltbot/issues/2
- Commits on branch:
  - 363e73d docs(#2): add Ollama optimization appendix and launchd config
  - b789662 feat(#2): implement Local-First Gateway architecture
  - d4ba22c feat(#1): integrate with Moltbot plugin system
  - 19aac20 feat(#1): add Proxy/Interviewer mode

### What Was Completed
1. ✅ Local-First Gateway Architecture implemented in `src/gateway/ollama-gateway.ts`
   - Local Ollama (qwen2.5:1.5b) analyzes prompts and decides routing category
   - Routes to model pools: reasoning/coding/review/quick/vision
   - Paid APIs only called for execution, not availability checks
   - Local Ollama as final fallback

2. ✅ TypeScript build errors fixed in:
   - `src/index.ts` - config merging for ReviewConfig
   - `src/proxy/orchestrator.ts` - GatewayResponse.routing.reasoning access

3. ✅ Documentation updated:
   - `.sisyphus/MOLTBOT-SECURITY-PLAN.md` - Added Appendix A: Ollama Optimization
   - `.sisyphus/launchd/com.ollama.plist` - Production launchd config

4. ✅ Security fixes applied to /Users/koed/Dev/openclaw-setup (10 vulnerabilities)

### What's Next
1. ✅ DONE - Push branch and create PR for Local-First Gateway (already done)
2. Phase 1 Security - PARTIAL COMPLETION:
   - ⏸️ Task 1.1: Create moltbot user account - **REQUIRES USER PRESENCE (sudo needs password)**
   - ✅ Task 1.2: Verify FileVault - COMPLETE (FileVault ON, SIP enabled)
   - ⏭️ Task 1.3: Configure pf firewall - SKIPPED (would break SSH/Tailscale)
   - ✅ Task 1.4: Install OrbStack - COMPLETE (v2.0.5)
   - ✅ Task 1.5: Install age/sops - COMPLETE (age 1.3.1, sops 3.11.0, keypair generated)

### IMPORTANT WARNINGS
- User is connected via SSH over Tailscale
- Firewall changes (Task 1.3) WILL break the connection
- Must ensure Tailscale traffic is allowed BEFORE enabling pf rules
- Consider: SSH escape hatch rule in pf config

### Key Files
- Gateway: /Users/koed/Dev/oh-my-moltbot/src/gateway/ollama-gateway.ts
- Security Plan: /Users/koed/Dev/oh-my-moltbot/.sisyphus/MOLTBOT-SECURITY-PLAN.md
- Launchd config: /Users/koed/Dev/oh-my-moltbot/.sisyphus/launchd/com.ollama.plist
- This file: /Users/koed/Dev/oh-my-moltbot/.sisyphus/CONTINUE-SESSION.md

### Ollama Optimization Summary (Mac Mini M4, 32GB)
- GPU memory: sudo sysctl -w iogpu.wired_limit_mb=26000
- Router model: qwen2.5:1.5b-instruct (~150-200 tok/s)
- Executor model: qwen2.5:14b-instruct-q8_0 (~40-60 tok/s)
- Environment: OLLAMA_NUM_PARALLEL=4, OLLAMA_KEEP_ALIVE=-1

### Git Workflow Rules
- All commits must reference issue: feat(#2): description
- Max 7 commits per branch (currently 4)
- Branch naming: {issue-number}-{kebab-case-description}

## ACTIONS TO TAKE
1. Read /Users/koed/Dev/oh-my-moltbot/.sisyphus/MOLTBOT-SECURITY-PLAN.md for full security plan
2. Check git status to verify current state
3. Ask user what to proceed with:
   - Option A: Push branch & create PR
   - Option B: Start Phase 1 security implementation (careful with firewall!)
   - Option C: Other work
```

---

## DETAILED STATE

### Local-First Gateway Architecture

```
User Prompt
    │
    ▼
┌─────────────────────────────────────┐
│ LOCAL ROUTER (qwen2.5:1.5b)         │
│ - Classifies prompt into category   │
│ - ~150-200 tok/s (instant response) │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ ROUTING DECISION                    │
│ - reasoning → Opus/Sonnet/Gemini    │
│ - coding → GPT-5/Sonnet/DeepSeek    │
│ - review → Kimi/Sonnet              │
│ - quick → Gemini Flash/Haiku        │
│ - local → qwen2.5:14b (executor)    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ EXECUTION                           │
│ - Try model pool in order           │
│ - If all rate-limited → fallback    │
│ - Final fallback: LOCAL EXECUTOR    │
└─────────────────────────────────────┘
```

### Security Architecture (3-Zone Model)

```
┌──────────────────────────────────────────────────────────────┐
│                    macOS HOST (Apple Silicon)                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ZONE 1: EXECUTOR (macOS Host)                           │ │
│  │ - Policy Engine, Credential Injector, Action Executor   │ │
│  │ - Unix Socket Server for IPC                            │ │
│  │ - External API access (Gmail, Telegram, Slack, Twilio)  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                                │
│                    Unix Socket Mount                          │
│                              │                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ZONE 2: PLANNER (Ubuntu VM) - NO NETWORK                │ │
│  │ - LLM Agent for reasoning/planning                      │ │
│  │ - Capability Client (requests actions via socket)       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ZONE 3: READERS (Alpine VMs) - NO NETWORK               │ │
│  │ - email-reader, telegram-reader, slack-reader           │ │
│  │ - Content sanitization, injection detection             │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Phase 1 Tasks (Machine Hardening)

| Task | Description | Time | Risk | Status |
|------|-------------|------|------|--------|
| 1.1 | Create moltbot user | 30m | Low | ⏸️ Needs sudo |
| 1.2 | Verify FileVault | 15m | None | ✅ Complete |
| 1.3 | Configure pf firewall | 1h | **HIGH - BREAKS SSH** | ⏭️ Skipped |
| 1.4 | Install OrbStack | 30m | Low | ✅ Complete |
| 1.5 | Install age/sops | 30m | Low | ✅ Complete |

### Firewall Safety Protocol

Before enabling pf firewall:

```bash
# MUST allow Tailscale traffic
# Add to /etc/pf.anchors/moltbot.rules:

# Allow Tailscale (100.x.x.x range)
pass out quick on utun+ all
pass in quick on utun+ all
pass out quick proto { tcp udp } from any to 100.0.0.0/8

# Allow established connections (fallback)
pass out quick proto tcp from any to any flags S/SA keep state
```

### Files Modified This Session

| File | Repo | Changes |
|------|------|---------|
| `src/gateway/ollama-gateway.ts` | oh-my-moltbot | Complete rewrite - Local-First |
| `src/index.ts` | oh-my-moltbot | Fix config merging types |
| `src/proxy/orchestrator.ts` | oh-my-moltbot | Fix routing.reasoning access |
| `src/moltbot-plugin/index.ts` | oh-my-moltbot | Add route_prompt, get_gateway_status |
| `src/ultrawork/executor.ts` | oh-my-moltbot | Update GatewayResponse type |
| `.sisyphus/MOLTBOT-SECURITY-PLAN.md` | oh-my-moltbot | Add Ollama appendix |
| `.sisyphus/launchd/com.ollama.plist` | oh-my-moltbot | New launchd config |

### Security Fixes Applied (openclaw-setup)

| # | Vulnerability | File | Status |
|---|---------------|------|--------|
| 1 | Command Injection via eval | scripts/backup/backup.sh | ✅ Fixed |
| 2 | AppleScript Injection | scripts/music/playback.sh | ✅ Fixed |
| 3 | Path Traversal via Symlinks | scripts/lib/security.ts | ✅ Fixed |
| 4 | SSRF via DNS Rebinding | scripts/lib/security.ts | ✅ Fixed |
| 5 | Race Condition (TOCTOU) | scripts/lib/security.ts | ✅ Fixed |
| 6 | Shell Injection via $() | scripts/lib/security.ts | ✅ Fixed |
| 7 | Overly Permissive Mounts | config/openclaw.json | ✅ Fixed |
| 8 | Missing Deny Commands | config/openclaw.json | ✅ Fixed |
| 9 | World-Writable Audit Logs | scripts/lib/security.sh | ✅ Fixed |
| 10 | Weak AppleScript Sanitization | scripts/lib/security.sh | ✅ Fixed |

---

## RECOVERY COMMANDS

```bash
# Verify git state
cd /Users/koed/Dev/oh-my-moltbot
git status
git log --oneline -5
git branch -vv

# Verify build still works
npm run build

# Read security plan
cat .sisyphus/MOLTBOT-SECURITY-PLAN.md | head -100

# Check issue status
gh issue view 2
```

---

*This document auto-generated for session continuity*
