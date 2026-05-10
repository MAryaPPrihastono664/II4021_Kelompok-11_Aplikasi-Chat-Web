from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.jwt_lib import base64url_encode, sign_jwt, verify_jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

def _pem_ec_pair(curve: ec.EllipticCurve = ec.SECP384R1()) -> tuple[str, str]:
    key = ec.generate_private_key(curve)
    priv = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    pub = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return priv, pub


def main() -> None:
    now = int(time.time())
    iss = "https://demo-jwt.example"
    sub_demo = "user@example.com"

    priv_correct, pub_correct = _pem_ec_pair()
    _, pub_wrong = _pem_ec_pair()

    print("1. Sign JWT (ES384) + verify dengan public key yang BENAR")
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv_correct,
        claims={
            "sub": sub_demo,
            "iss": iss,
            "exp": now + 3600,
            "nbf": now - 60,
        },
    )
    print("Token:")
    print(token)
    print()
    print("Public key yang dipakai untuk verifikasi (PEM):")
    print(pub_correct.strip())
    decoded = verify_jwt(
        token,
        pub_correct,
        options={
            "algs": ["ES384"],
            "iss": iss,
            "sub": sub_demo,
        },
    )
    print()
    print("Hasil verifikasi: token valid.")
    print("Header ter-decode:", json.dumps(decoded["header"], indent=2, ensure_ascii=False))
    print("Payload ter-decode (dapat dibaca):")
    print(json.dumps(decoded["payload"], indent=2, ensure_ascii=False))
    print("Cuplikan signature (base64url, segmen ke-3):", decoded["signature"][:48] + "...")

    print("2. Verify dengan public key yang SALAH (pasangan beda)")
    print("Public key salah (lain pasangan ECDSA) digunakan untuk verify token yang sama.")
    try:
        verify_jwt(token, pub_wrong, options={"algs": ["ES384"], "iss": iss, "sub": sub_demo})
        print("ERROR: seharusnya verifikasi gagal.")
    except ValueError as e:
        print("Hasil verifikasi: GAGAL (sesuai harapan).")
        print(f"  Tipe error: {type(e).__name__}")
        print(f"  Pesan: {e}")

    print("3. Token format tidak valid - verify memunculkan error")
    bad_cases: list[tuple[str, str]] = [
        ("", "string kosong"),
        ("hanya-satu-segmen", "bukan tiga segmen"),
        ("a.b", "hanya dua segmen"),
    ]
    header_bad = json.dumps({"alg": "ES384", "typ": "JWT"}, separators=(",", ":"))
    enc_h = base64url_encode(header_bad.encode())
    bad_cases.append((f"{enc_h}.___notbase64___.xxx", "payload base64 tidak valid"))
    for bad_token, label in bad_cases:
        print(f"Kasus: {label!r}")
        print(f"  Input: {bad_token!r}")
        try:
            verify_jwt(bad_token, pub_correct, options={"algs": ["ES384"]})
            print("  ERROR: seharusnya ValueError.")
        except ValueError as e:
            print(f"  Tipe: {type(e).__name__}, pesan: {e}")
        print()

    print("4. Klaim waktu. exp kedaluwarsa ditolak, dengan ignoreExp diterima")
    expired_token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv_correct,
        claims={
            "sub": sub_demo,
            "iss": iss,
            "exp": now - 300,
            "iat": now - 600,
        },
    )
    print("Payload token (exp di masa lalu):", json.dumps({"exp": now - 300, "...": "..."}))
    print("Percobaan verify tanpa ignoreExp:")
    try:
        verify_jwt(expired_token, pub_correct, options={"algs": ["ES384"], "iss": iss, "sub": sub_demo})
        print("ERROR: seharusnya ditolak.")
    except ValueError as e:
        print(f"  Ditolak: {type(e).__name__}: {e}")

    ok_exp_ignored = verify_jwt(
        expired_token,
        pub_correct,
        options={
            "algs": ["ES384"],
            "iss": iss,
            "sub": sub_demo,
            "ignoreExp": True,
        },
    )
    print("Percobaan verify dengan ignoreExp=True:")
    print("  BERHASIL - payload masih dapat dibaca:", ok_exp_ignored["payload"].get("sub"))

    print("5. Klaim waktu. nbf di masa depan ditolak, dengan ignoreNbf diterima")
    future_nbf_token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv_correct,
        claims={
            "sub": sub_demo,
            "iss": iss,
            "nbf": now + 3600,
            "exp": now + 7200,
            "iat": now,
        },
    )
    print(f"nbf pada token = {now + 3600} (lebih besar dari sekarang ~{now})")
    print("Percobaan verify tanpa ignoreNbf:")
    try:
        verify_jwt(
            future_nbf_token,
            pub_correct,
            options={"algs": ["ES384"], "iss": iss, "sub": sub_demo},
        )
        print("ERROR: seharusnya ditolak.")
    except ValueError as e:
        print(f"  Ditolak: {type(e).__name__}: {e}")

    ok_nbf_ignored = verify_jwt(
        future_nbf_token,
        pub_correct,
        options={
            "algs": ["ES384"],
            "iss": iss,
            "sub": sub_demo,
            "ignoreNbf": True,
        },
    )
    print("Percobaan verify dengan ignoreNbf=True:")
    print("  BERHASIL - sub dalam payload:", ok_nbf_ignored["payload"].get("sub"))

if __name__ == "__main__":
    main()
