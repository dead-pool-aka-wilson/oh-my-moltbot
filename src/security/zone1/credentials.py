#!/usr/bin/env python3
"""Credential injector - decrypts and injects secrets at runtime using sops/age."""

import subprocess
import json
import os
from typing import Dict, Any, Optional
from pathlib import Path


SECRETS_DIR = Path.home() / "moltbot-security" / "secrets"
SOPS_AGE_KEY_FILE = Path.home() / ".config" / "sops" / "age" / "keys.txt"


class CredentialInjector:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}

        if not SOPS_AGE_KEY_FILE.exists():
            raise RuntimeError(f"Age key file not found: {SOPS_AGE_KEY_FILE}")

    def get_secret(self, file: str, key: str) -> Optional[str]:
        secrets = self._load_secrets(file)
        return secrets.get(key)

    def get_all_secrets(self, file: str) -> Dict[str, Any]:
        return self._load_secrets(file)

    def _load_secrets(self, file: str) -> Dict[str, Any]:
        if file in self._cache:
            return self._cache[file]

        file_path = SECRETS_DIR / file
        if not file_path.exists():
            raise FileNotFoundError(f"Secret file not found: {file_path}")

        env = os.environ.copy()
        env["SOPS_AGE_KEY_FILE"] = str(SOPS_AGE_KEY_FILE)

        result = subprocess.run(
            ["sops", "-d", "--output-type", "json", str(file_path)],
            capture_output=True,
            text=True,
            env=env,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Failed to decrypt {file}: {result.stderr}")

        secrets = json.loads(result.stdout)
        self._cache[file] = secrets
        return secrets

    def clear_cache(self):
        self._cache = {}

    def inject_for_action(self, action: str) -> Dict[str, str]:
        action_to_secrets = {
            "send_email": ["gmail_token"],
            "read_email": ["gmail_token"],
            "send_telegram": ["telegram_bot_token"],
            "read_telegram": ["telegram_bot_token"],
            "send_slack": ["slack_token"],
            "read_slack": ["slack_token"],
            "make_call": ["twilio_account_sid", "twilio_auth_token"],
            "send_sms": ["twilio_account_sid", "twilio_auth_token"],
        }

        required_keys = action_to_secrets.get(action, [])
        if not required_keys:
            return {}

        secrets = self._load_secrets("api-keys.yaml")
        return {key: secrets.get(key, "") for key in required_keys}
