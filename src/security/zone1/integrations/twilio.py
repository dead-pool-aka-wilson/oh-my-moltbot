#!/usr/bin/env python3
"""Twilio API integration for Zone 1 executor (calls and SMS)."""

import base64
import json
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class CallStatus:
    sid: str
    status: str
    to: str
    from_number: str
    duration: Optional[int] = None


@dataclass
class SmsStatus:
    sid: str
    status: str
    to: str
    from_number: str
    body: str


class TwilioIntegration:
    BASE_URL = (
        "https://api.twilio.com/2010-04-01/Accounts/{account_sid}/{resource}.json"
    )

    def __init__(self, credentials: Dict[str, str]):
        self.account_sid = credentials.get("twilio_account_sid", "")
        self.auth_token = credentials.get("twilio_auth_token", "")
        self.from_number = credentials.get("twilio_phone_number", "")

        if not all([self.account_sid, self.auth_token, self.from_number]):
            raise ValueError("Twilio credentials not fully configured")

        auth_string = f"{self.account_sid}:{self.auth_token}"
        self.auth_header = base64.b64encode(auth_string.encode()).decode()

    def _request(
        self,
        resource: str,
        method: str = "GET",
        data: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        url = self.BASE_URL.format(
            account_sid=self.account_sid,
            resource=resource,
        )

        headers = {
            "Authorization": f"Basic {self.auth_header}",
        }

        if data:
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            req = urllib.request.Request(url, data=encoded_data, headers=headers)
        else:
            req = urllib.request.Request(url, headers=headers)

        if method != "GET":
            req.method = method

        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def make_call(
        self,
        to: str,
        twiml: Optional[str] = None,
        url: Optional[str] = None,
        status_callback: Optional[str] = None,
    ) -> CallStatus:
        if not twiml and not url:
            twiml = "<Response><Say>Hello, this is an automated call from Moltbot.</Say></Response>"

        data = {
            "To": to,
            "From": self.from_number,
        }

        if twiml:
            data["Twiml"] = twiml
        elif url:
            data["Url"] = url

        if status_callback:
            data["StatusCallback"] = status_callback

        result = self._request("Calls", method="POST", data=data)

        return CallStatus(
            sid=result.get("sid", ""),
            status=result.get("status", ""),
            to=result.get("to", ""),
            from_number=result.get("from", ""),
        )

    def send_sms(
        self,
        to: str,
        body: str,
        status_callback: Optional[str] = None,
    ) -> SmsStatus:
        data = {
            "To": to,
            "From": self.from_number,
            "Body": body,
        }

        if status_callback:
            data["StatusCallback"] = status_callback

        result = self._request("Messages", method="POST", data=data)

        return SmsStatus(
            sid=result.get("sid", ""),
            status=result.get("status", ""),
            to=result.get("to", ""),
            from_number=result.get("from", ""),
            body=result.get("body", ""),
        )

    def get_call_status(self, call_sid: str) -> CallStatus:
        result = self._request(f"Calls/{call_sid}")

        return CallStatus(
            sid=result.get("sid", ""),
            status=result.get("status", ""),
            to=result.get("to", ""),
            from_number=result.get("from", ""),
            duration=int(result.get("duration", 0)) if result.get("duration") else None,
        )

    def get_sms_status(self, message_sid: str) -> SmsStatus:
        result = self._request(f"Messages/{message_sid}")

        return SmsStatus(
            sid=result.get("sid", ""),
            status=result.get("status", ""),
            to=result.get("to", ""),
            from_number=result.get("from", ""),
            body=result.get("body", ""),
        )

    def list_calls(self, limit: int = 10) -> list:
        result = self._request(f"Calls?PageSize={limit}")
        return result.get("calls", [])

    def list_messages(self, limit: int = 10) -> list:
        result = self._request(f"Messages?PageSize={limit}")
        return result.get("messages", [])
