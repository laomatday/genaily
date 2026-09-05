#!/usr/bin/env python3
"""Validate Android production config; optional non-mutating live API smoke test."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import socket
import ssl
from urllib import error, request

ROOT = Path(__file__).resolve().parents[1]
INVALID_PAIRING = "Mã ghép không hợp lệ hoặc đã hết hạn."


def read_properties(path):
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            name, value = line.split("=", 1)
            result[name.strip()] = value.strip()
    return result


def configuration():
    defaults = read_properties(ROOT / "mobile/android/config/production.properties")
    ref = defaults.get("GENAI_PROJECT_REF", "")
    url = os.environ.get("GENAI_DEVICE_AGENT_URL", defaults.get("GENAI_DEVICE_AGENT_URL", "")).strip()
    key = os.environ.get("GENAI_PUBLISHABLE_KEY", defaults.get("GENAI_PUBLISHABLE_KEY", "")).strip()
    if not re.fullmatch(r"[a-z]{20}", ref):
        raise ValueError("Invalid production project ref")
    if url != f"https://{ref}.supabase.co/functions/v1/device-agent":
        raise ValueError("Android endpoint does not match the pinned production project")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]{20,160}", key) or any(x in key for x in ("REPLACE", "PLACEHOLDER")):
        raise ValueError("Invalid publishable key; server secrets and JWTs are forbidden")
    return ref, url, key


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def call(url, key, body=None):
    headers = {"apikey": key, "Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = request.Request(url, data=data, headers=headers)
    try:
        response = request.build_opener(NoRedirect).open(req, timeout=20)
    except error.HTTPError as failure:
        response = failure
    except error.URLError as failure:
        reason = failure.reason
        if isinstance(reason, socket.gaierror):
            label = "DNS resolution failed"
        elif isinstance(reason, ssl.SSLCertVerificationError):
            label = "TLS certificate verification failed"
        elif isinstance(reason, (TimeoutError, socket.timeout)):
            label = "Connection timed out"
        else:
            label = "Connection failed (" + type(reason).__name__ + ")"
        raise ValueError(label + "; production reachability is NOT verified") from None
    with response:
        status = response.code
        raw = response.read(256 * 1024 + 1)
    if len(raw) > 256 * 1024:
        raise ValueError("API response exceeds safe size")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError(f"API did not return JSON (HTTP {status})") from None
    return status, payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe", action="store_true", help="Check public auth settings and invalid-code contract; no user writes")
    args = parser.parse_args()
    ref, url, key = configuration()
    print(f"PASS: Android production configuration / {ref}")
    if args.probe:
        status, payload = call(f"https://{ref}.supabase.co/auth/v1/settings", key)
        if status != 200 or not isinstance(payload, dict):
            raise ValueError(f"Publishable key check failed (HTTP {status})")
        status, payload = call(url, key, {"action": "pair", "pairing_code": "", "platform": "android"})
        if status != 400 or not isinstance(payload, dict) or payload.get("error") != INVALID_PAIRING:
            raise ValueError(f"Device agent contract failed (HTTP {status}); check endpoint and verify_jwt=false")
        print("PASS: public key accepted; device-agent reachable; no pairing code consumed")
        print("NOTE: this is not a real-device pairing or database end-to-end test")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as failure:
        # Never print arbitrary network responses, headers, or credentials.
        message = str(failure) if isinstance(failure, ValueError) else "Network check failed; inspect service availability"
        print(f"FAIL: {message}", file=sys.stderr)
        sys.exit(1)
