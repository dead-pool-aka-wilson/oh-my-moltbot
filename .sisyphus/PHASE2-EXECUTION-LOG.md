# Phase 2 Execution Log

**Started**: 2026-02-03 17:00 KST
**Completed**: 2026-02-03 17:05 KST
**Branch**: 2-feat-local-first-gateway
**Issue**: #2

---

## Summary

| Task | VM | OS | Python | Network | Socket Dir | Status |
|------|----|----|--------|---------|------------|--------|
| 2.1 | zone3-email-reader | Alpine 3.22 | 3.12.12 | BLOCKED | EXISTS | ✅ |
| 2.2 | zone3-telegram-reader | Alpine 3.22 | 3.12.12 | BLOCKED | EXISTS | ✅ |
| 2.3 | zone3-slack-reader | Alpine 3.22 | 3.12.12 | BLOCKED | EXISTS | ✅ |
| 2.4 | zone2-planner | Ubuntu Questing | 3.13.7 | BLOCKED | EXISTS | ✅ |

---

## Task 2.1: Zone 3 Email-Reader VM

**Status**: ✅ COMPLETE
**Started**: 2026-02-03 17:00 KST

### Steps:
1. [x] Create Alpine VM: `orb create alpine zone3-email-reader`
2. [x] Disable network via iptables (DROP all except loopback)
3. [x] Install Python 3.12.12, beautifulsoup4, lxml
4. [x] Create socket mount point: `/var/run/zone-bridge`
5. [x] Verify no network access: wget timeout confirmed

### Network Isolation Method:
```bash
sudo iptables -P INPUT DROP
sudo iptables -P OUTPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A OUTPUT -o lo -j ACCEPT
```

---

## Task 2.2: Zone 3 Telegram-Reader VM

**Status**: ✅ COMPLETE
**Started**: 2026-02-03 17:00 KST

### Steps:
1. [x] Create Alpine VM: `orb create alpine zone3-telegram-reader`
2. [x] Disable network via iptables
3. [x] Install Python 3.12.12, beautifulsoup4, lxml
4. [x] Create socket mount point: `/var/run/zone-bridge`
5. [x] Verify no network access: wget timeout confirmed

---

## Task 2.3: Zone 3 Slack-Reader VM

**Status**: ✅ COMPLETE
**Started**: 2026-02-03 17:00 KST

### Steps:
1. [x] Create Alpine VM: `orb create alpine zone3-slack-reader`
2. [x] Disable network via iptables
3. [x] Install Python 3.12.12, beautifulsoup4, lxml
4. [x] Create socket mount point: `/var/run/zone-bridge`
5. [x] Verify no network access: wget timeout confirmed

---

## Task 2.4: Zone 2 Planner VM

**Status**: ✅ COMPLETE
**Started**: 2026-02-03 17:01 KST

### Steps:
1. [x] Create Ubuntu VM: `orb create ubuntu zone2-planner`
2. [x] Install iptables and configure DROP all except loopback
3. [x] Install Python 3.13.7, pip, venv
4. [x] Create socket mount point: `/var/run/zone-bridge`
5. [x] Verify no network access: curl failed as expected

---

## Security Verification

### Network Isolation Test Results:
```
zone3-email-reader: wget: download timed out - PASS
zone3-telegram-reader: wget: download timed out - PASS
zone3-slack-reader: wget: download timed out - PASS
zone2-planner: Network blocked - PASS
```

### SSH Access (via OrbStack vsock):
All VMs accessible via `ssh <vm>@orb` - OrbStack uses virtio-vsock, bypassing iptables.

### Security Notes:
1. ✅ iptables rules now PERSISTENT across VM restarts:
   - Alpine VMs: iptables service added to runlevel default
   - Ubuntu VM: iptables-persistent installed, netfilter-persistent save
2. OrbStack SSH uses vsock, not TCP - intentional for management access
3. Zone 3 VMs have minimal packages (Alpine base + Python + parsing libs only)
4. Zone 2 VM has Ubuntu for better LLM tooling support

---

## Task 2.5: Zone Bridge Communication

**Status**: ✅ COMPLETE
**Completed**: 2026-02-03 17:15 KST

### Implementation Notes:
- Unix sockets don't work over virtiofs mounts (OrbStack limitation)
- Solution: TCP socket server on host, VMs connect via iptables-allowed host IP

### Configuration:
- Host IP: `192.168.139.3` (OrbStack bridge interface)
- Port: `9999`
- Socket server: `src/zone1/socket_server.py`

### VM iptables Rules:
```bash
# Allow ONLY host socket communication
iptables -P INPUT DROP
iptables -P OUTPUT DROP
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -d 192.168.139.3 -p tcp --dport 9999 -j ACCEPT
iptables -A INPUT -s 192.168.139.3 -p tcp --sport 9999 -j ACCEPT
```

### Verification Results:
| VM | Socket Connection | Internet Blocked |
|----|-------------------|------------------|
| zone3-email-reader | ✅ pong received | ✅ blocked |
| zone3-telegram-reader | ✅ pong received | ✅ blocked |
| zone3-slack-reader | ✅ pong received | ✅ blocked |
| zone2-planner | ✅ pong received | ✅ blocked |

### Socket Directory (for future Unix socket use):
```
/var/run/moltbot (770, moltbot:staff)
```
