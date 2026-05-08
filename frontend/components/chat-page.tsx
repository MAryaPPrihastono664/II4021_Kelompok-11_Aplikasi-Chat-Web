"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, fetchContacts, fetchPublicKey, sendMessage, fetchMessages } from "@/lib/api";

type Message = {
  id: number | null;
  fromUserId: number;
  toUserId: number;
  messageType: "text" | "image";
  content: string;
  tracking: number | null;
  isRead: boolean;
  createdAt: string;
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

// Utilitas untuk konversi format data
const hexToBuffer = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
const bufferToHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

// Fungsi untuk derivasi kunci simetris (ECDH + HKDF)
async function deriveSharedKey(myPrivateKeyJWK: any, partnerPublicKeyJWK: any) {
  const privateKey = await window.crypto.subtle.importKey(
    "jwk", myPrivateKeyJWK, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]
  );
  const publicKey = await window.crypto.subtle.importKey(
    "jwk", partnerPublicKeyJWK, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  return window.crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
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

function RenderChatMessageText({ content }: { content: string }) {
  const urlRe =
    /\b(https?:\/\/[^\s]+\b|[a-z0-9-]+\.[a-z]{2,}\/[^\s]*)\b/gi;
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of content.matchAll(urlRe)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(content.slice(last, i));
    const raw = m[0];
    let href = raw;
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    parts.push(
      <a
        key={k++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-800 underline"
      >
        {raw}
      </a>,
    );
    last = i + raw.length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <>{parts.length ? parts : content}</>;
}

function ChatSidebar({
  userId,
  rooms,
  partnerById,
  activePartnerUserId,
  onSelectPartner,
  contactsLoading,
  contactsError,
  onRefreshContacts,
}: {
  userId: number;
  rooms: Map<number, Map<number | string, Message>>;
  partnerById: Map<number, PartnerInfo>;
  activePartnerUserId: number | null;
  onSelectPartner: (partnerId: number) => void;
  contactsLoading: boolean;
  contactsError: string | null;
  onRefreshContacts: () => void;
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
              ? [...ms!.values()].filter(
                  (m) => m.toUserId === userId && !m.isRead,
                ).length
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
                            {lastMessage.fromUserId === userId ? (
                              lastMessage.id == null ? (
                                <i className="bx bx-time-five mr-1 inline align-middle text-[1rem]" />
                              ) : lastMessage.isRead ? (
                                <i className="bx bx-check-double mr-1 inline align-middle text-[1rem] text-[#0098ff]" />
                              ) : (
                                <i className="bx bx-check-double mr-1 inline align-middle text-[1rem]" />
                              )
                            ) : null}
                            {lastMessage.messageType === "text"
                              ? lastMessage.content.slice(0, 120)
                              : lastMessage.messageType === "image"
                                ? "🖼️ Gambar"
                                : null}
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
  myPrivateKeyJWK: any,
  partnerPublicKeyJWK: any
): Promise<string> {
  try {
    // 1. Import Kunci
    const privKey = await window.crypto.subtle.importKey(
      "jwk", myPrivateKeyJWK, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]
    );
    const pubKey = await window.crypto.subtle.importKey(
      "jwk", partnerPublicKeyJWK, { name: "ECDH", namedCurve: "P-256" }, false, []
    );

    // 2. Derivasi Kunci AES-GCM (ECDH + HKDF internal deriveKey)
    const sharedKey = await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: pubKey },
      privKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 3. Dekripsi
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBuffer(ivHex) },
      sharedKey,
      hexToBuffer(ciphertextHex)
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[DECRYPTION ERROR: Kunci tidak valid atau data rusak]";
  }
}

// --- Komponen Utama ---

function ChatDashboard({
  userId,
  activePartnerUserId,
  setActivePartnerUserId,
  partnerInfo,
  room,
  chatEnabled,
  chatDisabledReason,
  sendError, // Ambil dari props
  onSendText,
}: {
  userId: number;
  activePartnerUserId: number | null;
  setActivePartnerUserId: (v: number | null) => void;
  partnerInfo: any; // Sesuaikan dengan tipe PartnerInfo Anda
  room: Map<number | string, any>; // Message type
  chatEnabled: boolean;
  chatDisabledReason?: string;
  sendError: string | null;
  onSendText: (text: string) => void;
}) {
  const [inputMessage, setInputMessage] = useState("");
  
  // State untuk menyimpan pesan yang sudah didekripsi
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});

  // Ambil kunci privat user dari storage (asumsi disimpan dalam format JWK)
  const myPrivateKeyJWK = useMemo(() => {
    // PASTIKAN KEY-NYA "my_private_key" (sesuai dengan yang di-set saat login)
    const stored = localStorage.getItem("my_private_key"); 
    if (!stored) {
      console.error("Kunci privat tidak ditemukan di localStorage");
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Format kunci di localStorage bukan JSON yang valid", e);
      return null;
    }
  }, []);

  // Ambil kunci publik partner dari partnerInfo
  // Di dalam ChatDashboard
const partnerPublicKeyJWK = useMemo(() => {
  if (!partnerInfo?.public_key) return null;
  
  const rawKey = partnerInfo.public_key;
  try {
    // Jika string, parse. Jika sudah objek, langsung ambil.
    return typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
  } catch (e) {
    console.error("Gagal parse partner public key", e);
    return null;
  }
}, [partnerInfo]);

  // Efek untuk memproses dekripsi setiap kali ada pesan baru
  // Di dalam function ChatDashboard
  useEffect(() => {
    const processRoom = async () => {
      // JANGAN LANJUT jika kunci belum ada
      if (!myPrivateKeyJWK || !partnerPublicKeyJWK) return;

      const newDecrypted: Record<string, string> = { ...decryptedMessages };
      let changed = false;

      for (const m of room.values()) {
        const msgId = m.id ?? `t-${m.tracking}`;
        
        // Dekripsi jika belum ada di cache ATAU jika sebelumnya error (mengandung "[Error")
        const needsDecryption = !newDecrypted[msgId] || newDecrypted[msgId].includes("[Error");

        if (needsDecryption && m.ciphertext && m.messageType === "text") {
          newDecrypted[msgId] = await decryptMessage(
            m.ciphertext,
            m.iv,
            myPrivateKeyJWK,
            partnerPublicKeyJWK
          );
          changed = true;
        }
      }

      if (changed) setDecryptedMessages(newDecrypted);
    };

    processRoom();
    // Tambahkan partnerPublicKeyJWK sebagai dependency
  }, [room, myPrivateKeyJWK, partnerPublicKeyJWK]);

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
            <img src={partnerInfo.storeLogoPath} className="h-full w-full rounded-full border object-cover" />
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
            const msgId = m.id ?? `t-${m.tracking}`;
            const displayContent = decryptedMessages[msgId] || "Mendekripsi...";

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
                  {m.messageType === "text" ? (
                    <p className="hyphens-auto m-0 wrap-break-word text-[0.9375rem] [word-break:break-word]">
                       {/* Gunakan displayContent yang sudah didekripsi */}
                      <RenderChatMessageText content={displayContent} />
                    </p>
                  ) : (
                    <span className="text-sm text-[#666]">[Gambar]</span>
                  )}
                  
                  <div className={`mt-1 flex items-center gap-1 text-[0.75rem] text-[#666666] ${m.fromUserId === userId ? "flex-row" : "flex-row-reverse"}`}>
                    <span>{formatTime(Date.parse(m.createdAt))}</span>
                    {m.fromUserId === userId && (
                       <i className={`bx ${!m.id ? "bx-time-five" : m.isRead ? "bx-check-double text-[#0098ff]" : "bx-check-double"} text-[1rem]`} />
                    )}
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
  onLogout: () => void;
};

export function ChatPage({ token, email, onLogout }: ChatPageProps) {
  const [rooms, setRooms] = useState<Map<number, Map<number | string, Message>>>(
    () => new Map(),
  );
  const [activePartnerUserId, setActivePartnerUserId] = useState<number | null>(
    null,
  );

  // State tambahan untuk error pengiriman (karena diakses oleh ChatDashboard)
  const [sendError, setSendError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  // Di dalam function ChatPage
  const [partnerKeys, setPartnerKeys] = useState<Map<number, any>>(new Map());

  


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

  const partnerById = useMemo(() => {
    const m = new Map<number, PartnerInfo>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  const activePartner = activePartnerUserId
    ? partnerById.get(activePartnerUserId)
    : undefined;
  const room =
    activePartnerUserId != null
      ? (rooms.get(activePartnerUserId) ?? new Map())
      : new Map();

  const chatEnabled = true;

  const selectPartner = (partnerId: number) => {
    setActivePartnerUserId((prev) => (prev === partnerId ? null : partnerId));
    setRooms((prev) => {
      if (prev.has(partnerId)) return prev;
      const next = new Map(prev);
      next.set(partnerId, new Map());
      return next;
    });
  };

// Fungsi Refresh Pesan
  const refreshMessages = async () => {
  if (!activePartner || !activePartnerUserId) return;
  try {
    // 1. AMBIL KUNCI PUBLIK jika belum tersedia di state
    if (!partnerKeys.has(activePartnerUserId)) {
      const keyData = await fetchPublicKey(activePartner.name, token);
      let pubKey = typeof keyData.public_key === 'string' 
        ? JSON.parse(keyData.public_key) 
        : keyData.public_key;
      
      setPartnerKeys(prev => new Map(prev).set(activePartnerUserId, pubKey));
    }

    // 2. AMBIL PESAN
    const data = await fetchMessages(activePartner.name, token);
    setRooms((prev) => {
      const next = new Map(prev);
      const partnerMsgs = new Map();
      data.messages.forEach((m: any) => {
        partnerMsgs.set(m.id, {
          id: m.id,
          fromUserId: m.sender_email === email ? 0 : activePartnerUserId,
          toUserId: m.receiver_email === email ? 0 : activePartnerUserId,
          messageType: "text",
          content: "", 
          ciphertext: m.ciphertext,
          iv: m.iv,
          createdAt: m.timestamp,
          isRead: true
        });
      });
      next.set(activePartnerUserId, partnerMsgs);
      return next;
    });
  } catch (err) {
    console.error("Gagal refresh pesan:", err);
  }
};

  // Efek untuk auto-refresh pesan saat ganti partner
  useEffect(() => {
    if (activePartnerUserId) refreshMessages();
  }, [activePartnerUserId]);

  const onSendText = async (text: string) => {
  if (activePartnerUserId == null || !activePartner) return;
    setSendError(null); // Reset error setiap kali mencoba kirim

    try {
      // 1. Ambil Public Key Penerima
      const partnerData = await fetchPublicKey(activePartner.name, token); 
      let partnerPubKey;
      if (typeof partnerData.public_key === 'string') {
          try {
              // Cek apakah string ini benar-benar JSON (diawali { )
              if (partnerData.public_key.startsWith('{')) {
                  partnerPubKey = JSON.parse(partnerData.public_key);
              } else {
                  // Jika bukan JSON (mungkin raw base64), Anda butuh logika import yang berbeda
                  throw new Error("Public key bukan format JSON/JWK");
              }
          } catch (e) {
              console.error("Gagal parse public key:", e);
          }
      } else {
          // Jika sudah berupa objek, langsung gunakan
          partnerPubKey = partnerData.public_key;
      }      
      // 2. Ambil Private Key milik sendiri (sudah didekripsi saat login)
      const storedPriv = localStorage.getItem("my_private_key"); // Gunakan key yang konsisten
      if (!storedPriv) throw new Error("Kunci privat tidak ditemukan. Silakan login ulang.");
      const myPrivateKey = JSON.parse(storedPriv);

      // 3. Derivasi Kunci
      const sharedKey = await deriveSharedKey(myPrivateKey, partnerPubKey);

      // 4. Enkripsi
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedContent = new TextEncoder().encode(text);
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        encodedContent
      );

      // 5. Kirim
      await sendMessage(token, {
        receiver_email: activePartner.name,
        ciphertext: bufferToHex(ciphertext),
        iv: bufferToHex(iv.buffer)
      });

      // 6. Refresh
      refreshMessages(); 
    } catch (err: any) {
      console.error("Gagal mengirim pesan:", err);
      // Isi state error agar bisa ditampilkan di dashboard
      setSendError(err.message || "Gagal mengenkripsi atau mengirim pesan.");
    }
  };

    // Efek untuk auto-refresh pesan setiap 3 detik
  useEffect(() => {
    // Hanya jalankan interval jika ada chat yang sedang dibuka
    if (!activePartnerUserId || !activePartner) return;

    // Jalankan refresh pertama kali saat partner dipilih (sudah dihandle effect lain, tapi aman)
    // refreshMessages(); 

    const interval = setInterval(() => {
      console.log("Auto-refreshing messages...");
      refreshMessages();
    }, 3000); // 3000ms = 3 detik

    // Cleanup function: Penting agar interval berhenti saat ganti user atau logout
    return () => {
      clearInterval(interval);
    };
  }, [activePartnerUserId, activePartner, token]); // Trigger ulang jika partner atau token berubah
  
  return (
    <div className="flex h-screen flex-col bg-[#F5F5F5]">
      <div className="flex items-center gap-4 border-b border-[#E5E5E5] bg-white px-6 py-4">
        <h1 className="m-0 flex-1 text-[1.5rem] font-semibold text-[#333]">
          Chat
        </h1>
        <div className="hidden text-sm text-[#666] md:block">
          Login sebagai <span className="font-semibold text-[#333]">{email}</span>
        </div>
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
          userId={0}
          rooms={rooms}
          partnerById={partnerById}
          activePartnerUserId={activePartnerUserId}
          onSelectPartner={selectPartner}
          contactsLoading={contactsLoading}
          contactsError={contactsError}
          onRefreshContacts={refreshContacts}
        />
        <ChatDashboard
          userId={0}
          activePartnerUserId={activePartnerUserId}
          setActivePartnerUserId={setActivePartnerUserId}
          partnerInfo={activePartner ? {
            ...activePartner,
            public_key: partnerKeys.get(activePartnerUserId!) 
          } : null}
          room={room}
          chatEnabled={chatEnabled}
          onSendText={onSendText}
          sendError={sendError}
        />
      </div>
    </div>
  );
}
