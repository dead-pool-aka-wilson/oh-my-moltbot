#!/usr/bin/env python3
"""Audit logging system for Zone 1 executor - immutable security logs."""

import json
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum
import threading


class AuditEventType(Enum):
    ACTION_REQUESTED = "action_requested"
    ACTION_APPROVED = "action_approved"
    ACTION_REJECTED = "action_rejected"
    ACTION_EXECUTED = "action_executed"
    ACTION_FAILED = "action_failed"
    POLICY_DENIED = "policy_denied"
    KILL_SWITCH_TRIGGERED = "kill_switch_triggered"
    ANOMALY_DETECTED = "anomaly_detected"
    CONTENT_SANITIZED = "content_sanitized"
    INJECTION_DETECTED = "injection_detected"
    AUTH_ATTEMPT = "auth_attempt"
    CONFIG_CHANGED = "config_changed"
    SYSTEM_START = "system_start"
    SYSTEM_STOP = "system_stop"


@dataclass
class AuditEvent:
    timestamp: str
    event_type: str
    action: Optional[str]
    actor: str
    source_zone: str
    details: Dict[str, Any]
    request_id: Optional[str]
    previous_hash: str
    event_hash: str


class AuditLogger:
    LOG_DIR = Path.home() / "moltbot-security" / "audit-logs"
    CHAIN_FILE = "audit-chain.json"

    def __init__(self, log_dir: Optional[Path] = None):
        self.log_dir = log_dir or self.LOG_DIR
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._chain_file = self.log_dir / self.CHAIN_FILE
        self._previous_hash = self._load_chain_state()

    def _load_chain_state(self) -> str:
        if self._chain_file.exists():
            try:
                with open(self._chain_file, "r") as f:
                    data = json.load(f)
                    return data.get("last_hash", "GENESIS")
            except Exception:
                pass
        return "GENESIS"

    def _save_chain_state(self, last_hash: str):
        with open(self._chain_file, "w") as f:
            json.dump(
                {
                    "last_hash": last_hash,
                    "updated": datetime.now(timezone.utc).isoformat(),
                },
                f,
            )

    def _compute_hash(self, event_data: Dict[str, Any], previous_hash: str) -> str:
        content = json.dumps(event_data, sort_keys=True) + previous_hash
        return hashlib.sha256(content.encode()).hexdigest()

    def _get_log_file(self) -> Path:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self.log_dir / f"audit-{date_str}.jsonl"

    def log(
        self,
        event_type: AuditEventType,
        action: Optional[str] = None,
        actor: str = "system",
        source_zone: str = "zone1",
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> AuditEvent:
        with self._lock:
            timestamp = datetime.now(timezone.utc).isoformat()

            event_data = {
                "timestamp": timestamp,
                "event_type": event_type.value,
                "action": action,
                "actor": actor,
                "source_zone": source_zone,
                "details": details or {},
                "request_id": request_id,
            }

            event_hash = self._compute_hash(event_data, self._previous_hash)

            event = AuditEvent(
                timestamp=timestamp,
                event_type=event_type.value,
                action=action,
                actor=actor,
                source_zone=source_zone,
                details=details or {},
                request_id=request_id,
                previous_hash=self._previous_hash,
                event_hash=event_hash,
            )

            log_file = self._get_log_file()
            with open(log_file, "a") as f:
                f.write(json.dumps(asdict(event)) + "\n")

            self._previous_hash = event_hash
            self._save_chain_state(event_hash)

            return event

    def verify_chain(self, log_file: Optional[Path] = None) -> tuple[bool, List[str]]:
        errors = []
        files = [log_file] if log_file else sorted(self.log_dir.glob("audit-*.jsonl"))

        previous_hash = "GENESIS"

        for f in files:
            with open(f, "r") as fp:
                for line_num, line in enumerate(fp, 1):
                    try:
                        event = json.loads(line.strip())

                        if event.get("previous_hash") != previous_hash:
                            errors.append(
                                f"{f.name}:{line_num}: Chain broken - expected {previous_hash[:8]}..., got {event.get('previous_hash', 'NONE')[:8]}..."
                            )

                        event_data = {
                            "timestamp": event["timestamp"],
                            "event_type": event["event_type"],
                            "action": event["action"],
                            "actor": event["actor"],
                            "source_zone": event["source_zone"],
                            "details": event["details"],
                            "request_id": event["request_id"],
                        }
                        computed_hash = self._compute_hash(
                            event_data, event["previous_hash"]
                        )

                        if computed_hash != event["event_hash"]:
                            errors.append(
                                f"{f.name}:{line_num}: Hash mismatch - event may have been tampered"
                            )

                        previous_hash = event["event_hash"]

                    except json.JSONDecodeError as e:
                        errors.append(f"{f.name}:{line_num}: Invalid JSON - {e}")

        return len(errors) == 0, errors

    def query(
        self,
        event_type: Optional[AuditEventType] = None,
        action: Optional[str] = None,
        actor: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
        results = []
        files = sorted(self.log_dir.glob("audit-*.jsonl"), reverse=True)

        for f in files:
            with open(f, "r") as fp:
                for line in fp:
                    try:
                        data = json.loads(line.strip())
                        event = AuditEvent(**data)

                        if event_type and event.event_type != event_type.value:
                            continue
                        if action and event.action != action:
                            continue
                        if actor and event.actor != actor:
                            continue

                        event_time = datetime.fromisoformat(event.timestamp)
                        if start_time and event_time < start_time:
                            continue
                        if end_time and event_time > end_time:
                            continue

                        results.append(event)

                        if len(results) >= limit:
                            return results

                    except (json.JSONDecodeError, TypeError):
                        continue

        return results

    def get_stats(self) -> Dict[str, Any]:
        stats: Dict[str, int] = {}
        total = 0

        for f in self.log_dir.glob("audit-*.jsonl"):
            with open(f, "r") as fp:
                for line in fp:
                    try:
                        data = json.loads(line.strip())
                        event_type = data.get("event_type", "unknown")
                        stats[event_type] = stats.get(event_type, 0) + 1
                        total += 1
                    except json.JSONDecodeError:
                        continue

        return {
            "total_events": total,
            "by_type": stats,
            "chain_valid": self.verify_chain()[0],
        }
