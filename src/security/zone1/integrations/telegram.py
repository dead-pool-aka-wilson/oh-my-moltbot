#!/usr/bin/env python3
"""Telegram Bot API integration for Zone 1 executor."""

import json
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class TelegramMessage:
    message_id: int
    chat_id: int
    text: str
    from_user: str
    date: int


class TelegramIntegration:
    BASE_URL = "https://api.telegram.org/bot{token}/{method}"

    def __init__(self, credentials: Dict[str, str]):
        self.token = credentials.get("telegram_bot_token", "")
        if not self.token:
            raise ValueError("Telegram bot token not configured")

    def _request(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = self.BASE_URL.format(token=self.token, method=method)

        if params:
            data = json.dumps(params).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
            )
        else:
            req = urllib.request.Request(url)

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))

        if not result.get("ok"):
            raise RuntimeError(f"Telegram API error: {result.get('description')}")

        return result.get("result", {})

    def get_me(self) -> Dict[str, Any]:
        return self._request("getMe")

    def get_updates(
        self,
        offset: Optional[int] = None,
        limit: int = 100,
        timeout: int = 0,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"limit": limit, "timeout": timeout}
        if offset:
            params["offset"] = offset

        result = self._request("getUpdates", params)
        return result if isinstance(result, list) else []

    def read_messages(
        self,
        chat_id: Optional[int] = None,
        limit: int = 10,
    ) -> List[TelegramMessage]:
        updates = self.get_updates(limit=limit)
        messages = []

        for update in updates:
            msg = update.get("message", {})
            if not msg:
                continue

            if chat_id and msg.get("chat", {}).get("id") != chat_id:
                continue

            from_user = msg.get("from", {})
            username = from_user.get("username", "")
            first_name = from_user.get("first_name", "")

            messages.append(
                TelegramMessage(
                    message_id=msg.get("message_id", 0),
                    chat_id=msg.get("chat", {}).get("id", 0),
                    text=msg.get("text", ""),
                    from_user=username or first_name,
                    date=msg.get("date", 0),
                )
            )

        return messages

    def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: Optional[str] = None,
        reply_to_message_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        params = {
            "chat_id": chat_id,
            "text": text,
        }

        if parse_mode:
            params["parse_mode"] = parse_mode
        if reply_to_message_id:
            params["reply_to_message_id"] = reply_to_message_id

        result = self._request("sendMessage", params)

        return {
            "success": True,
            "message_id": result.get("message_id"),
            "chat_id": result.get("chat", {}).get("id"),
        }

    def send_message_with_buttons(
        self,
        chat_id: int,
        text: str,
        buttons: List[List[Dict[str, str]]],
    ) -> Dict[str, Any]:
        params = {
            "chat_id": chat_id,
            "text": text,
            "reply_markup": {
                "inline_keyboard": buttons,
            },
        }

        result = self._request("sendMessage", params)

        return {
            "success": True,
            "message_id": result.get("message_id"),
        }

    def answer_callback_query(
        self,
        callback_query_id: str,
        text: Optional[str] = None,
    ) -> bool:
        params: Dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            params["text"] = text

        self._request("answerCallbackQuery", params)
        return True

    def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
    ) -> Dict[str, Any]:
        params = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
        }

        return self._request("editMessageText", params)
