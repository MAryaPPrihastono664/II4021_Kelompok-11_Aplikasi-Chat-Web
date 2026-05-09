"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, fetchContacts, fetchPublicKey, fetchMessages } from "@/lib/api";

type Message = {
  id: string | number | null;
  fromUserId: number;
  toUserId: number;
  content: string;
  tracking?: number | null;
  isRead: boolean;
  createdAt: string;
  ciphertext?: string;
  iv?: string;
};

type ApiMessage = {
  id: string;
  sender_email: string;
  receiver_email: string;
  ciphertext: string;
  iv: string;
  timestamp: string;
};

type WsIncomingMessage = {
  type: "new_message";
  message: ApiMessage;
};

export type PartnerInfo = {
  id: number;
  role: string;
  name: string;
  storeId: number | null;
  storeName: string | null;
  storeDescription: string | null;
  storeLogoPath: string | null;
};

const hexToBuffer = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
const bufferToHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

function utf8Bytes(v: string) {
  return new TextEncoder().encode(v);
}

function websocketBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const normalized = base.replace(/\/+$/, "");
  if (normalized.startsWith("https://")) {
    return normalized.replace("https://", "wss://");
  }
  if (normalized.startsWith("http://")) {
    return normalized.replace("http://", "ws://");
  }
  return normalized;
}

async function deriveConversationAesKey(
  myPrivateKeyJWK: JsonWebKey,
  partnerPublicKeyJWK: JsonWebKey,
  myEmail: string,
  partnerEmail: string,
) {
  const { key_ops: _privKeyOps, ...privateJwkClean } = myPrivateKeyJWK;
  void _privKeyOps;
  const privateKey = await window.crypto.subtle.importKey(
    "jwk",
    privateJwkClean,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const { key_ops: _pubKeyOps, ...publicJwkClean } = partnerPublicKeyJWK;
  void _pubKeyOps;
  const publicKey = await window.crypto.subtle.importKey(
    "jwk",
    publicJwkClean,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );

  const hkdfBaseKey = await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const info = utf8Bytes(
    `chat:${[myEmail, partnerEmail].sort().join("|")}:aes-256-gcm`,
  );
  const salt = utf8Bytes("chat-webapp-hkdf-salt-v1");

  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function formatTime(timestamp: number) {
  const diffInHours = (Date.now() - timestamp) / (1000 * 60 * 60);
  if (diffInHours < 24) {
    return new Date(timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffInHours < 48) return "Kemarin";
  return new Date(timestamp).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

function ChatSidebar({
  rooms,
  partnerById,
  activePartnerUserId,
  onSelectPartner,
  contactsLoading,
  contactsError,
  onRefreshContacts,
  messagePlaintext,
}: {
  rooms: Map<number, Map<number | string, Message>>;
  partnerById: Map<number, PartnerInfo>;
  activePartnerUserId: number | null;
  onSelectPartner: (partnerId: number) => void;
  contactsLoading: boolean;
  contactsError: string | null;
  onRefreshContacts: () => void;
  messagePlaintext: Record<string, string>;
}) {
  const sortedPartners = useMemo(() => {
    const rows = [...partnerById.values()];
    return rows.sort((a, b) => {
      const aRoom = rooms.get(a.id);
      const bRoom = rooms.get(b.id);
      const aHas = (aRoom?.size ?? 0) > 0;
      const bHas = (bRoom?.size ?? 0) > 0;
      if (aHas && bHas) {
        const aT = Math.max(
          ...[...aRoom!.values()].map((m) => Date.parse(m.createdAt)),
        );
        const bT = Math.max(
          ...[...bRoom!.values()].map((m) => Date.parse(m.createdAt)),
        );
        return bT - aT;
      }
      if (aHas !== bHas) return aHas ? -1 : 1;
      return (a.storeName ?? a.name).localeCompare(b.storeName ?? b.name, "id");
    });
  }, [partnerById, rooms]);

  return (
    <div
      className={`${activePartnerUserId != null ? "hidden md:flex" : "flex"} w-full flex-col overflow-hidden border-r border-[#E5E5E5] bg-white md:w-[320px]`}
    >
      <div className="border-b border-[#E5E5E5] p-4">
        <div className="flex flex-row items-center justify-between gap-2">
          <h2 className="m-0 text-[1.125rem] font-semibold">users terdaftar</h2>
          <button
            type="button"
            onClick={onRefreshContacts}
            disabled={contactsLoading}
            aria-label="Segarkan daftar user"
            title="Segarkan daftar user"
            className={`flex aspect-square shrink-0 items-center justify-center rounded-full p-2 transition-colors ${contactsLoading ? "cursor-wait opacity-60" : "text-[#42B549] hover:bg-[#f4fbf5]"}`}
          >
            <i
              className={`bx bx-revision text-2xl ${contactsLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        {contactsError ? (
          <div className="mt-3 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">
            {contactsError}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {contactsLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-sm text-[#666]">
            Memuat daftar user…
          </div>
        ) : sortedPartners.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[#999]">
            <i className="bx bx-user-plus mb-4 text-[3rem]" />
            <p className="m-0 text-sm">
              Belum ada user lain (atau kamu user pertama).
            </p>
          </div>
        ) : (
          sortedPartners.map((pi) => {
            const ms = rooms.get(pi.id);
            const hasMessages = (ms?.size ?? 0) > 0;
            const unreadCount = hasMessages
              ? [...ms!.values()].filter((m) => m.toUserId === 0 && !m.isRead).length
              : 0;
            const lastMessage = hasMessages
              ? [...ms!.values()].sort(
                  (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
                )[0]!
              : null;

            return (
              <button
                type="button"
                key={pi.id}
                onClick={() => onSelectPartner(pi.id)}
                className={`w-full cursor-pointer border-b border-[#F0F0F0] p-4 text-left transition-colors ${activePartnerUserId === pi.id ? "bg-[#F0FFF1]" : "bg-transparent"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-[1.5rem] text-[#42B549]">
                    {pi.storeLogoPath != null ? (
                      <img
                        src={pi.storeLogoPath}
                        alt=""
                        className="h-full w-full overflow-hidden rounded-full border object-cover"
                      />
                    ) : (
                      <i
                        className={
                          pi.role === "SELLER" ? "bx bx-store" : "bx bx-user"
                        }
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="m-0 max-w-[70%] overflow-hidden text-ellipsis whitespace-nowrap text-[0.9375rem] font-semibold">
                        {pi.storeName ?? pi.name}
                      </h3>
                      {lastMessage ? (
                        <span className="ml-2 shrink-0 text-[0.75rem] text-[#999]">
                          {formatTime(Date.parse(lastMessage.createdAt))}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="m-0 max-w-[85%] overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem]">
                        {lastMessage ? (
                          <span className="text-[#666]">
                            {(() => {
                              const k = String(
                                lastMessage.id ?? `t-${lastMessage.tracking}`,
                              );
                              const plain =
                                messagePlaintext[k] ?? lastMessage.content;
                              return plain
                                ? plain.slice(0, 120)
                                : "Mendekripsi…";
                            })()}
                          </span>
                        ) : (
                          <span className="text-[#999]">
                            Ketuk untuk mulai chat
                          </span>
                        )}
                      </p>
                      {unreadCount > 0 ? (
                        <span className="ml-2 min-w-5 shrink-0 rounded-xl bg-[#42B549] px-2 py-0.5 text-center text-[0.75rem] font-semibold text-white">
                          {unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

async function decryptMessage(
  ciphertextHex: string,
  ivHex: string,
  aesKey: CryptoKey,
): Promise<string> {
  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBuffer(ivHex) },
      aesKey,
      hexToBuffer(ciphertextHex),
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[DECRYPTION ERROR: Kunci tidak valid atau data rusak]";
  }
}

function ChatDashboard({
  userId,
  activePartnerUserId,
  setActivePartnerUserId,
  partnerInfo,
  room,
  chatEnabled,
  sendError,
  onSendText,
  messagePlaintext,
}: {
  userId: number;
  activePartnerUserId: number | null;
  setActivePartnerUserId: (v: number | null) => void;
  partnerInfo: PartnerInfo | null;
  room: Map<number | string, Message>;
  chatEnabled: boolean;
  sendError: string | null;
  onSendText: (text: string) => void;
  messagePlaintext: Record<string, string>;
}) {
  const [inputMessage, setInputMessage] = useState("");

  const sorted = useMemo(
    () =>
      [...room.values()].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      ),
    [room],
  );

  if (activePartnerUserId == null || partnerInfo == null) {
    return (
      <div className="hidden flex-1 flex-col items-center justify-center bg-white md:flex">
        <h2 className="max-w-sm text-center text-lg font-semibold">
          Pilih chat di samping untuk memulai
        </h2>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* Header Partner Info */}
      <div className="flex items-center gap-3 border-b border-[#E5E5E5] bg-white p-4">
        <button
          type="button"
          onClick={() => setActivePartnerUserId(null)}
          className="cursor-pointer border-0 bg-transparent p-2 text-[1.5rem] text-[#42B549] md:hidden"
        >
          <i className="bx bx-arrow-back" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E5E5] text-[1.25rem] text-[#42B549]">
          {partnerInfo.storeLogoPath != null ? (
            <img
              src={partnerInfo.storeLogoPath}
              alt=""
              className="h-full w-full rounded-full border object-cover"
            />
          ) : (
            <i className={partnerInfo.role === "SELLER" ? "bx bx-store" : "bx bx-user"} />
          )}
        </div>
        <h3 className="m-0 text-[1.125rem] font-semibold">{partnerInfo.storeName ?? partnerInfo.name}</h3>
      </div>

      {/* Chat Messages Area */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F9F9F9] p-4">
        {sorted.length === 0 ? (
          <div className="my-auto text-center text-[#999]">
            <i className="bx bx-message-dots mb-4 block text-[3rem]" />
            <p>Mulai percakapan dengan mengirim pesan</p>
          </div>
        ) : (
          sorted.map((m) => {
            const msgId = String(m.id ?? `t-${m.tracking}`);
            const displayContent = messagePlaintext[msgId] || "Mendekripsi...";

            return (
              <div
                key={msgId}
                className={`flex flex-col gap-2 ${m.fromUserId === userId ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex max-w-[70%] flex-col rounded-xl px-4 py-3 text-black shadow-sm ${
                    m.fromUserId === userId ? "items-end bg-[#D9FDD3]" : "bg-white"
                  }`}
                >
                  <p className="hyphens-auto m-0 wrap-break-word text-[0.9375rem] [word-break:break-word]">
                    {displayContent}
                  </p>
                  
                  <div
                    className={`mt-1 flex items-center gap-1 text-[0.75rem] text-[#666666] ${m.fromUserId === userId ? "flex-row" : "flex-row-reverse"}`}
                  >
                    <span>{formatTime(Date.parse(m.createdAt))}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Message Area */}
      <div className="flex flex-col gap-2 border-t border-[#E5E5E5] bg-white p-4">
        {sendError && (
          <div className="mb-2 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">
            {sendError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={!chatEnabled}
            placeholder="Tulis pesan..."
            className="flex-1 rounded-3xl border border-[#E5E5E5] px-4 py-3 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputMessage.trim()) {
                onSendText(inputMessage.trim());
                setInputMessage("");
              }
            }}
          />
          <button
            onClick={() => {
              onSendText(inputMessage.trim());
              setInputMessage("");
            }}
            disabled={!inputMessage.trim() || !chatEnabled}
            className={`rounded-3xl px-6 py-3 font-semibold text-white ${
              inputMessage.trim() && chatEnabled ? "bg-[#42B549]" : "bg-[#CCC]"
            }`}
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}
export type ChatPageProps = {
  token: string;
  email: string;
  myPrivateKeyJwk: JsonWebKey;
  onLogout: () => void;
};

export function ChatPage({
  token,
  email,
  myPrivateKeyJwk,
  onLogout,
}: ChatPageProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [rooms, setRooms] = useState<Map<number, Map<number | string, Message>>>(
    () => new Map(),
  );
  const [activePartnerUserId, setActivePartnerUserId] = useState<number | null>(
    null,
  );

  const [sendError, setSendError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [partnerKeysByEmail, setPartnerKeysByEmail] = useState<
    Map<string, JsonWebKey>
  >(new Map());
  const [aesKeysByEmail, setAesKeysByEmail] = useState<Map<string, CryptoKey>>(
    new Map(),
  );
  const [messagePlaintext, setMessagePlaintext] = useState<
    Record<string, string>
  >({});

  const refreshContacts = () => {
    setContactsLoading(true);
    setContactsError(null);
    fetchContacts(token)
      .then((res) => setContacts((res.contacts ?? []).filter((c) => c !== email)))
      .catch((err) => {
        if (err instanceof ApiError) setContactsError(err.message);
        else setContactsError("Gagal mengambil daftar user.");
      })
      .finally(() => setContactsLoading(false));
  };


  
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setContactsLoading(true);
      setContactsError(null);
    });
    fetchContacts(token)
      .then((res) => {
        if (cancelled) return;
        const next = (res.contacts ?? []).filter((c) => c !== email);
        setContacts(next);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setContactsError(err.message);
        else setContactsError("Gagal mengambil daftar user.");
      })
      .finally(() => {
        if (cancelled) return;
        setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, email]);

  const partners = useMemo(() => {
    return contacts.map((c, idx) => {
      const id = idx + 1;
      const p: PartnerInfo = {
        id,
        role: "USER",
        name: c,
        storeId: null,
        storeName: null,
        storeDescription: null,
        storeLogoPath: null,
      };
      return p;
    });
  }, [contacts]);

  const partnerIdByEmail = useMemo(() => {
    const map = new Map<string, number>();
    partners.forEach((partner) => map.set(partner.name, partner.id));
    return map;
  }, [partners]);

  const partnerById = useMemo(() => {
    const m = new Map<number, PartnerInfo>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  const upsertIncomingMessage = useCallback((m: ApiMessage) => {
    const partnerEmail = m.sender_email === email ? m.receiver_email : m.sender_email;
    const partnerId = partnerIdByEmail.get(partnerEmail);
    if (!partnerId) return;

    setRooms((prev) => {
      const next = new Map(prev);
      const roomMap = new Map(next.get(partnerId) ?? new Map<number | string, Message>());
      roomMap.set(m.id, {
        id: m.id,
        fromUserId: m.sender_email === email ? 0 : partnerId,
        toUserId: m.receiver_email === email ? 0 : partnerId,
        content: "",
        ciphertext: m.ciphertext,
        iv: m.iv,
        createdAt: m.timestamp,
        isRead: true,
      });
      next.set(partnerId, roomMap);
      return next;
    });
  }, [email, partnerIdByEmail]);

  const activePartner = activePartnerUserId
    ? partnerById.get(activePartnerUserId)
    : undefined;
  const room =
    activePartnerUserId != null
      ? (rooms.get(activePartnerUserId) ?? new Map())
      : new Map();

  const chatEnabled = true;

  useEffect(() => {
    const ws = new WebSocket(
      `${websocketBaseUrl()}/ws/messages?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WsIncomingMessage;
        if (parsed?.type !== "new_message" || !parsed.message) return;
        upsertIncomingMessage(parsed.message);
      } catch (err) {
        console.error("Pesan websocket tidak valid:", err);
      }
    };

    return () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      ws.close();
    };
  }, [token, upsertIncomingMessage]);

  const selectPartner = (partnerId: number) => {
    setActivePartnerUserId((prev) => (prev === partnerId ? null : partnerId));
    setRooms((prev) => {
      if (prev.has(partnerId)) return prev;
      const next = new Map(prev);
      next.set(partnerId, new Map());
      return next;
    });
  };

  const parsePublicKeyJwk = useCallback((rawKey: unknown): JsonWebKey => {
    if (typeof rawKey === "string") {
      return JSON.parse(rawKey) as JsonWebKey;
    }
    return rawKey as JsonWebKey;
  }, []);

  const ensureAesKeyForPartner = useCallback(async (partnerEmail: string) => {
    let partnerPublicKey = partnerKeysByEmail.get(partnerEmail) ?? null;
    if (!partnerPublicKey) {
      const keyData = await fetchPublicKey(partnerEmail, token);
      partnerPublicKey = parsePublicKeyJwk(keyData.public_key);
      setPartnerKeysByEmail((prev) => {
        const next = new Map(prev);
        next.set(partnerEmail, partnerPublicKey!);
        return next;
      });
    }

    let aesKey = aesKeysByEmail.get(partnerEmail) ?? null;
    if (!aesKey) {
      aesKey = await deriveConversationAesKey(
        myPrivateKeyJwk,
        partnerPublicKey,
        email,
        partnerEmail,
      );
      setAesKeysByEmail((prev) => {
        const next = new Map(prev);
        next.set(partnerEmail, aesKey!);
        return next;
      });
    }
    if (!aesKey) {
      throw new Error("Gagal membentuk kunci chat.");
    }
    return aesKey;
  }, [
    aesKeysByEmail,
    email,
    myPrivateKeyJwk,
    parsePublicKeyJwk,
    partnerKeysByEmail,
    token,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toMerge: Record<string, string> = {};
      for (const [partnerId, roomMap] of rooms) {
        const partner = partnerById.get(partnerId);
        if (!partner) continue;
        let aesKey = aesKeysByEmail.get(partner.name) ?? null;
        if (!aesKey) {
          try {
            aesKey = await ensureAesKeyForPartner(partner.name);
          } catch {
            continue;
          }
        }
        if (!aesKey) continue;
        for (const m of roomMap.values()) {
          if (!m.ciphertext || !m.iv) continue;
          const msgKey = String(m.id ?? `t-${m.tracking}`);
          toMerge[msgKey] = await decryptMessage(
            m.ciphertext,
            m.iv,
            aesKey,
          );
        }
      }
      if (cancelled) return;
      setMessagePlaintext((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(toMerge)) {
          if (next[k] !== v) {
            next[k] = v;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, aesKeysByEmail, partnerById, ensureAesKeyForPartner]);

  const refreshMessages = useCallback(async () => {
    if (!activePartner || !activePartnerUserId) return;
    try {
      await ensureAesKeyForPartner(activePartner.name);
      const data = await fetchMessages(activePartner.name, token);
      setRooms((prev) => {
        const next = new Map(prev);
        const partnerMsgs = new Map<number | string, Message>();
        (data.messages as ApiMessage[]).forEach((m) => {
          partnerMsgs.set(m.id, {
            id: m.id,
            fromUserId: m.sender_email === email ? 0 : activePartnerUserId,
            toUserId: m.receiver_email === email ? 0 : activePartnerUserId,
            content: "",
            ciphertext: m.ciphertext,
            iv: m.iv,
            createdAt: m.timestamp,
            isRead: true,
          });
        });
        next.set(activePartnerUserId, partnerMsgs);
        return next;
      });
    } catch (err) {
      console.error("Gagal refresh pesan:", err);
    }
  }, [activePartner, activePartnerUserId, email, ensureAesKeyForPartner, token]);

  useEffect(() => {
    if (!activePartnerUserId) return;
    const t = setTimeout(() => {
      void refreshMessages();
    }, 0);
    return () => clearTimeout(t);
  }, [activePartnerUserId, refreshMessages]);

  const onSendText = useCallback(async (text: string) => {
    if (activePartnerUserId == null || !activePartner) return;
    setSendError(null);

    try {
      const aesKey = await ensureAesKeyForPartner(activePartner.name);

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedContent = new TextEncoder().encode(text);
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encodedContent,
      );

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("Koneksi realtime terputus. Coba beberapa detik lagi.");
      }

      wsRef.current.send(
        JSON.stringify({
          type: "send_message",
          receiver_email: activePartner.name,
          ciphertext: bufferToHex(ciphertext),
          iv: bufferToHex(iv.buffer),
        }),
      );
    } catch (err: unknown) {
      console.error("Gagal mengirim pesan:", err);
      setSendError(
        err instanceof Error
          ? err.message
          : "Gagal mengenkripsi atau mengirim pesan.",
      );
    }
  }, [activePartner, activePartnerUserId, ensureAesKeyForPartner]);

  return (
    <div className="flex h-screen flex-col bg-[#F5F5F5]">
      <div className="flex items-center gap-4 border-b border-[#E5E5E5] bg-white px-6 py-4">
        <h1 className="m-0 flex-1 text-[1.5rem] font-semibold text-[#333]">
          Chat
        </h1>
        <div className="hidden text-sm text-[#666] md:block">
          Login sebagai <span className="font-semibold text-[#333]">{email}</span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            wsConnected
              ? "bg-[#EAF8EC] text-[#1F7A2A]"
              : "bg-[#FDECEC] text-[#B42318]"
          }`}
        >
          {wsConnected ? "Realtime terhubung" : "Realtime terputus"}
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-sm font-semibold text-[#333] transition-colors hover:bg-[#f4fbf5] hover:text-[#42B549]"
        >
          Keluar
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatSidebar
          rooms={rooms}
          partnerById={partnerById}
          activePartnerUserId={activePartnerUserId}
          onSelectPartner={selectPartner}
          contactsLoading={contactsLoading}
          contactsError={contactsError}
          onRefreshContacts={refreshContacts}
          messagePlaintext={messagePlaintext}
        />
        <ChatDashboard
          userId={0}
          activePartnerUserId={activePartnerUserId}
          setActivePartnerUserId={setActivePartnerUserId}
          partnerInfo={activePartner ?? null}
          room={room}
          chatEnabled={chatEnabled}
          onSendText={onSendText}
          sendError={sendError}
          messagePlaintext={messagePlaintext}
        />
      </div>
    </div>
  );
}
