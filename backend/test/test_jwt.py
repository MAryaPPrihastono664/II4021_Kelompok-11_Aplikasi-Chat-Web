import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.jwt_lib import sign_jwt, verify_jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import time

key = ec.generate_private_key(ec.SECP384R1())
private_key_pem = key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
).decode("utf-8")
public_key_pem = key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
).decode("utf-8")

token = sign_jwt(
    header={'alg': 'ES384', 'typ': 'JWT'},
    private_key_pem=private_key_pem,
    claims={
        'sub': 'someone@gmail.com',
        'iss': 'https://myapp.com',
        'exp': int(time.time()) + 3600,
    }
)
print("Token:", token)
print("Public Key:", public_key_pem)

decoded = verify_jwt(token, public_key_pem, options={
    'algs': ['ES384'],
    'iss': 'https://myapp.com',
})
print("Decoded payload:", decoded['payload'])