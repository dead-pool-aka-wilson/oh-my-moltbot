#!/usr/bin/env python3
"""
Zone Bridge TCP Server for OrbStack VM communication.
Binds to OrbStack gateway IP. VMs connect via iptables-allowed host IP only.
Protocol: JSON Lines (one JSON object per line)
"""

import socket
import json
import sys
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Callable

HOST_IP = "0.0.0.0"
HOST_PORT = 9999

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class ZoneBridgeServer:
    def __init__(self, host: str = HOST_IP, port: int = HOST_PORT):
        self.host = host
        self.port = port
        self.server: Optional[socket.socket] = None
        self.running = False
        self.handlers: Dict[str, Callable] = {
            "ping": self.handle_ping,
            "capability_request": self.handle_capability_request,
            "content_sanitized": self.handle_content_sanitized,
        }

    def start(self):
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind((self.host, self.port))
        self.server.listen(5)
        self.running = True

        logger.info(f"Zone Bridge Server started on {self.host}:{self.port}")

        while self.running:
            try:
                conn, addr = self.server.accept()
                logger.info(f"Connection from {addr}")
                self.handle_connection(conn)
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                break
            except Exception as e:
                logger.error(f"Error accepting connection: {e}")

    def handle_connection(self, conn: socket.socket):
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
            logger.info(f"Received: {message.get('type', 'unknown')}")

            msg_type = message.get("type", "")
            handler = self.handlers.get(msg_type, self.handle_unknown)
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
        finally:
            conn.close()

    def handle_ping(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": "pong",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "server": "zone-bridge",
        }

    def handle_capability_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        capability = message.get("capability", "")
        return {
            "type": "capability_response",
            "capability": capability,
            "status": "pending_approval",
            "message": "Capability request received, awaiting implementation",
        }

    def handle_content_sanitized(self, message: Dict[str, Any]) -> Dict[str, Any]:
        source = message.get("source", "")
        return {
            "type": "content_received",
            "source": source,
            "status": "acknowledged",
        }

    def handle_unknown(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": "error",
            "message": f"Unknown message type: {message.get('type', '')}",
        }

    def stop(self):
        self.running = False
        if self.server:
            self.server.close()


def main():
    server = ZoneBridgeServer()
    try:
        server.start()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()


if __name__ == "__main__":
    main()
