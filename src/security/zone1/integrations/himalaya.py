#!/usr/bin/env python3
"""Himalaya-based email integration for Zone 1 executor."""

import subprocess
import json
import os
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


SOPS_AGE_KEY = os.path.expanduser("~/.config/sops/age/keys.txt")


@dataclass
class Email:
    id: str
    subject: str
    from_addr: str
    date: str
    flags: str
    body: Optional[str] = None


class HimalayaIntegration:
    def __init__(self, account: str = "moltbot"):
        self.account = account
        self.env = os.environ.copy()
        self.env["SOPS_AGE_KEY_FILE"] = SOPS_AGE_KEY

    def _run(self, *args: str) -> str:
        cmd = ["himalaya"] + list(args) + ["-a", self.account, "-o", "json"]
        result = subprocess.run(cmd, capture_output=True, text=True, env=self.env)
        if result.returncode != 0:
            raise RuntimeError(f"Himalaya error: {result.stderr}")
        return result.stdout

    def read_emails(
        self,
        folder: str = "INBOX",
        limit: int = 10,
        query: Optional[str] = None,
    ) -> List[Email]:
        args = ["envelope", "list", "--folder", folder, "--page-size", str(limit)]

        output = self._run(*args)
        data = json.loads(output)

        emails = []
        for item in data:
            emails.append(
                Email(
                    id=str(item.get("id", "")),
                    subject=item.get("subject", ""),
                    from_addr=item.get("from", {}).get("addr", "")
                    if isinstance(item.get("from"), dict)
                    else str(item.get("from", "")),
                    date=item.get("date", ""),
                    flags=item.get("flags", ""),
                )
            )

        return emails

    def read_email_body(self, email_id: str, folder: str = "INBOX") -> str:
        output = self._run("message", "read", "--folder", folder, email_id)
        return output

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
    ) -> Dict[str, Any]:
        headers = f"To: {to}\nSubject: {subject}\n"
        if cc:
            headers += f"Cc: {cc}\n"
        if bcc:
            headers += f"Bcc: {bcc}\n"

        message = f"{headers}\n{body}"

        cmd = ["himalaya", "message", "-a", self.account, "send"]
        result = subprocess.run(
            cmd,
            input=message,
            capture_output=True,
            text=True,
            env=self.env,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Send failed: {result.stderr}")

        return {
            "success": True,
            "message": "Email sent successfully",
        }

    def reply_to_email(
        self,
        email_id: str,
        body: str,
        folder: str = "INBOX",
    ) -> Dict[str, Any]:
        cmd = [
            "himalaya",
            "message",
            "-a",
            self.account,
            "reply",
            "--folder",
            folder,
            email_id,
        ]
        result = subprocess.run(
            cmd,
            input=body,
            capture_output=True,
            text=True,
            env=self.env,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Reply failed: {result.stderr}")

        return {
            "success": True,
            "message": "Reply sent successfully",
        }

    def search_emails(
        self,
        query: str,
        folder: str = "INBOX",
        limit: int = 10,
    ) -> List[Email]:
        args = [
            "envelope",
            "list",
            "--folder",
            folder,
            "--page-size",
            str(limit),
            query,
        ]

        output = self._run(*args)
        data = json.loads(output)

        emails = []
        for item in data:
            emails.append(
                Email(
                    id=str(item.get("id", "")),
                    subject=item.get("subject", ""),
                    from_addr=str(item.get("from", "")),
                    date=item.get("date", ""),
                    flags=item.get("flags", ""),
                )
            )

        return emails

    def list_folders(self) -> List[str]:
        output = self._run("folder", "list")
        data = json.loads(output)
        return [f.get("name", "") for f in data]


def test_himalaya():
    h = HimalayaIntegration()

    print("Listing emails...")
    emails = h.read_emails(limit=5)
    for e in emails:
        print(f"  [{e.id}] {e.subject} from {e.from_addr}")

    print("\nListing folders...")
    folders = h.list_folders()
    for f in folders:
        print(f"  - {f}")


if __name__ == "__main__":
    test_himalaya()
