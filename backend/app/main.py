from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .settings import settings
from .schemas import (
    ContactListResponse,
    LoginRequest,
    MessageListResponse,
    PublicKeyResponse,
    RegisterRequest,
    SendMessageRequest,
    TokenResponse,
)
from .auth import create_access_token, get_current_token_payload, get_token_payload_from_token
from .db import AsyncSessionLocal, get_db
from .models import Message, User
from .utils import generate_salt, hash_password, verify_password
from sqlalchemy import and_, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict
from typing import Any

_LOGIN_FAILED_DETAIL = "Invalid email or password"
_LOGIN_DUMMY_SALT = "dS4l0n9mK2pQx8vLw3nR_hJ"
_LOGIN_DUMMY_HASH = hash_password("~login-failure-dummy~", _LOGIN_DUMMY_SALT)


app = FastAPI(title="Chat API")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, email: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[email].add(websocket)

    def disconnect(self, email: str, websocket: WebSocket):
        sockets = self.active_connections.get(email)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self.active_connections.pop(email, None)

    async def send_to_user(self, email: str, payload: dict[str, Any]):
        sockets = self.active_connections.get(email)
        if not sockets:
            return
        stale: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(email, ws)


manager = ConnectionManager()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/auth/register")
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == str(request.email)))
    if res.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="User already exists")

    salt = generate_salt()
    password_hash = hash_password(request.password, salt)

    user = User(
        email=str(request.email),
        password_hash=password_hash,
        salt=salt,
        public_key=request.public_key,
        encrypted_private_key=request.encrypted_private_key,
        kdf_params=request.kdf_params,
    )
    db.add(user)
    await db.commit()
    return {"ok": True}

@app.post("/auth/login")
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == str(request.email)))
    user = res.scalar_one_or_none()
    
    if user is None:
        verify_password(request.password, _LOGIN_DUMMY_SALT, _LOGIN_DUMMY_HASH)
        raise HTTPException(status_code=401, detail=_LOGIN_FAILED_DETAIL)

    if not verify_password(request.password, user.salt, user.password_hash):
        raise HTTPException(status_code=401, detail=_LOGIN_FAILED_DETAIL)
    
    token = create_access_token(subject=user.email)
    return {
        "ok": True,
        "token": token,
        "user": {
            "email": user.email,
            "encrypted_private_key": user.encrypted_private_key,
            "kdf_params": user.kdf_params
        }
    }

@app.post("/auth/logout")
def logout(_: dict = Depends(get_current_token_payload)):
    return {"ok": True}

@app.get("/users/contacts")
async def get_contacts(
    token: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> ContactListResponse:
    me = token.get("sub")
    if not me:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    res = await db.execute(select(User).where(User.email != me))
    return ContactListResponse(contacts=[u.email for u in res.scalars().all()])

@app.get("/users/{email}/public-key")
async def get_public_key(
    email: str,
    _: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> PublicKeyResponse:
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="User not found")
    return PublicKeyResponse(public_key=user.public_key)

@app.get("/messages/{email}")
async def get_messages(
    email: str,
    token: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    me = token.get("sub")
    if not me:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    res = await db.execute(
        select(Message)
        .where(
            or_(
                and_(Message.sender_email == me, Message.receiver_email == email),
                and_(Message.sender_email == email, Message.receiver_email == me)
            )
        )
        .order_by(Message.timestamp.asc())
    )
    messages = []
    for m in res.scalars().all():
        messages.append(
            {
                "id": m.id,
                "sender_email": m.sender_email,
                "receiver_email": m.receiver_email,
                "ciphertext": m.ciphertext,
                "iv": m.iv,
                "mac": m.mac,
                "timestamp": m.timestamp,
            }
        )
    return MessageListResponse(messages=messages)

@app.post("/messages")
async def send_message(
    request: SendMessageRequest,
    token: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
):
    me = token.get("sub")
    if not me:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    message = Message(
        sender_email=me,
        receiver_email=str(request.receiver_email),
        ciphertext=request.ciphertext,
        iv=request.iv,
        mac=request.mac,
    )
    db.add(message)
    await db.commit()
    return {"ok": True}


@app.websocket("/ws/messages")
async def websocket_messages(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return

    try:
        payload = get_token_payload_from_token(token)
        current_email = payload.get("sub")
        if not current_email:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except Exception:
        await websocket.close(code=4401)
        return

    await manager.connect(current_email, websocket)
    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                continue
            if message.get("type") != "send_message":
                continue

            receiver_email = str(message.get("receiver_email") or "").strip()
            ciphertext = str(message.get("ciphertext") or "").strip()
            iv = str(message.get("iv") or "").strip()
            mac_raw = message.get("mac")
            mac = str(mac_raw).strip() if isinstance(mac_raw, str) else None
            if not receiver_email or not ciphertext or not iv:
                continue

            async with AsyncSessionLocal() as db:
                new_message = Message(
                    sender_email=current_email,
                    receiver_email=receiver_email,
                    ciphertext=ciphertext,
                    iv=iv,
                    mac=mac,
                )
                db.add(new_message)
                await db.commit()
                await db.refresh(new_message)

            outbound = {
                "type": "new_message",
                "message": {
                    "id": new_message.id,
                    "sender_email": new_message.sender_email,
                    "receiver_email": new_message.receiver_email,
                    "ciphertext": new_message.ciphertext,
                    "iv": new_message.iv,
                    "mac": new_message.mac,
                    "timestamp": new_message.timestamp.isoformat(),
                },
            }
            await manager.send_to_user(current_email, outbound)
            if receiver_email != current_email:
                await manager.send_to_user(receiver_email, outbound)
    except WebSocketDisconnect:
        manager.disconnect(current_email, websocket)
    except Exception:
        manager.disconnect(current_email, websocket)
        await websocket.close(code=1011)