from __future__ import annotations

import base64
import json
import time
from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .settings import settings
from .jwt_lib import base64url_decode, sign_jwt, verify_jwt

bearer = HTTPBearer(auto_error=False)


def _b64_to_pem(value: str) -> str:
    try:
        return base64.b64decode(value.encode("utf-8")).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid JWT key encoding")


def _load_jwt_keys() -> dict[str, dict[str, str]]:
    try:
        parsed = json.loads(settings.jwt_keys_json)
    except Exception:
        raise HTTPException(status_code=500, detail="JWT_KEYS_JSON is not valid JSON")

    if not isinstance(parsed, dict) or not parsed:
        raise HTTPException(status_code=500, detail="JWT_KEYS_JSON must be a non-empty object")
    return parsed


def _get_keypair_for_alg(alg: str) -> tuple[str, str]:
    keys = _load_jwt_keys()
    entry = keys.get(alg)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=500, detail=f"Missing keypair for alg {alg}")

    priv_b64 = entry.get("private_b64")
    pub_b64 = entry.get("public_b64")
    if not isinstance(priv_b64, str) or not isinstance(pub_b64, str):
        raise HTTPException(status_code=500, detail=f"Invalid keypair format for alg {alg}")

    return _b64_to_pem(priv_b64), _b64_to_pem(pub_b64)


def create_access_token(*, subject: str, extra: dict[str, Any] | None = None, alg: str | None = None) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {"sub": subject, "iat": now, "exp": now + int(settings.jwt_exp_seconds)}
    if extra:
        payload.update(extra)

    chosen_alg = alg or settings.jwt_default_alg
    private_key_pem, _ = _get_keypair_for_alg(chosen_alg)

    return sign_jwt(
        header={"alg": chosen_alg, "typ": "JWT"},
        private_key_pem=private_key_pem,
        payload=payload,
    )


def get_current_token_payload(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        return get_token_payload_from_token(creds.credentials)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_token_payload_from_token(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token")
    header = json.loads(base64url_decode(parts[0]))
    alg = header.get("alg")
    if not isinstance(alg, str) or not alg:
        raise HTTPException(status_code=401, detail="Invalid token")

    _, public_key_pem = _get_keypair_for_alg(alg)
    verified = verify_jwt(
        token,
        public_key_pem,
        options={"algs": [alg]},
    )
    return verified["payload"]

