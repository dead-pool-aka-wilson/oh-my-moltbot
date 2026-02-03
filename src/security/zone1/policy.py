#!/usr/bin/env python3
"""Policy engine for Zone 1 executor - defines allowed actions and approval requirements."""

from dataclasses import dataclass
from typing import Dict, Any, Optional
from enum import Enum


class ApprovalLevel(Enum):
    NONE = "none"
    NOTIFY = "notify"
    APPROVE = "approve"


@dataclass
class ActionPolicy:
    requires_approval: ApprovalLevel
    rate_limit: str
    description: str


ALLOWED_ACTIONS: Dict[str, ActionPolicy] = {
    "send_email": ActionPolicy(
        requires_approval=ApprovalLevel.APPROVE,
        rate_limit="10/hour",
        description="Send email via Gmail API",
    ),
    "send_telegram": ActionPolicy(
        requires_approval=ApprovalLevel.APPROVE,
        rate_limit="50/hour",
        description="Send Telegram message",
    ),
    "send_slack": ActionPolicy(
        requires_approval=ApprovalLevel.APPROVE,
        rate_limit="50/hour",
        description="Send Slack message",
    ),
    "make_call": ActionPolicy(
        requires_approval=ApprovalLevel.APPROVE,
        rate_limit="5/hour",
        description="Make phone call via Twilio",
    ),
    "send_sms": ActionPolicy(
        requires_approval=ApprovalLevel.APPROVE,
        rate_limit="20/hour",
        description="Send SMS via Twilio",
    ),
    "read_email": ActionPolicy(
        requires_approval=ApprovalLevel.NONE,
        rate_limit="100/hour",
        description="Read emails (no approval needed)",
    ),
    "read_telegram": ActionPolicy(
        requires_approval=ApprovalLevel.NONE,
        rate_limit="100/hour",
        description="Read Telegram messages",
    ),
    "read_slack": ActionPolicy(
        requires_approval=ApprovalLevel.NONE,
        rate_limit="100/hour",
        description="Read Slack messages",
    ),
}


class PolicyEngine:
    def __init__(self):
        self.rate_counts: Dict[str, int] = {}

    def check_action(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if action not in ALLOWED_ACTIONS:
            return {
                "allowed": False,
                "error": "action_not_allowed",
                "message": f"Action '{action}' is not in the allowed actions list",
            }

        policy = ALLOWED_ACTIONS[action]

        if not self._check_rate_limit(action, policy.rate_limit):
            return {
                "allowed": False,
                "error": "rate_limited",
                "message": f"Rate limit exceeded for '{action}': {policy.rate_limit}",
            }

        return {
            "allowed": True,
            "requires_approval": policy.requires_approval != ApprovalLevel.NONE,
            "approval_level": policy.requires_approval.value,
            "description": policy.description,
        }

    def _check_rate_limit(self, action: str, limit: str) -> bool:
        # Parse limit like "10/hour"
        count, _ = limit.split("/")
        max_count = int(count)

        current = self.rate_counts.get(action, 0)
        if current >= max_count:
            return False

        self.rate_counts[action] = current + 1
        return True

    def reset_rate_limits(self):
        self.rate_counts = {}
