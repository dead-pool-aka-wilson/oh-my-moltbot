#!/usr/bin/env python3
"""Telegram-based approval bot for Zone 1 executor."""

import json
import time
import threading
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from .integrations.telegram import TelegramIntegration


class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


@dataclass
class ApprovalRequest:
    approval_id: str
    action: str
    params: Dict[str, Any]
    requester: str
    created_at: datetime
    expires_at: datetime
    status: ApprovalStatus = ApprovalStatus.PENDING
    message_id: Optional[int] = None
    chat_id: Optional[int] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class ApprovalBot:
    APPROVAL_TIMEOUT_SECONDS = 300

    def __init__(
        self,
        credentials: Dict[str, str],
        admin_chat_id: int,
        on_approval: Optional[Callable[[str, bool], None]] = None,
    ):
        self.telegram = TelegramIntegration(credentials)
        self.admin_chat_id = admin_chat_id
        self.on_approval = on_approval

        self.pending_requests: Dict[str, ApprovalRequest] = {}
        self.running = False
        self._poll_thread: Optional[threading.Thread] = None
        self._last_update_id = 0

    def start(self):
        self.running = True
        self._poll_thread = threading.Thread(target=self._poll_updates, daemon=True)
        self._poll_thread.start()

    def stop(self):
        self.running = False
        if self._poll_thread:
            self._poll_thread.join(timeout=5)

    def request_approval(
        self,
        approval_id: str,
        action: str,
        params: Dict[str, Any],
        requester: str = "system",
    ) -> ApprovalRequest:
        now = datetime.now(timezone.utc)
        expires = datetime.fromtimestamp(
            now.timestamp() + self.APPROVAL_TIMEOUT_SECONDS,
            tz=timezone.utc,
        )

        request = ApprovalRequest(
            approval_id=approval_id,
            action=action,
            params=params,
            requester=requester,
            created_at=now,
            expires_at=expires,
        )

        message_text = self._format_approval_message(request)
        buttons = [
            [
                {"text": "Approve", "callback_data": f"approve:{approval_id}"},
                {"text": "Reject", "callback_data": f"reject:{approval_id}"},
            ]
        ]

        result = self.telegram.send_message_with_buttons(
            chat_id=self.admin_chat_id,
            text=message_text,
            buttons=buttons,
        )

        request.message_id = result.get("message_id")
        request.chat_id = self.admin_chat_id
        self.pending_requests[approval_id] = request

        return request

    def _format_approval_message(self, request: ApprovalRequest) -> str:
        params_str = json.dumps(request.params, indent=2)
        return (
            f"**APPROVAL REQUEST**\n\n"
            f"Action: `{request.action}`\n"
            f"Requester: {request.requester}\n"
            f"Time: {request.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            f"Expires: {request.expires_at.strftime('%H:%M:%S UTC')}\n\n"
            f"Parameters:\n```\n{params_str}\n```\n\n"
            f"ID: `{request.approval_id}`"
        )

    def _poll_updates(self):
        while self.running:
            try:
                updates = self.telegram.get_updates(
                    offset=self._last_update_id + 1 if self._last_update_id else None,
                    timeout=30,
                )

                for update in updates:
                    self._last_update_id = max(
                        self._last_update_id,
                        update.get("update_id", 0),
                    )

                    callback = update.get("callback_query")
                    if callback:
                        self._handle_callback(callback)

                self._check_expired_requests()

            except Exception as e:
                print(f"Approval bot poll error: {e}")
                time.sleep(5)

    def _handle_callback(self, callback: Dict[str, Any]):
        callback_id = callback.get("id", "")
        data = callback.get("data", "")
        user = callback.get("from", {})
        username = user.get("username") or user.get("first_name", "unknown")

        if ":" not in data:
            return

        action, approval_id = data.split(":", 1)

        if approval_id not in self.pending_requests:
            self.telegram.answer_callback_query(
                callback_id,
                text="This request has expired or was already processed.",
            )
            return

        request = self.pending_requests[approval_id]

        if action == "approve":
            request.status = ApprovalStatus.APPROVED
            request.approved_by = username
            request.approved_at = datetime.now(timezone.utc)
            response_text = f"APPROVED by @{username}"

        elif action == "reject":
            request.status = ApprovalStatus.REJECTED
            request.approved_by = username
            request.approved_at = datetime.now(timezone.utc)
            response_text = f"REJECTED by @{username}"

        else:
            return

        self.telegram.answer_callback_query(callback_id, text=response_text)

        if request.message_id and request.chat_id:
            updated_text = (
                self._format_approval_message(request)
                + f"\n\n**Status: {response_text}**"
            )
            self.telegram.edit_message_text(
                chat_id=request.chat_id,
                message_id=request.message_id,
                text=updated_text,
            )

        del self.pending_requests[approval_id]

        if self.on_approval:
            self.on_approval(approval_id, request.status == ApprovalStatus.APPROVED)

    def _check_expired_requests(self):
        now = datetime.now(timezone.utc)
        expired = [
            aid for aid, req in self.pending_requests.items() if now > req.expires_at
        ]

        for approval_id in expired:
            request = self.pending_requests[approval_id]
            request.status = ApprovalStatus.EXPIRED

            if request.message_id and request.chat_id:
                updated_text = (
                    self._format_approval_message(request) + "\n\n**Status: EXPIRED**"
                )
                try:
                    self.telegram.edit_message_text(
                        chat_id=request.chat_id,
                        message_id=request.message_id,
                        text=updated_text,
                    )
                except Exception:
                    pass

            del self.pending_requests[approval_id]

            if self.on_approval:
                self.on_approval(approval_id, False)

    def get_request_status(self, approval_id: str) -> Optional[ApprovalStatus]:
        if approval_id in self.pending_requests:
            return self.pending_requests[approval_id].status
        return None

    def cancel_request(self, approval_id: str) -> bool:
        if approval_id not in self.pending_requests:
            return False

        request = self.pending_requests[approval_id]

        if request.message_id and request.chat_id:
            try:
                self.telegram.edit_message_text(
                    chat_id=request.chat_id,
                    message_id=request.message_id,
                    text=self._format_approval_message(request)
                    + "\n\n**Status: CANCELLED**",
                )
            except Exception:
                pass

        del self.pending_requests[approval_id]
        return True
