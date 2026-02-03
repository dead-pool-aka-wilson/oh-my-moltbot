#!/usr/bin/env python3
"""Kill switch for Zone 1 executor - emergency shutdown mechanism."""

import os
import signal
import threading
import time
from pathlib import Path
from typing import Callable, Optional, List
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class KillReason(Enum):
    MANUAL = "manual"
    ANOMALY_DETECTED = "anomaly_detected"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    SECURITY_BREACH = "security_breach"
    TELEGRAM_COMMAND = "telegram_command"
    FILE_TRIGGER = "file_trigger"


@dataclass
class KillEvent:
    timestamp: datetime
    reason: KillReason
    details: str
    triggered_by: str


class KillSwitch:
    KILL_FILE = Path("/tmp/moltbot-kill")
    KILL_WORDS = ["KILLSWITCH", "EMERGENCY_STOP", "HALT_ALL"]

    def __init__(
        self,
        on_kill: Optional[Callable[[KillEvent], None]] = None,
        check_interval: float = 1.0,
    ):
        self.on_kill = on_kill
        self.check_interval = check_interval

        self._active = True
        self._killed = False
        self._kill_event: Optional[KillEvent] = None
        self._watchers: List[threading.Thread] = []
        self._lock = threading.Lock()
        self._shutdown_callbacks: List[Callable[[], None]] = []

    def start(self):
        file_watcher = threading.Thread(target=self._watch_kill_file, daemon=True)
        file_watcher.start()
        self._watchers.append(file_watcher)

    def stop(self):
        self._active = False
        for watcher in self._watchers:
            watcher.join(timeout=2)

    def register_shutdown_callback(self, callback: Callable[[], None]):
        with self._lock:
            self._shutdown_callbacks.append(callback)

    def is_killed(self) -> bool:
        return self._killed

    def trigger(
        self,
        reason: KillReason,
        details: str = "",
        triggered_by: str = "system",
    ) -> KillEvent:
        with self._lock:
            if self._killed and self._kill_event:
                return self._kill_event

            self._kill_event = KillEvent(
                timestamp=datetime.now(timezone.utc),
                reason=reason,
                details=details,
                triggered_by=triggered_by,
            )
            self._killed = True

        self._execute_shutdown()
        return self._kill_event

    def _execute_shutdown(self):
        if self._kill_event and self.on_kill:
            try:
                self.on_kill(self._kill_event)
            except Exception as e:
                print(f"Kill callback error: {e}")

        for callback in self._shutdown_callbacks:
            try:
                callback()
            except Exception as e:
                print(f"Shutdown callback error: {e}")

        self._write_kill_marker()

    def _write_kill_marker(self):
        try:
            with open(self.KILL_FILE, "w") as f:
                if self._kill_event:
                    f.write(f"KILLED: {self._kill_event.reason.value}\n")
                    f.write(f"TIME: {self._kill_event.timestamp.isoformat()}\n")
                    f.write(f"BY: {self._kill_event.triggered_by}\n")
                    f.write(f"DETAILS: {self._kill_event.details}\n")
        except Exception:
            pass

    def _watch_kill_file(self):
        while self._active and not self._killed:
            if self.KILL_FILE.exists():
                try:
                    content = self.KILL_FILE.read_text().strip()
                    if any(word in content.upper() for word in self.KILL_WORDS):
                        self.trigger(
                            KillReason.FILE_TRIGGER,
                            details=f"Kill file detected: {content[:100]}",
                            triggered_by="file_watcher",
                        )
                except Exception:
                    pass

            time.sleep(self.check_interval)

    def check_message_for_kill(self, message: str, sender: str) -> bool:
        upper_msg = message.upper().replace(" ", "_")

        for word in self.KILL_WORDS:
            if word in upper_msg:
                self.trigger(
                    KillReason.TELEGRAM_COMMAND,
                    details=f"Kill word detected in message: {word}",
                    triggered_by=sender,
                )
                return True

        return False

    def reset(self, authorized_by: str) -> bool:
        with self._lock:
            if not self._killed:
                return False

            self._killed = False
            self._kill_event = None

            if self.KILL_FILE.exists():
                try:
                    self.KILL_FILE.unlink()
                except Exception:
                    pass

            return True

    def get_status(self) -> dict:
        return {
            "active": self._active,
            "killed": self._killed,
            "kill_event": {
                "timestamp": self._kill_event.timestamp.isoformat(),
                "reason": self._kill_event.reason.value,
                "details": self._kill_event.details,
                "triggered_by": self._kill_event.triggered_by,
            }
            if self._kill_event
            else None,
        }


class AnomalyDetector:
    def __init__(self, kill_switch: KillSwitch):
        self.kill_switch = kill_switch
        self._action_counts: dict = {}
        self._lock = threading.Lock()

    def record_action(self, action: str) -> bool:
        with self._lock:
            now = time.time()
            window_start = now - 60

            if action not in self._action_counts:
                self._action_counts[action] = []

            self._action_counts[action] = [
                t for t in self._action_counts[action] if t > window_start
            ]
            self._action_counts[action].append(now)

            count = len(self._action_counts[action])

            thresholds = {
                "send_email": 20,
                "send_sms": 30,
                "make_call": 10,
                "send_telegram": 50,
                "send_slack": 50,
            }

            threshold = thresholds.get(action, 100)

            if count > threshold:
                self.kill_switch.trigger(
                    KillReason.RATE_LIMIT_EXCEEDED,
                    details=f"Action '{action}' exceeded rate limit: {count}/{threshold} per minute",
                    triggered_by="anomaly_detector",
                )
                return False

            return True
