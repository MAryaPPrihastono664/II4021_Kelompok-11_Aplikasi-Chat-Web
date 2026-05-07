from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    public_key: str
    encrypted_private_key: str
    kdf_params: dict


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SendMessageRequest(BaseModel):
    receiver_email: EmailStr
    ciphertext: str
    iv: str
    mac: str | None = None


class TokenResponse(BaseModel):
    ok: bool = True
    token: str


class PublicKeyResponse(BaseModel):
    public_key: str


class ContactListResponse(BaseModel):
    contacts: list[str]


class MessageOut(BaseModel):
    id: str
    sender_email: EmailStr
    receiver_email: EmailStr
    ciphertext: str
    iv: str
    mac: str | None = None
    timestamp: datetime


class MessageListResponse(BaseModel):
    messages: list[MessageOut]

