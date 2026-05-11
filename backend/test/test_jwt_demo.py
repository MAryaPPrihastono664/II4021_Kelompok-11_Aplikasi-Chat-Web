from __future__ import annotations

import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.jwt_lib import base64url_encode, sign_jwt, verify_jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

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


def test_sign_jwt_happy_path_es256_es384_es512() -> None:
    now = int(time.time())
    for curve, alg in (
        (ec.SECP256R1(), "ES256"),
        (ec.SECP384R1(), "ES384"),
        (ec.SECP521R1(), "ES512"),
    ):
        priv, pub = _pem_ec_pair(curve)
        token = sign_jwt(
            header={"alg": alg, "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": f"u-{alg}", "exp": now + 3600, "iat": now},
        )
        out = verify_jwt(
            token,
            pub,
            options={"algs": [alg], "sub": f"u-{alg}"},
        )
        assert out["header"]["alg"] == alg
        assert out["payload"]["sub"] == f"u-{alg}"


def test_sign_jwt_happy_path_merges_payload_and_claims_and_default_iat() -> None:
    priv, pub = _pem_ec_pair()
    before = int(time.time())
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        payload={"scope": "read"},
        claims={"sub": "merged"},
    )
    after = int(time.time())
    out = verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "merged"})
    assert out["payload"]["scope"] == "read"
    assert out["payload"]["sub"] == "merged"
    assert before <= out["payload"]["iat"] <= after


def test_sign_jwt_raises_when_alg_missing() -> None:
    priv, _ = _pem_ec_pair()
    with pytest.raises(ValueError):
        sign_jwt({"typ": "JWT"}, priv, claims={"sub": "x"})


def test_sign_jwt_raises_when_typ_missing() -> None:
    priv, _ = _pem_ec_pair()
    with pytest.raises(ValueError):
        sign_jwt({"alg": "ES384"}, priv, claims={"sub": "x"})


def test_sign_jwt_raises_when_algorithm_unsupported() -> None:
    priv, _ = _pem_ec_pair()
    with pytest.raises(ValueError):
        sign_jwt({"alg": "HS256", "typ": "JWT"}, priv, claims={"sub": "x"})


def test_sign_jwt_raises_when_typ_not_jwt() -> None:
    priv, _ = _pem_ec_pair()
    with pytest.raises(ValueError):
        sign_jwt({"alg": "ES384", "typ": "JWE"}, priv, claims={"sub": "x"})


def test_sign_jwt_raises_when_private_key_pem_invalid() -> None:
    with pytest.raises(ValueError):
        sign_jwt(
            {"alg": "ES384", "typ": "JWT"},
            "not-a-valid-pem",
            claims={"sub": "x"},
        )


def test_sign_jwt_raises_when_claims_not_json_serializable() -> None:
    priv, _ = _pem_ec_pair()
    with pytest.raises(TypeError):
        sign_jwt(
            {"alg": "ES384", "typ": "JWT"},
            priv,
            claims={"sub": object()},
        )


def test_verify_jwt_happy_path_with_iss_aud_jti() -> None:
    priv, pub = _pem_ec_pair()
    now = int(time.time())
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={
            "sub": "s",
            "iss": "https://issuer",
            "aud": "api",
            "jti": "tid-1",
            "exp": now + 3600,
            "iat": now,
        },
    )
    out = verify_jwt(
        token,
        pub,
        options={
            "algs": ["ES384"],
            "iss": "https://issuer",
            "sub": "s",
            "aud": "api",
            "jti": "tid-1",
        },
    )
    assert out["payload"]["jti"] == "tid-1"


def test_verify_jwt_raises_when_not_three_segments() -> None:
    _, pub = _pem_ec_pair()
    for bad in ("", "a", "a.b"):
        with pytest.raises(ValueError):
            verify_jwt(bad, pub, options={"algs": ["ES384"]})


def test_verify_jwt_raises_when_header_json_invalid() -> None:
    _, pub = _pem_ec_pair()
    h = base64url_encode(b"not-json")
    p = base64url_encode(json.dumps({"sub": "x", "exp": int(time.time()) + 60}, separators=(",", ":")).encode())
    token = f"{h}.{p}.e30"
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES384"]})


def test_verify_jwt_raises_when_payload_json_invalid() -> None:
    priv, pub = _pem_ec_pair()
    h = base64url_encode(
        json.dumps({"alg": "ES384", "typ": "JWT"}, separators=(",", ":")).encode()
    )
    p = base64url_encode(b"not-json")
    signing_input = f"{h}.{p}"
    key = serialization.load_pem_private_key(priv.encode(), password=None)
    sig_der = key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA384()))
    r, s = decode_dss_signature(sig_der)
    ks = (key.key_size + 7) // 8
    sig_b = r.to_bytes(ks, "big") + s.to_bytes(ks, "big")
    token = f"{signing_input}.{base64url_encode(sig_b)}"
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES384"]})


def test_verify_jwt_raises_when_algorithm_unsupported_in_header() -> None:
    _, pub = _pem_ec_pair()
    h = base64url_encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode()
    )
    p = base64url_encode(json.dumps({"sub": "x"}, separators=(",", ":")).encode())
    token = f"{h}.{p}.e30"
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES384", "ES256"]})


def test_verify_jwt_raises_when_alg_not_in_allowed_list() -> None:
    priv, pub = _pem_ec_pair()
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={"sub": "x", "exp": int(time.time()) + 3600},
    )
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES256"]})


def test_verify_jwt_raises_when_signature_wrong_key() -> None:
    priv, _ = _pem_ec_pair()
    _, pub_wrong = _pem_ec_pair()
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={"sub": "x", "exp": int(time.time()) + 3600},
    )
    with pytest.raises(ValueError):
        verify_jwt(token, pub_wrong, options={"algs": ["ES384"]})


def test_verify_jwt_raises_when_signature_tampered() -> None:
    priv, pub = _pem_ec_pair()
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={"sub": "x", "exp": int(time.time()) + 3600},
    )
    hb, pb, sb = token.split(".")
    sb_bad = sb[:-1] + ("A" if sb[-1] != "A" else "B")
    tampered = f"{hb}.{pb}.{sb_bad}"
    with pytest.raises(ValueError):
        verify_jwt(tampered, pub, options={"algs": ["ES384"]})


def test_verify_jwt_raises_when_expired() -> None:
    priv, pub = _pem_ec_pair()
    now = int(time.time())
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={"sub": "x", "exp": now - 10, "iat": now - 20},
    )
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "x"})


def test_verify_jwt_raises_when_nbf_in_future() -> None:
    priv, pub = _pem_ec_pair()
    now = int(time.time())
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={
            "sub": "x",
            "nbf": now + 3600,
            "exp": now + 7200,
            "iat": now,
        },
    )
    with pytest.raises(ValueError):
        verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "x"})


def test_verify_jwt_raises_when_iss_sub_aud_jti_mismatch() -> None:
    priv, pub = _pem_ec_pair()
    now = int(time.time())
    token = sign_jwt(
        header={"alg": "ES384", "typ": "JWT"},
        private_key_pem=priv,
        claims={
            "sub": "good",
            "iss": "https://a",
            "aud": "clients",
            "jti": "one",
            "exp": now + 3600,
            "iat": now,
        },
    )
    with pytest.raises(ValueError):
        verify_jwt(
            token,
            pub,
            options={"algs": ["ES384"], "iss": "https://b", "sub": "good"},
        )
    with pytest.raises(ValueError):
        verify_jwt(
            token,
            pub,
            options={"algs": ["ES384"], "sub": "bad", "iss": "https://a"},
        )
    with pytest.raises(ValueError):
        verify_jwt(
            token,
            pub,
            options={"algs": ["ES384"], "aud": "other", "iss": "https://a", "sub": "good"},
        )
    with pytest.raises(ValueError):
        verify_jwt(
            token,
            pub,
            options={
                "algs": ["ES384"],
                "jti": "two",
                "iss": "https://a",
                "sub": "good",
                "aud": "clients",
            },
        )


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
