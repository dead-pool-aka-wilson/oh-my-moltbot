# Moltbot Security Architecture

## Overview

Moltbot implements a defense-in-depth security architecture with isolated execution zones, policy enforcement, and comprehensive audit logging.

## Zone Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        macOS HOST (Zone 1)                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Zone 1 Executor                           │   │
│  │  ├── Policy Engine (allowed actions + rate limits)          │   │
│  │  ├── Credential Injector (sops/age encrypted)               │   │
│  │  ├── Kill Switch (anomaly detection + file trigger)         │   │
│  │  ├── Audit Logger (hash-chained, tamper-evident)            │   │
│  │  └── Canary System (breach detection)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                         TCP :9999                                   │
│                              │                                      │
│  ┌──────────────────────────┴─────────────────────────────────┐   │
│  │                    OrbStack VMs                              │   │
│  │                                                              │   │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  │   │
│  │  │  Zone 2         │  │  Zone 3                           │  │   │
│  │  │  (Planner)      │  │  (Readers)                        │  │   │
│  │  │                 │  │                                   │  │   │
│  │  │  - Ubuntu       │  │  - zone3-email-reader (Alpine)    │  │   │
│  │  │  - Capability   │  │  - zone3-telegram-reader (Alpine) │  │   │
│  │  │    Client       │  │  - zone3-slack-reader (Alpine)    │  │   │
│  │  │  - No internet  │  │  - Content Sanitizers             │  │   │
│  │  │                 │  │  - No internet                    │  │   │
│  │  └─────────────────┘  └──────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Security Layers

### Layer 1: Machine Hardening

- **moltbot user**: Dedicated system user (uid 503, hidden, no shell)
- **FileVault**: Disk encryption enabled
- **SIP**: System Integrity Protection enabled
- **pf Firewall**: Tailscale-aware rules, moltbot egress restrictions

### Layer 2: Zone Isolation

- **Zone 1 (Host)**: Trusted executor with credentials access
- **Zone 2 (VM)**: Planner with capability requests only
- **Zone 3 (VMs)**: Input readers with content sanitization

**Network Isolation**:
- VMs can ONLY communicate with Zone 1 executor on port 9999
- All other network access blocked via iptables
- No internet access from any VM

### Layer 3: Policy Enforcement

```python
ALLOWED_ACTIONS = {
    "read_email": ApprovalLevel.NONE,      # No approval needed
    "read_telegram": ApprovalLevel.NONE,
    "read_slack": ApprovalLevel.NONE,
    "send_email": ApprovalLevel.APPROVE,   # Requires human approval
    "send_telegram": ApprovalLevel.APPROVE,
    "send_slack": ApprovalLevel.APPROVE,
    "make_call": ApprovalLevel.APPROVE,
    "send_sms": ApprovalLevel.APPROVE,
}
```

**Rate Limits**:
- send_email: 10/hour
- send_telegram: 50/hour
- send_slack: 50/hour
- make_call: 5/hour
- send_sms: 20/hour

### Layer 4: Content Sanitization

Zone 3 sanitizers detect and strip:
- XSS payloads (`<script>`, event handlers)
- Prompt injection patterns
- Control characters
- Dangerous HTML tags

**Injection Detection Patterns**:
- "ignore previous instructions"
- "disregard all"
- "system:" prefixes
- "[INST]" markers
- "DAN mode" / "developer mode"

### Layer 5: Kill Switch

**Triggers**:
- Manual command via TCP
- Telegram kill word (KILLSWITCH, EMERGENCY_STOP, HALT_ALL)
- File trigger (/tmp/moltbot-kill)
- Rate limit exceeded
- Anomaly detected

**Effect**: Immediately blocks ALL action execution until reset.

### Layer 6: Audit Logging

**Hash-Chained Logs**:
```json
{
  "timestamp": "2026-02-03T08:30:00Z",
  "event_type": "action_executed",
  "action": "send_email",
  "actor": "zone2-planner",
  "previous_hash": "abc123...",
  "event_hash": "def456..."
}
```

- Each event cryptographically linked to previous
- Tampering detection via chain verification
- Daily log rotation

### Layer 7: Canary Tokens

**Types**:
- CREDENTIAL: Fake credentials in config files
- API_KEY: Honeypot API keys
- PROMPT: Injection detection markers
- URL: Tracking URLs for data exfiltration detection

**Deployment**:
- Default canaries created on system start
- Prompt canaries injected into AI responses
- Triggers alert on any access/use

## Credential Management

**sops/age Encryption**:
```bash
# Encrypt secrets
sops -e -i secrets/api-keys.yaml

# Access in code (Zone 1 only)
creds = CredentialInjector()
gmail_token = creds.inject_for_action("send_email")
```

**Key Location**: `~/.config/sops/age/keys.txt`

## Approval Flow

```
Zone 2 → capability_request(send_email) → Zone 1 Policy Engine
                                              │
                                              ├── DENIED (unknown action)
                                              │
                                              ├── APPROVED (read action, no approval needed)
                                              │
                                              └── PENDING_APPROVAL (send action)
                                                       │
                                                       ↓
                                              Approval Bot → Telegram Admin
                                                       │
                                                       ↓
                                              APPROVED/REJECTED → Zone 1 → Execute/Deny
```

## Running Red Team Tests

```bash
# From host
cd ~/Dev/oh-my-moltbot
pytest src/security/tests/test_redteam.py -v

# Test specific scenarios
pytest src/security/tests/test_redteam.py::TestPromptInjection -v
pytest src/security/tests/test_redteam.py::TestKillSwitch -v
```

## Incident Response

### Kill Switch Activation

1. Send kill command: `echo '{"type":"kill"}' | nc localhost 9999`
2. Or create file: `echo "KILLSWITCH" > /tmp/moltbot-kill`
3. Or via Telegram: Send "EMERGENCY_STOP" to admin chat

### Audit Investigation

```python
from src.security.zone1.audit import AuditLogger, AuditEventType

logger = AuditLogger()

# Verify chain integrity
valid, errors = logger.verify_chain()

# Query events
events = logger.query(
    event_type=AuditEventType.ACTION_EXECUTED,
    start_time=datetime(2026, 2, 3),
)
```

### Canary Trigger Response

1. Check trigger log: `~/moltbot-security/canary-triggers.jsonl`
2. Identify compromised token
3. Rotate affected credentials
4. Investigate access vector

## Configuration Files

| File | Purpose |
|------|---------|
| `~/moltbot-security/secrets/api-keys.yaml` | Encrypted API credentials |
| `~/moltbot-security/.sops.yaml` | sops configuration |
| `~/moltbot-security/canaries.json` | Active canary tokens |
| `~/moltbot-security/audit-logs/` | Hash-chained audit logs |
| `/etc/pf.anchors/moltbot.rules` | Firewall rules |

## Best Practices

1. **Never** store credentials in code or plain text
2. **Always** use the approval flow for send actions
3. **Monitor** audit logs daily for anomalies
4. **Rotate** API keys quarterly
5. **Test** kill switch monthly
6. **Review** canary triggers immediately
7. **Update** injection patterns as new attacks emerge
