#!/usr/bin/env python3
"""Slack API integration for Zone 1 executor."""

import json
import urllib.request
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class SlackMessage:
    ts: str
    channel: str
    text: str
    user: str
    thread_ts: Optional[str] = None


class SlackIntegration:
    BASE_URL = "https://slack.com/api/{method}"

    def __init__(self, credentials: Dict[str, str]):
        self.token = credentials.get("slack_bot_token", "")
        if not self.token:
            raise ValueError("Slack bot token not configured")

    def _request(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = self.BASE_URL.format(method=method)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json; charset=utf-8",
        }

        if params:
            data = json.dumps(params).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=headers)
        else:
            req = urllib.request.Request(url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))

        if not result.get("ok"):
            raise RuntimeError(f"Slack API error: {result.get('error')}")

        return result

    def auth_test(self) -> Dict[str, Any]:
        return self._request("auth.test")

    def list_channels(self, limit: int = 100) -> List[Dict[str, Any]]:
        result = self._request(
            "conversations.list",
            {"types": "public_channel,private_channel", "limit": limit},
        )
        return result.get("channels", [])

    def read_messages(
        self,
        channel: str,
        limit: int = 10,
        oldest: Optional[str] = None,
    ) -> List[SlackMessage]:
        params = {"channel": channel, "limit": limit}
        if oldest:
            params["oldest"] = oldest

        result = self._request("conversations.history", params)
        messages = []

        for msg in result.get("messages", []):
            messages.append(
                SlackMessage(
                    ts=msg.get("ts", ""),
                    channel=channel,
                    text=msg.get("text", ""),
                    user=msg.get("user", ""),
                    thread_ts=msg.get("thread_ts"),
                )
            )

        return messages

    def send_message(
        self,
        channel: str,
        text: str,
        thread_ts: Optional[str] = None,
        blocks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "channel": channel,
            "text": text,
        }

        if thread_ts:
            params["thread_ts"] = thread_ts
        if blocks:
            params["blocks"] = blocks

        result = self._request("chat.postMessage", params)

        return {
            "success": True,
            "ts": result.get("ts"),
            "channel": result.get("channel"),
        }

    def send_message_with_buttons(
        self,
        channel: str,
        text: str,
        buttons: List[Dict[str, str]],
        callback_id: str,
    ) -> Dict[str, Any]:
        blocks = [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": text},
            },
            {
                "type": "actions",
                "block_id": callback_id,
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": btn["text"]},
                        "value": btn["value"],
                        "action_id": btn.get("action_id", btn["value"]),
                        "style": btn.get("style", "primary"),
                    }
                    for btn in buttons
                ],
            },
        ]

        return self.send_message(channel, text, blocks=blocks)

    def update_message(
        self,
        channel: str,
        ts: str,
        text: str,
        blocks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "channel": channel,
            "ts": ts,
            "text": text,
        }

        if blocks:
            params["blocks"] = blocks

        result = self._request("chat.update", params)

        return {
            "success": True,
            "ts": result.get("ts"),
        }

    def get_user_info(self, user_id: str) -> Dict[str, Any]:
        result = self._request("users.info", {"user": user_id})
        return result.get("user", {})

    def add_reaction(self, channel: str, ts: str, name: str) -> bool:
        self._request(
            "reactions.add",
            {
                "channel": channel,
                "timestamp": ts,
                "name": name,
            },
        )
        return True
