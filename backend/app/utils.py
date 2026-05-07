import hashlib
import os
import base64

def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()

def verify_password(password: str, salt: str, hashed_password: str) -> bool:
    return hash_password(password, salt) == hashed_password

def generate_salt() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).decode('utf-8')

def generate_public_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).decode('utf-8')

def generate_private_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).decode('utf-8')