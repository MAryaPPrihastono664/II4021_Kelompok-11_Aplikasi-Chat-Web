from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from .settings import settings
from .models import RegisterRequest, LoginRequest, SendMessageRequest
from .jwt_lib import verify_jwt

app = FastAPI(title="Chat API")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/auth/register")
def register(request: RegisterRequest):
    return {"ok": True}

@app.post("/auth/login")
def login(request: LoginRequest):
    return {"ok": True}

@app.post("/auth/logout")
def logout(token: str = Depends(verify_jwt)):
    return {"ok": True}

@app.get("/users/contacts")
def get_contacts(token: str = Depends(verify_jwt)):
    return {"ok": True}

@app.get("/users/{email}/public-key")
def get_public_key(email: str, token: str = Depends(verify_jwt)):
    return {"ok": True}

@app.get("/messages/{contact_email}")
def get_messages(contact_email: str, token: str = Depends(verify_jwt)):
    return {"ok": True}

@app.post("/messages")
def send_message(request: SendMessageRequest, token: str = Depends(verify_jwt)):
    return {"ok": True}