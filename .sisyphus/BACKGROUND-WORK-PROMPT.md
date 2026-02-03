# Background Work Session - Phase 1 Security (Safe Tasks)

## CONTEXT
You are continuing Moltbot Security Architecture work. The user is connected via SSH/Tailscale and cannot be present.

## GIT STATE
- Repo: /Users/koed/Dev/oh-my-moltbot
- Branch: 2-feat-local-first-gateway (already pushed)
- Issue: https://github.com/dead-pool-aka-wilson/oh-my-moltbot/issues/2

## SECURITY PLAN LOCATION
Full plan: /Users/koed/Dev/oh-my-moltbot/.sisyphus/MOLTBOT-SECURITY-PLAN.md

## YOUR TASKS (Phase 1 - Machine Hardening)

Execute these tasks IN ORDER. Skip Task 1.3 (firewall) to avoid breaking SSH.

### Task 1.1: Create moltbot user account (30min)
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
```

**Verification:**
```bash
id moltbot  # Should show uid, gid, groups (NOT admin)
stat -f "%OLp" /Users/moltbot  # Should be 700
```

### Task 1.2: Verify FileVault (15min)
```bash
fdesetup status  # Should say "FileVault is On"
csrutil status   # Should say "enabled"
```
Document findings.

### Task 1.3: SKIP - Firewall configuration
**DO NOT EXECUTE** - Will break SSH/Tailscale connection.
Mark as "skipped - requires user presence" in notes.

### Task 1.4: Install OrbStack (30min)
```bash
brew install orbstack
```
Launch and complete setup. Test with:
```bash
orb create alpine test-vm
orb shell test-vm -- uname -a
orb delete test-vm -f
```

### Task 1.5: Install age/sops (30min)
```bash
brew install age sops

# Generate keypair
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt
```

**Verification:**
```bash
age --version
sops --version
ls -la ~/.config/sops/age/keys.txt  # Should be 600 permissions
```

## COMPLETION
After all tasks:
1. Update CONTINUE-SESSION.md with completion status
2. Commit any changes: `git commit -m "feat(#2): complete Phase 1 security (tasks 1.1, 1.2, 1.4, 1.5)"`
3. Leave notes about Task 1.3 (firewall) requiring user presence

## IMPORTANT
- DO NOT run any firewall commands (pf, pfctl)
- DO NOT modify network settings
- If ANY command requires password, note it and skip (user not present)
- Create detailed logs of what you did
