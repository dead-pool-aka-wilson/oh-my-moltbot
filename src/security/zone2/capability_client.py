#!/usr/bin/env python3
"""Capability client for Zone 2 - requests actions from Zone 1 executor."""

import socket
import json
import uuid
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


HOST_IP = "192.168.139.3"
HOST_PORT = 9999


class RequestStatus(Enum):
    APPROVED = "approved"
    PENDING_APPROVAL = "pending_approval"
    DENIED = "denied"
    ERROR = "error"


@dataclass
class CapabilityResponse:
    status: RequestStatus
    request_id: str
    approval_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class CapabilityClient:
    def __init__(self, host: str = HOST_IP, port: int = HOST_PORT):
        self.host = host
        self.port = port

    def _send_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10.0)

        try:
            sock.connect((self.host, self.port))
            sock.send((json.dumps(message) + "\n").encode())

            response = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if b"\n" in response:
                    break

            return json.loads(response.decode().strip())
        finally:
            sock.close()

    def ping(self) -> bool:
        try:
            response = self._send_request({"type": "ping"})
            return response.get("type") == "pong"
        except Exception:
            return False

    def list_actions(self) -> Dict[str, Any]:
        response = self._send_request({"type": "list_actions"})
        return response.get("actions", {})

    def request_capability(
        self, action: str, params: Optional[Dict[str, Any]] = None
    ) -> CapabilityResponse:
        request_id = str(uuid.uuid4())[:8]

        response = self._send_request(
            {
                "type": "capability_request",
                "action": action,
                "params": params or {},
                "request_id": request_id,
            }
        )

        status_str = response.get("status", "error")
        try:
            status = RequestStatus(status_str)
        except ValueError:
            status = RequestStatus.ERROR

        return CapabilityResponse(
            status=status,
            request_id=response.get("request_id", request_id),
            approval_id=response.get("approval_id"),
            message=response.get("message"),
            error=response.get("error"),
        )

    def execute_action(
        self,
        action: str,
        params: Optional[Dict[str, Any]] = None,
        approval_id: Optional[str] = None,
    ) -> CapabilityResponse:
        response = self._send_request(
            {
                "type": "capability_execute",
                "action": action,
                "params": params or {},
                "approval_id": approval_id,
            }
        )

        return CapabilityResponse(
            status=RequestStatus.APPROVED
            if response.get("status") == "success"
            else RequestStatus.ERROR,
            request_id="",
            message=response.get("message"),
            error=response.get("message")
            if response.get("status") == "error"
            else None,
            result=response.get("result"),
        )

    def send_sanitized_content(self, source: str, content: Dict[str, Any]) -> bool:
        response = self._send_request(
            {
                "type": "content_sanitized",
                "source": source,
                "content": content,
            }
        )
        return response.get("status") == "acknowledged"


def test_client():
    client = CapabilityClient()

    print("Testing connection...")
    if not client.ping():
        print("ERROR: Cannot connect to Zone 1 executor")
        return False
    print("Connected!")

    print("\nAvailable actions:")
    actions = client.list_actions()
    for name, info in actions.items():
        print(
            f"  {name}: {info['description']} (approval: {info['requires_approval']})"
        )

    print("\nRequesting read_email (no approval)...")
    result = client.request_capability("read_email")
    print(f"  Status: {result.status.value}")

    print("\nRequesting send_email (requires approval)...")
    result = client.request_capability("send_email", {"to": "test@example.com"})
    print(f"  Status: {result.status.value}")
    print(f"  Approval ID: {result.approval_id}")

    return True


if __name__ == "__main__":
    test_client()
