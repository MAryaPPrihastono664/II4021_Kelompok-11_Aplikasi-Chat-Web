from pydantic import BaseModel, EmailStr

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
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