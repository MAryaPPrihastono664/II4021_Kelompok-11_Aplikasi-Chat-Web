from __future__ import annotations

import binascii
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


class TestSignJwtHappyPath:
    def test_es256_es384_es512_round_trip(self) -> None:
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

    def test_merges_payload_and_claims_claims_win_and_default_iat(self) -> None:
        priv, pub = _pem_ec_pair()
        before = int(time.time())
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            payload={"scope": "read", "role": "from_payload"},
            claims={"sub": "merged", "role": "from_claims"},
        )
        after = int(time.time())
        out = verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "merged"})
        assert out["payload"]["scope"] == "read"
        assert out["payload"]["role"] == "from_claims"
        assert before <= out["payload"]["iat"] <= after


class TestSignJwtEdgeCases:
    def test_raises_when_alg_missing(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(ValueError):
            sign_jwt({"typ": "JWT"}, priv, claims={"sub": "x"})

    def test_raises_when_typ_missing(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(ValueError):
            sign_jwt({"alg": "ES384"}, priv, claims={"sub": "x"})

    def test_raises_when_algorithm_unsupported(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(ValueError):
            sign_jwt({"alg": "HS256", "typ": "JWT"}, priv, claims={"sub": "x"})

    def test_raises_when_typ_not_jwt(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(ValueError):
            sign_jwt({"alg": "ES384", "typ": "JWE"}, priv, claims={"sub": "x"})

    def test_raises_when_private_key_pem_invalid(self) -> None:
        with pytest.raises(ValueError):
            sign_jwt(
                {"alg": "ES384", "typ": "JWT"},
                "not-a-valid-pem",
                claims={"sub": "x"},
            )

    def test_raises_when_claims_not_json_serializable(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(TypeError):
            sign_jwt(
                {"alg": "ES384", "typ": "JWT"},
                priv,
                claims={"sub": object()},
            )

    def test_raises_when_payload_not_json_serializable(self) -> None:
        priv, _ = _pem_ec_pair()
        with pytest.raises(TypeError):
            sign_jwt(
                {"alg": "ES384", "typ": "JWT"},
                priv,
                payload={"x": object()},
                claims={"sub": "s"},
            )


class TestVerifyJwtHappyPath:
    def test_with_iss_aud_jti_options(self) -> None:
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

    def test_ignore_exp_accepts_expired_token(self) -> None:
        priv, pub = _pem_ec_pair()
        now = int(time.time())
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "iss": "i", "exp": now - 300, "iat": now - 600},
        )
        out = verify_jwt(
            token,
            pub,
            options={"algs": ["ES384"], "iss": "i", "sub": "x", "ignoreExp": True},
        )
        assert out["payload"]["sub"] == "x"

    def test_ignore_nbf_accepts_future_nbf(self) -> None:
        priv, pub = _pem_ec_pair()
        now = int(time.time())
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={
                "sub": "x",
                "iss": "i",
                "nbf": now + 3600,
                "exp": now + 7200,
                "iat": now,
            },
        )
        out = verify_jwt(
            token,
            pub,
            options={"algs": ["ES384"], "iss": "i", "sub": "x", "ignoreNbf": True},
        )
        assert out["payload"]["sub"] == "x"


class TestVerifyJwtEdgeCases:
    @pytest.mark.parametrize(
        "bad_token",
        ["", "a", "a.b", "a.b.c.d"],
    )
    def test_raises_when_segment_count_invalid(self, bad_token: str) -> None:
        _, pub = _pem_ec_pair()
        with pytest.raises(ValueError, match="Format JWT tidak valid"):
            verify_jwt(bad_token, pub, options={"algs": ["ES384"]})

    def test_raises_when_header_json_invalid(self) -> None:
        _, pub = _pem_ec_pair()
        h = base64url_encode(b"not-json")
        p = base64url_encode(
            json.dumps({"sub": "x", "exp": int(time.time()) + 60}, separators=(",", ":")).encode()
        )
        token = f"{h}.{p}.e30"
        with pytest.raises(ValueError, match="Header tidak valid"):
            verify_jwt(token, pub, options={"algs": ["ES384"]})

    def test_raises_when_payload_json_invalid(self) -> None:
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
        with pytest.raises(ValueError, match="Payload tidak valid"):
            verify_jwt(token, pub, options={"algs": ["ES384"]})

    def test_raises_when_header_alg_missing_after_decode(self) -> None:
        _, pub = _pem_ec_pair()
        h = base64url_encode(json.dumps({"typ": "JWT"}, separators=(",", ":")).encode())
        p = base64url_encode(json.dumps({"sub": "x", "exp": int(time.time()) + 3600}, separators=(",", ":")).encode())
        token = f"{h}.{p}.e30"
        with pytest.raises(ValueError, match="Algoritma tidak didukung"):
            verify_jwt(token, pub, options={"algs": ["ES384"]})

    def test_raises_when_algorithm_unsupported_in_header(self) -> None:
        _, pub = _pem_ec_pair()
        h = base64url_encode(
            json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode()
        )
        p = base64url_encode(json.dumps({"sub": "x"}, separators=(",", ":")).encode())
        token = f"{h}.{p}.e30"
        with pytest.raises(ValueError, match="Algoritma tidak didukung"):
            verify_jwt(token, pub, options={"algs": ["ES384", "ES256"]})

    def test_raises_when_alg_not_in_allowed_list(self) -> None:
        priv, pub = _pem_ec_pair()
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "exp": int(time.time()) + 3600},
        )
        with pytest.raises(ValueError, match="tidak diizinkan"):
            verify_jwt(token, pub, options={"algs": ["ES256"]})

    def test_raises_when_signature_wrong_key(self) -> None:
        priv, _ = _pem_ec_pair()
        _, pub_wrong = _pem_ec_pair()
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "exp": int(time.time()) + 3600},
        )
        with pytest.raises(ValueError, match="Signature tidak valid"):
            verify_jwt(token, pub_wrong, options={"algs": ["ES384"]})

    def test_raises_when_signature_tampered(self) -> None:
        priv, pub = _pem_ec_pair()
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "exp": int(time.time()) + 3600},
        )
        hb, pb, sb = token.split(".")
        sb_bad = sb[:-1] + ("A" if sb[-1] != "A" else "B")
        tampered = f"{hb}.{pb}.{sb_bad}"
        with pytest.raises(ValueError, match="Signature tidak valid"):
            verify_jwt(tampered, pub, options={"algs": ["ES384"]})

    def test_raises_when_expired(self) -> None:
        priv, pub = _pem_ec_pair()
        now = int(time.time())
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "exp": now - 10, "iat": now - 20},
        )
        with pytest.raises(ValueError, match="expired"):
            verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "x"})

    def test_raises_when_nbf_in_future(self) -> None:
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
        with pytest.raises(ValueError, match="belum berlaku"):
            verify_jwt(token, pub, options={"algs": ["ES384"], "sub": "x"})

    def test_raises_when_iss_sub_aud_jti_mismatch(self) -> None:
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
        with pytest.raises(ValueError, match="iss"):
            verify_jwt(
                token,
                pub,
                options={"algs": ["ES384"], "iss": "https://b", "sub": "good"},
            )
        with pytest.raises(ValueError, match="sub"):
            verify_jwt(
                token,
                pub,
                options={"algs": ["ES384"], "sub": "bad", "iss": "https://a"},
            )
        with pytest.raises(ValueError, match="aud"):
            verify_jwt(
                token,
                pub,
                options={"algs": ["ES384"], "aud": "other", "iss": "https://a", "sub": "good"},
            )
        with pytest.raises(ValueError, match="jti"):
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

    def test_raises_when_public_key_pem_invalid(self) -> None:
        priv, pub = _pem_ec_pair()
        token = sign_jwt(
            header={"alg": "ES384", "typ": "JWT"},
            private_key_pem=priv,
            claims={"sub": "x", "exp": int(time.time()) + 3600},
        )
        with pytest.raises(ValueError):
            verify_jwt(token, "not-a-pem", options={"algs": ["ES384"]})

    def test_raises_when_signature_segment_invalid_base64(self) -> None:
        _, pub = _pem_ec_pair()
        h = base64url_encode(
            json.dumps({"alg": "ES384", "typ": "JWT"}, separators=(",", ":")).encode()
        )
        p = base64url_encode(json.dumps({"sub": "x", "exp": int(time.time()) + 3600}, separators=(",", ":")).encode())
        token = f"{h}.{p}.!!!not-base64!!!"
        with pytest.raises((ValueError, binascii.Error)):
            verify_jwt(token, pub, options={"algs": ["ES384"]})
