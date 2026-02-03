#!/usr/bin/env python3
"""Zone 1 Executor - Main service coordinating policy, credentials, and actions."""

import socket
import json
import sys
import logging
import signal
from datetime import datetime, timezone
from typing import Dict, Any, Callable, Optional

from .policy import PolicyEngine, ALLOWED_ACTIONS
from .credentials import CredentialInjector
from .kill_switch import KillSwitch, KillReason, AnomalyDetector

HOST_IP = "0.0.0.0"
HOST_PORT = 9999

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class ZoneExecutor:
    def __init__(self, host: str = HOST_IP, port: int = HOST_PORT):
        self.host = host
        self.port = port
        self.server: Optional[socket.socket] = None
        self.running = False

        self.policy = PolicyEngine()
        self.credentials = CredentialInjector()
        self.kill_switch = KillSwitch(on_kill=lambda e: self._on_kill(e))
        self.anomaly_detector = AnomalyDetector(self.kill_switch)
        self.kill_switch.register_shutdown_callback(self.stop)

        self.pending_approvals: Dict[str, Dict[str, Any]] = {}
        self._integrations: Dict[str, Any] = {}

    def _on_kill(self, event: Any):
        logger.critical(
            f"KILL SWITCH TRIGGERED: {event.reason.value} - {event.details}"
        )

        self.handlers: Dict[str, Callable] = {
            "ping": self.handle_ping,
            "capability_request": self.handle_capability_request,
            "capability_execute": self.handle_capability_execute,
            "content_sanitized": self.handle_content_sanitized,
            "approval_response": self.handle_approval_response,
            "list_actions": self.handle_list_actions,
            "kill": self.handle_kill,
            "status": self.handle_status,
        }

    def start(self):
        # Only set signal handlers in main thread
        import threading

        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, self._signal_handler)
            signal.signal(signal.SIGINT, self._signal_handler)

        self.kill_switch.start()

        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind((self.host, self.port))
        self.server.listen(10)
        self.running = True

        logger.info(f"Zone 1 Executor started on {self.host}:{self.port}")

        while self.running:
            try:
                conn, addr = self.server.accept()
                logger.info(f"Connection from {addr}")
                self._handle_connection(conn)
            except OSError:
                break
            except Exception as e:
                logger.error(f"Error accepting connection: {e}")

    def _signal_handler(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()

    def _handle_connection(self, conn: socket.socket):
        try:
            data = b""
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                data += chunk
                if b"\n" in data:
                    break

            if not data:
                return

            message = json.loads(data.decode("utf-8").strip())
            msg_type = message.get("type", "")
            logger.info(f"Received: {msg_type}")

            handler = self.handlers.get(msg_type, self._handle_unknown)
            response = handler(message)

            response_data = json.dumps(response) + "\n"
            conn.sendall(response_data.encode("utf-8"))

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            conn.sendall(
                json.dumps({"type": "error", "message": "Invalid JSON"}).encode()
                + b"\n"
            )
        except Exception as e:
            logger.error(f"Error handling connection: {e}")
            conn.sendall(
                json.dumps({"type": "error", "message": str(e)}).encode() + b"\n"
            )
        finally:
            conn.close()

    def handle_ping(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": "pong",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "server": "zone1-executor",
            "version": "1.0.0",
        }

    def handle_capability_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        action = message.get("action", "")
        params = message.get("params", {})
        request_id = message.get("request_id", "")

        policy_result = self.policy.check_action(action, params)

        if not policy_result.get("allowed"):
            return {
                "type": "capability_response",
                "request_id": request_id,
                "status": "denied",
                "error": policy_result.get("error"),
                "message": policy_result.get("message"),
            }

        if policy_result.get("requires_approval"):
            approval_id = f"approval_{datetime.now().strftime('%Y%m%d%H%M%S')}_{action}"
            self.pending_approvals[approval_id] = {
                "action": action,
                "params": params,
                "request_id": request_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            return {
                "type": "capability_response",
                "request_id": request_id,
                "status": "pending_approval",
                "approval_id": approval_id,
                "message": f"Action '{action}' requires approval",
            }

        return {
            "type": "capability_response",
            "request_id": request_id,
            "status": "approved",
            "message": f"Action '{action}' is allowed without approval",
        }

    def handle_capability_execute(self, message: Dict[str, Any]) -> Dict[str, Any]:
        action = message.get("action", "")
        params = message.get("params", {})
        approval_id = message.get("approval_id")

        if approval_id and approval_id not in self.pending_approvals:
            return {
                "type": "execute_response",
                "status": "error",
                "message": "Invalid or expired approval ID",
            }

        try:
            credentials = self.credentials.inject_for_action(action)

            result = self._execute_action(action, params, credentials)

            if approval_id:
                del self.pending_approvals[approval_id]

            return {
                "type": "execute_response",
                "status": "success",
                "action": action,
                "result": result,
            }
        except Exception as e:
            logger.error(f"Action execution failed: {e}")
            return {
                "type": "execute_response",
                "status": "error",
                "action": action,
                "message": str(e),
            }

    def _execute_action(
        self, action: str, params: Dict[str, Any], credentials: Dict[str, str]
    ) -> Dict[str, Any]:
        if self.kill_switch.is_killed():
            raise RuntimeError("System is in killed state - all actions blocked")

        if not self.anomaly_detector.record_action(action):
            raise RuntimeError("Action blocked by anomaly detector")

        logger.info(f"Executing action: {action} with params: {list(params.keys())}")

        try:
            if action == "read_email":
                return self._exec_read_email(params, credentials)
            elif action == "send_email":
                return self._exec_send_email(params, credentials)
            elif action == "read_telegram":
                return self._exec_read_telegram(params, credentials)
            elif action == "send_telegram":
                return self._exec_send_telegram(params, credentials)
            elif action == "read_slack":
                return self._exec_read_slack(params, credentials)
            elif action == "send_slack":
                return self._exec_send_slack(params, credentials)
            elif action == "make_call":
                return self._exec_make_call(params, credentials)
            elif action == "send_sms":
                return self._exec_send_sms(params, credentials)
            else:
                return {
                    "executed": True,
                    "action": action,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
        except Exception as e:
            logger.error(f"Action {action} failed: {e}")
            raise

    def _exec_read_email(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.himalaya import HimalayaIntegration

        himalaya = HimalayaIntegration(account="moltbot")
        emails = himalaya.read_emails(
            folder=params.get("folder", "INBOX"),
            limit=params.get("limit", 10),
        )
        return {
            "emails": [
                {"id": e.id, "subject": e.subject, "from": e.from_addr, "date": e.date}
                for e in emails
            ],
            "count": len(emails),
        }

    def _exec_send_email(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.himalaya import HimalayaIntegration

        himalaya = HimalayaIntegration(account="moltbot")
        return himalaya.send_email(
            to=params["to"],
            subject=params["subject"],
            body=params["body"],
            cc=params.get("cc"),
        )

    def _exec_read_telegram(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.telegram import TelegramIntegration

        tg = TelegramIntegration(creds)
        messages = tg.read_messages(
            chat_id=params.get("chat_id"),
            limit=params.get("limit", 10),
        )
        return {"messages": [{"text": m.text, "from": m.from_user} for m in messages]}

    def _exec_send_telegram(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.telegram import TelegramIntegration

        tg = TelegramIntegration(creds)
        return tg.send_message(
            chat_id=params["chat_id"],
            text=params["text"],
            parse_mode=params.get("parse_mode"),
        )

    def _exec_read_slack(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.slack import SlackIntegration

        slack = SlackIntegration(creds)
        messages = slack.read_messages(
            channel=params["channel"],
            limit=params.get("limit", 10),
        )
        return {"messages": [{"text": m.text, "user": m.user} for m in messages]}

    def _exec_send_slack(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.slack import SlackIntegration

        slack = SlackIntegration(creds)
        return slack.send_message(
            channel=params["channel"],
            text=params["text"],
            thread_ts=params.get("thread_ts"),
        )

    def _exec_make_call(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.twilio import TwilioIntegration

        twilio = TwilioIntegration(creds)
        result = twilio.make_call(
            to=params["to"],
            twiml=params.get("twiml"),
            url=params.get("url"),
        )
        return {"sid": result.sid, "status": result.status}

    def _exec_send_sms(
        self, params: Dict[str, Any], creds: Dict[str, str]
    ) -> Dict[str, Any]:
        from .integrations.twilio import TwilioIntegration

        twilio = TwilioIntegration(creds)
        result = twilio.send_sms(
            to=params["to"],
            body=params["body"],
        )
        return {"sid": result.sid, "status": result.status}

    def handle_content_sanitized(self, message: Dict[str, Any]) -> Dict[str, Any]:
        source = message.get("source", "")
        content = message.get("content", {})

        logger.info(f"Received sanitized content from {source}")

        return {
            "type": "content_received",
            "source": source,
            "status": "acknowledged",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def handle_approval_response(self, message: Dict[str, Any]) -> Dict[str, Any]:
        approval_id = message.get("approval_id", "")
        approved = message.get("approved", False)

        if approval_id not in self.pending_approvals:
            return {
                "type": "approval_result",
                "status": "error",
                "message": "Unknown approval ID",
            }

        pending = self.pending_approvals[approval_id]

        if approved:
            result = self.handle_capability_execute(
                {
                    "action": pending["action"],
                    "params": pending["params"],
                    "approval_id": approval_id,
                }
            )
            return {
                "type": "approval_result",
                "status": "executed",
                "result": result,
            }
        else:
            del self.pending_approvals[approval_id]
            return {
                "type": "approval_result",
                "status": "rejected",
                "message": "Approval was denied",
            }

    def handle_list_actions(self, message: Dict[str, Any]) -> Dict[str, Any]:
        actions = {
            name: {
                "requires_approval": policy.requires_approval.value,
                "rate_limit": policy.rate_limit,
                "description": policy.description,
            }
            for name, policy in ALLOWED_ACTIONS.items()
        }
        return {
            "type": "actions_list",
            "actions": actions,
        }

    def handle_kill(self, message: Dict[str, Any]) -> Dict[str, Any]:
        reason = message.get("reason", "manual")
        details = message.get("details", "Kill command received")
        triggered_by = message.get("triggered_by", "remote")

        event = self.kill_switch.trigger(
            KillReason.MANUAL if reason == "manual" else KillReason.SECURITY_BREACH,
            details=details,
            triggered_by=triggered_by,
        )

        return {
            "type": "kill_response",
            "status": "killed",
            "timestamp": event.timestamp.isoformat(),
            "reason": event.reason.value,
        }

    def handle_status(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": "status_response",
            "running": self.running,
            "kill_switch": self.kill_switch.get_status(),
            "pending_approvals": len(self.pending_approvals),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _handle_unknown(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": "error",
            "message": f"Unknown message type: {message.get('type', '')}",
        }

    def stop(self):
        self.running = False
        self.kill_switch.stop()
        if self.server:
            self.server.close()
        logger.info("Zone 1 Executor stopped")


def main():
    executor = ZoneExecutor()
    try:
        executor.start()
    except KeyboardInterrupt:
        pass
    finally:
        executor.stop()


if __name__ == "__main__":
    main()
