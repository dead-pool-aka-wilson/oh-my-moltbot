#!/usr/bin/env python3
"""Gmail API integration for Zone 1 executor."""

import base64
import json
from typing import Dict, Any, List, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GmailIntegration:
    SCOPES = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ]

    def __init__(self, credentials: Dict[str, str]):
        self.credentials = credentials
        self._service = None

    def _get_service(self):
        if self._service:
            return self._service

        creds_data = json.loads(self.credentials.get("gmail_oauth_token", "{}"))
        if not creds_data:
            raise ValueError("Gmail OAuth token not configured")

        creds = Credentials.from_authorized_user_info(creds_data, self.SCOPES)

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())

        self._service = build("gmail", "v1", credentials=creds)
        return self._service

    def read_emails(
        self,
        folder: str = "INBOX",
        limit: int = 10,
        query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        service = self._get_service()

        q = f"in:{folder}"
        if query:
            q += f" {query}"

        results = (
            service.users()
            .messages()
            .list(userId="me", q=q, maxResults=limit)
            .execute()
        )

        messages = results.get("messages", [])
        emails = []

        for msg in messages:
            full_msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg["id"], format="full")
                .execute()
            )

            headers = {
                h["name"].lower(): h["value"]
                for h in full_msg.get("payload", {}).get("headers", [])
            }

            body = self._extract_body(full_msg.get("payload", {}))

            emails.append(
                {
                    "id": msg["id"],
                    "thread_id": full_msg.get("threadId"),
                    "subject": headers.get("subject", ""),
                    "from": headers.get("from", ""),
                    "to": headers.get("to", ""),
                    "date": headers.get("date", ""),
                    "snippet": full_msg.get("snippet", ""),
                    "body": body,
                }
            )

        return emails

    def _extract_body(self, payload: Dict[str, Any]) -> str:
        if "body" in payload and payload["body"].get("data"):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8")

        if "parts" in payload:
            for part in payload["parts"]:
                if part.get("mimeType") == "text/plain":
                    if part.get("body", {}).get("data"):
                        return base64.urlsafe_b64decode(part["body"]["data"]).decode(
                            "utf-8"
                        )
                elif part.get("mimeType") == "text/html":
                    if part.get("body", {}).get("data"):
                        return base64.urlsafe_b64decode(part["body"]["data"]).decode(
                            "utf-8"
                        )

        return ""

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        html: bool = False,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
    ) -> Dict[str, Any]:
        service = self._get_service()

        message = MIMEMultipart("alternative") if html else MIMEText(body)

        if html:
            message.attach(MIMEText(body, "plain"))
            message.attach(MIMEText(body, "html"))

        message["to"] = to
        message["subject"] = subject

        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        result = (
            service.users().messages().send(userId="me", body={"raw": raw}).execute()
        )

        return {
            "success": True,
            "message_id": result.get("id"),
            "thread_id": result.get("threadId"),
        }

    def reply_to_email(
        self,
        thread_id: str,
        message_id: str,
        to: str,
        subject: str,
        body: str,
    ) -> Dict[str, Any]:
        service = self._get_service()

        message = MIMEText(body)
        message["to"] = to
        message["subject"] = f"Re: {subject}"
        message["In-Reply-To"] = message_id
        message["References"] = message_id

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        result = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw, "threadId": thread_id})
            .execute()
        )

        return {
            "success": True,
            "message_id": result.get("id"),
            "thread_id": result.get("threadId"),
        }
