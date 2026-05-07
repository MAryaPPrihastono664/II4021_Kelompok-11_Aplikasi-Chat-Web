import json
import base64
import hashlib
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature
)
import time

ALG_MAP = {
    'ES256': hashes.SHA256(),
    'ES384': hashes.SHA384(),
    'ES512': hashes.SHA512(),
}

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += '=' * padding
    return base64.urlsafe_b64decode(s)

def sign_jwt(header: dict, private_key_pem: str, claims: dict = {}, payload: dict = {}) -> str:
    if not header.get('alg') or not header.get('typ'):
        raise ValueError('Header harus memiliki alg dan typ')
    if header['alg'] not in ALG_MAP:
        raise ValueError(f"Algoritma tidak didukung: {header['alg']}")
    if header['typ'] != 'JWT':
        raise ValueError('typ harus JWT')

    header_json = json.dumps({'alg': header['alg'], 'typ': header['typ']}, separators=(',', ':'))
    encoded_header = base64url_encode(header_json.encode())

    payload_set = {}
    for key, value in payload.items():
        payload_set[key] = value
    for key, value in claims.items():
        payload_set[key] = value
    if 'iat' not in payload_set:
        payload_set['iat'] = int(time.time())

    payload_json = json.dumps(payload_set, separators=(',', ':'))
    encoded_payload = base64url_encode(payload_json.encode())

    signing_input = f"{encoded_header}.{encoded_payload}"

    hash_alg = ALG_MAP[header['alg']]
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode(), password=None
    )
    signature_der = private_key.sign(signing_input.encode(), ec.ECDSA(hash_alg))
    
    r, s = decode_dss_signature(signature_der)
    key_size = (private_key.key_size + 7) // 8

    signature_bytes = r.to_bytes(key_size, 'big') + s.to_bytes(key_size, 'big')
    encoded_signature = base64url_encode(signature_bytes)

    return f"{signing_input}.{encoded_signature}"


def verify_jwt(jwt_token: str, public_key_pem: str, options: dict = {}) -> dict:
    parts = jwt_token.split('.')
    if len(parts) != 3:
        raise ValueError('Format JWT tidak valid')
    
    encoded_header, encoded_payload, encoded_signature = parts

    try:
        header = json.loads(base64url_decode(encoded_header))
    except Exception:
        raise ValueError('Header tidak valid')

    try:
        payload = json.loads(base64url_decode(encoded_payload))
    except Exception:
        raise ValueError('Payload tidak valid')

    if header.get('alg') not in ALG_MAP:
        raise ValueError(f"Algoritma tidak didukung: {header.get('alg')}")
    if 'algs' in options and header['alg'] not in options['algs']:
        raise ValueError(f"Algoritma {header['alg']} tidak diizinkan")

    signing_input = f"{encoded_header}.{encoded_payload}"
    signature_bytes = base64url_decode(encoded_signature)

    key_size = len(signature_bytes) // 2
    r = int.from_bytes(signature_bytes[:key_size], 'big')
    s = int.from_bytes(signature_bytes[key_size:], 'big')
    signature_der = encode_dss_signature(r, s)

    hash_alg = ALG_MAP[header['alg']]
    public_key = serialization.load_pem_public_key(public_key_pem.encode())

    try:
        public_key.verify(signature_der, signing_input.encode(), ec.ECDSA(hash_alg))
    except Exception:
        raise ValueError('Signature tidak valid')

    now = int(time.time())

    if not options.get('ignoreExp') and 'exp' in payload:
        if now > payload['exp']:
            raise ValueError('Token sudah expired')

    if not options.get('ignoreNbf') and 'nbf' in payload:
        if now < payload['nbf']:
            raise ValueError('Token belum berlaku')

    if 'iss' in options and payload.get('iss') != options['iss']:
        raise ValueError(f"iss tidak sesuai")
    if 'sub' in options and payload.get('sub') != options['sub']:
        raise ValueError(f"sub tidak sesuai")
    if 'aud' in options and payload.get('aud') != options['aud']:
        raise ValueError(f"aud tidak sesuai")
    if 'jti' in options and payload.get('jti') != options['jti']:
        raise ValueError(f"jti tidak sesuai")

    return {'header': header, 'payload': payload, 'signature': encoded_signature}