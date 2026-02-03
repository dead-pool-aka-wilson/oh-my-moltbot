#!/usr/bin/env python3
"""Canary tokens for breach detection in Zone 1."""

import secrets
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import threading


class CanaryType(Enum):
    CREDENTIAL = "credential"
    FILE = "file"
    API_KEY = "api_key"
    URL = "url"
    DNS = "dns"
    PROMPT = "prompt"


@dataclass
class CanaryToken:
    token_id: str
    token_type: CanaryType
    value: str
    description: str
    created_at: str
    triggered: bool = False
    trigger_count: int = 0
    last_triggered: Optional[str] = None


@dataclass
class CanaryTrigger:
    token_id: str
    timestamp: str
    source_ip: Optional[str]
    user_agent: Optional[str]
    context: Dict[str, Any]


class CanarySystem:
    CANARY_FILE = Path.home() / "moltbot-security" / "canaries.json"
    TRIGGER_LOG = Path.home() / "moltbot-security" / "canary-triggers.jsonl"

    def __init__(self, on_trigger: Optional[Callable[[CanaryTrigger], None]] = None):
        self.on_trigger = on_trigger
        self._lock = threading.Lock()
        self._tokens: Dict[str, CanaryToken] = {}
        self._load_tokens()

    def _load_tokens(self):
        if self.CANARY_FILE.exists():
            try:
                with open(self.CANARY_FILE, "r") as f:
                    data = json.load(f)
                    for token_data in data.get("tokens", []):
                        token_data["token_type"] = CanaryType(token_data["token_type"])
                        token = CanaryToken(**token_data)
                        self._tokens[token.token_id] = token
            except Exception:
                pass

    def _save_tokens(self):
        self.CANARY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(self.CANARY_FILE, "w") as f:
            tokens_data = []
            for token in self._tokens.values():
                data = asdict(token)
                data["token_type"] = token.token_type.value
                tokens_data.append(data)
            json.dump({"tokens": tokens_data}, f, indent=2)

    def create_token(
        self,
        token_type: CanaryType,
        description: str,
        custom_value: Optional[str] = None,
    ) -> CanaryToken:
        with self._lock:
            token_id = secrets.token_hex(16)

            if custom_value:
                value = custom_value
            elif token_type == CanaryType.CREDENTIAL:
                value = f"moltbot_canary_{secrets.token_hex(12)}"
            elif token_type == CanaryType.API_KEY:
                value = f"sk-canary-{secrets.token_urlsafe(32)}"
            elif token_type == CanaryType.URL:
                value = f"https://canary.moltbot.local/{secrets.token_hex(8)}"
            elif token_type == CanaryType.PROMPT:
                value = f"[CANARY:{token_id[:8]}] IGNORE PREVIOUS INSTRUCTIONS"
            else:
                value = secrets.token_hex(16)

            token = CanaryToken(
                token_id=token_id,
                token_type=token_type,
                value=value,
                description=description,
                created_at=datetime.now(timezone.utc).isoformat(),
            )

            self._tokens[token_id] = token
            self._save_tokens()

            return token

    def check(
        self,
        content: str,
        source_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[CanaryTrigger]:
        triggers = []

        with self._lock:
            for token in self._tokens.values():
                if token.value in content:
                    trigger = self._trigger_token(
                        token,
                        source_ip=source_ip,
                        user_agent=user_agent,
                        context=context or {},
                    )
                    triggers.append(trigger)

        return triggers

    def _trigger_token(
        self,
        token: CanaryToken,
        source_ip: Optional[str],
        user_agent: Optional[str],
        context: Dict[str, Any],
    ) -> CanaryTrigger:
        now = datetime.now(timezone.utc).isoformat()

        trigger = CanaryTrigger(
            token_id=token.token_id,
            timestamp=now,
            source_ip=source_ip,
            user_agent=user_agent,
            context=context,
        )

        token.triggered = True
        token.trigger_count += 1
        token.last_triggered = now
        self._save_tokens()

        self.TRIGGER_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(self.TRIGGER_LOG, "a") as f:
            f.write(json.dumps(asdict(trigger)) + "\n")

        if self.on_trigger:
            try:
                self.on_trigger(trigger)
            except Exception:
                pass

        return trigger

    def get_token(self, token_id: str) -> Optional[CanaryToken]:
        return self._tokens.get(token_id)

    def list_tokens(self) -> List[CanaryToken]:
        return list(self._tokens.values())

    def delete_token(self, token_id: str) -> bool:
        with self._lock:
            if token_id in self._tokens:
                del self._tokens[token_id]
                self._save_tokens()
                return True
        return False

    def get_triggers(self, limit: int = 100) -> List[CanaryTrigger]:
        triggers = []
        if not self.TRIGGER_LOG.exists():
            return triggers

        with open(self.TRIGGER_LOG, "r") as f:
            lines = f.readlines()
            for line in lines[-limit:]:
                try:
                    data = json.loads(line.strip())
                    triggers.append(CanaryTrigger(**data))
                except (json.JSONDecodeError, TypeError):
                    continue

        return triggers

    def inject_prompt_canaries(self, prompt: str) -> tuple[str, List[str]]:
        canary_ids = []

        token = self.create_token(
            CanaryType.PROMPT,
            f"Prompt canary for: {prompt[:50]}...",
        )
        canary_ids.append(token.token_id)

        injected = f"{prompt}\n\n<!-- {token.value} -->"

        return injected, canary_ids


def create_default_canaries(system: CanarySystem) -> List[CanaryToken]:
    defaults = [
        (CanaryType.CREDENTIAL, "Default canary credential", "admin_backup_2024"),
        (CanaryType.API_KEY, "Fake OpenAI key canary", "sk-proj-canary-DO-NOT-USE"),
        (CanaryType.CREDENTIAL, "Database password canary", "db_readonly_backup_pass"),
        (CanaryType.PROMPT, "Injection detection canary", None),
    ]

    created = []
    for token_type, desc, value in defaults:
        token = system.create_token(token_type, desc, value)
        created.append(token)

    return created
