"use client";

import { useMemo, useState, type ReactNode } from "react";

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

const MOCK_USER_ID = 1;
const MOCK_USER_ROLE = "BUYER" as const;

const MOCK_PARTNERS: PartnerInfo[] = [
  {
    id: 2,
    role: "SELLER",
    name: "Budi",
    storeId: 10,
    storeName: "Warung Segar",
    storeDescription: null,
    storeLogoPath: null,
  },
  {
    id: 3,
    role: "SELLER",
    name: "Ani",
    storeId: 11,
    storeName: "Tech Corner",
    storeDescription: null,
    storeLogoPath: null,
  },
];

function initialMessages(): Map<number, Map<number | string, Message>> {
  const rooms = new Map<number, Map<number | string, Message>>();
  const r2 = new Map<number | string, Message>();
  r2.set(101, {
    id: 101,
    fromUserId: 2,
    toUserId: MOCK_USER_ID,
    messageType: "text",
    content: "Halo! Ada yang bisa dibantu?",
    tracking: null,
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  });
  r2.set(102, {
    id: 102,
    fromUserId: MOCK_USER_ID,
    toUserId: 2,
    messageType: "text",
    content: "Halo, saya mau tanya stok ya.",
    tracking: null,
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  });
  rooms.set(2, r2);

  const r3 = new Map<number | string, Message>();
  r3.set(201, {
    id: 201,
    fromUserId: 3,
    toUserId: MOCK_USER_ID,
    messageType: "text",
    content: "Pengiriman besok bisa?",
    tracking: null,
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  });
  rooms.set(3, r3);
  return rooms;
}

function NewChatModal({
  close,
  userRole,
  allPartners,
  onPick,
}: {
  close: () => void;
  userRole: string;
  allPartners: PartnerInfo[];
  onPick: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const searchResults = useMemo(() => {
    if (search.trim() === "") return [];
    const q = search.toLowerCase();
    const roles =
      userRole === "SELLER"
        ? ["BUYER"]
        : userRole === "BUYER"
          ? ["SELLER"]
          : [];
    return allPartners.filter(
      (p) =>
        (roles.length === 0 || roles.includes(p.role)) &&
        (p.storeName ?? p.name).toLowerCase().includes(q),
    );
  }, [search, userRole, allPartners]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="animate-fade-in flex max-h-[90vh] w-[90%] max-w-md flex-col gap-4 rounded-xl bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#333]">Chat Baru</h2>
          <button
            type="button"
            onClick={close}
            className="flex aspect-square items-center justify-center rounded-full p-2 text-2xl text-[#42B549] transition hover:bg-[#F0FFF1]"
            aria-label="Tutup"
          >
            <i className="bx bx-x" />
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari pengguna..."
          className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3 text-[0.9375rem] outline-none transition focus:border-[#42B549]"
        />
        <div className="flex max-h-80 flex-col divide-y divide-[#F0F0F0] overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="py-6 text-center text-[#999]">
              {search.trim() === ""
                ? "Ketik untuk mencari"
                : "Pengguna tidak ditemukan"}
            </p>
          ) : (
            searchResults.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => {
                  onPick(s.id);
                  close();
                }}
                className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition hover:bg-[#F0FFF1]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E5E5] text-xl text-[#42B549]">
                  {s.storeLogoPath != null ? (
                    <img
                      src={s.storeLogoPath}
                      alt=""
                      className="h-full w-full overflow-hidden rounded-full border object-cover"
                    />
                  ) : (
                    <i
                      className={
                        s.role === "SELLER" ? "bx bx-store" : "bx bx-user"
                      }
                    />
                  )}
                </div>
                <p className="text-[0.9375rem] font-medium text-[#333]">
                  {s.storeName ?? s.name}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ChatSidebar({
  userId,
  userRole,
  rooms,
  partnerById,
  activePartnerUserId,
  setActivePartnerUserId,
  chatEnabled,
  chatDisabledReason,
  onOpenNewChat,
}: {
  userId: number;
  userRole: string;
  rooms: Map<number, Map<number | string, Message>>;
  partnerById: Map<number, PartnerInfo>;
  activePartnerUserId: number | null;
  setActivePartnerUserId: (v: number | null | ((p: number | null) => number | null)) => void;
  chatEnabled: boolean;
  chatDisabledReason?: string;
  onOpenNewChat: () => void;
}) {
  const sortedRooms = useMemo(() => {
    return [...rooms]
      .filter(([, ms]) => ms.size > 0)
      .sort(
        ([, a], [, b]) =>
          Math.max(...[...b.values()].map((m) => Date.parse(m.createdAt))) -
          Math.max(...[...a.values()].map((m) => Date.parse(m.createdAt))),
      );
  }, [rooms]);

  return (
    <div
      className={`${activePartnerUserId != null ? "hidden md:flex" : "flex"} w-full flex-col overflow-hidden border-r border-[#E5E5E5] bg-white md:w-[320px]`}
    >
      <div className="flex flex-row items-center justify-between border-b border-[#E5E5E5] p-4">
        <h2 className="m-0 text-[1.125rem] font-semibold">
          {userRole === "BUYER" ? "Toko" : "Pembeli"}
        </h2>
        <button
          type="button"
          onClick={onOpenNewChat}
          disabled={!chatEnabled}
          title={
            !chatEnabled
              ? (chatDisabledReason ?? "Chat tidak tersedia")
              : undefined
          }
          className={`flex aspect-square items-center justify-center rounded-full p-2 transition-colors ${!chatEnabled ? "cursor-not-allowed opacity-50" : "text-[#42B549] hover:bg-[#f4fbf5]"}`}
        >
          <i className="bx bx-plus text-2xl" />
        </button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {sortedRooms.length === 0 ? (
          <div className="my-auto flex flex-col items-center p-8 text-center text-[#999]">
            <i className="bx bx-message-square-dots mb-4 text-[3rem]" />
            <p className="mb-2">Belum ada percakapan</p>
            {!chatEnabled ? (
              <div className="mt-2 border-l-4 border-yellow-500 bg-yellow-50 p-3">
                <p className="text-sm text-yellow-800">
                  {chatDisabledReason ?? "Chat tidak tersedia"}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenNewChat}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[#42B549] transition-colors hover:bg-[#f4fbf5]"
              >
                <i className="bx bx-plus text-xl" />
                <span className="font-medium">Chat Baru</span>
              </button>
            )}
          </div>
        ) : (
          sortedRooms.map(([p, ms]) => {
            const pi = partnerById.get(p);
            const unreadCount = [...ms.values()].filter(
              (m) => m.toUserId === userId && !m.isRead,
            ).length;
            const lastMessage = [...ms.values()].sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
            )[0]!;

            return (
              <button
                type="button"
                key={p}
                onClick={() =>
                  setActivePartnerUserId((v) => (v !== p ? p : null))
                }
                className={`w-full cursor-pointer border-b border-[#F0F0F0] p-4 text-left transition-colors ${activePartnerUserId === p ? "bg-[#F0FFF1]" : "bg-transparent"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E5E5E5] text-[1.5rem] text-[#42B549]">
                    {pi?.storeLogoPath != null ? (
                      <img
                        src={pi.storeLogoPath}
                        alt=""
                        className="h-full w-full overflow-hidden rounded-full border object-cover"
                      />
                    ) : (
                      <i
                        className={
                          pi?.role === "SELLER" ? "bx bx-store" : "bx bx-user"
                        }
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="m-0 max-w-[70%] overflow-hidden text-ellipsis whitespace-nowrap text-[0.9375rem] font-semibold">
                        {pi == null
                          ? "Unknown"
                          : (pi.storeName ?? pi.name)}
                      </h3>
                      <span className="ml-2 shrink-0 text-[0.75rem] text-[#999]">
                        {formatTime(Date.parse(lastMessage.createdAt))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="m-0 max-w-[85%] overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem]">
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
                      </p>
                      {unreadCount > 0 ? (
                        <span className="ml-2 min-w-5 rounded-xl bg-[#42B549] px-2 py-0.5 text-center text-[0.75rem] font-semibold text-white">
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

function ChatDashboard({
  userId,
  activePartnerUserId,
  setActivePartnerUserId,
  partnerInfo,
  room,
  chatEnabled,
  chatDisabledReason,
  onSendText,
}: {
  userId: number;
  activePartnerUserId: number | null;
  setActivePartnerUserId: (v: number | null) => void;
  partnerInfo: PartnerInfo | null | undefined;
  room: Map<number | string, Message>;
  chatEnabled: boolean;
  chatDisabledReason?: string;
  onSendText: (text: string) => void;
}) {
  const [inputMessage, setInputMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

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
      <div className="flex items-center gap-3 border-b border-[#E5E5E5] bg-white p-4">
        <button
          type="button"
          onClick={() => setActivePartnerUserId(null)}
          className="cursor-pointer border-0 bg-transparent p-2 text-[1.5rem] text-[#42B549] md:hidden"
          aria-label="Kembali ke daftar"
        >
          <i className="bx bx-arrow-back" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E5E5] text-[1.25rem] text-[#42B549]">
          {partnerInfo.storeLogoPath != null ? (
            <img
              src={partnerInfo.storeLogoPath}
              alt=""
              className="h-full w-full overflow-hidden rounded-full border object-cover"
            />
          ) : (
            <i
              className={
                partnerInfo.role === "SELLER" ? "bx bx-store" : "bx bx-user"
              }
            />
          )}
        </div>
        <h3 className="m-0 text-[1.125rem] font-semibold">
          {partnerInfo.storeName ?? partnerInfo.name}
        </h3>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F9F9F9] p-4">
        {sorted.length === 0 ? (
          <div className="my-auto text-center text-[#999]">
            <i className="bx bx-message-dots mb-4 block text-[3rem]" />
            <p>Mulai percakapan dengan mengirim pesan</p>
          </div>
        ) : (
          sorted.map((m) => (
            <div
              key={m.id ?? `t-${m.tracking}`}
              className={`flex flex-col gap-2 ${m.fromUserId === userId ? "items-end" : "items-start"}`}
            >
              <div
                className={`flex max-w-[70%] flex-col rounded-xl px-4 py-3 text-black shadow-sm ${m.fromUserId === userId ? "items-end bg-[#D9FDD3]" : "bg-white"}`}
              >
                {m.messageType === "text" ? (
                  <p className="hyphens-auto m-0 wrap-break-word text-[0.9375rem] [word-break:break-word] [&_a]:underline">
                    <RenderChatMessageText content={m.content} />
                  </p>
                ) : m.messageType === "image" ? (
                  <span className="text-sm text-[#666]">[Gambar — unggahan belum terhubung]</span>
                ) : null}
                <div
                  className={`mt-1 flex items-center gap-1 text-[0.75rem] text-[#666666] ${m.fromUserId === userId ? "flex-row" : "flex-row-reverse"}`}
                >
                  <span>{formatTime(Date.parse(m.createdAt))}</span>
                  {m.fromUserId === userId ? (
                    m.id == null ? (
                      <i className="bx bx-time-five text-[1rem]" />
                    ) : m.isRead ? (
                      <i className="bx bx-check-double text-[1rem] text-[#0098ff]" />
                    ) : (
                      <i className="bx bx-check-double text-[1rem]" />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-[#E5E5E5] bg-white p-4">
        {sendError ? (
          <div className="mb-2 border-l-4 border-red-500 bg-red-50 p-3">
            <div className="flex">
              <i className="bx bx-error-circle shrink-0 text-lg text-red-500" />
              <div className="ml-3 wrap-break-word text-sm text-red-800 [word-break:break-word]">
                {sendError}
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled
            title="Unggah gambar akan dihubungkan nanti"
            className="flex cursor-not-allowed items-center justify-center rounded-full p-3 text-2xl text-[#AAA] opacity-60"
          >
            <i className="bx bx-paperclip" />
          </button>
          <input
            value={!chatEnabled ? "" : inputMessage}
            onChange={(e) => {
              setInputMessage(e.target.value);
              setSendError(null);
            }}
            onKeyDown={(e) => {
              if (e.code !== "Enter") return;
              e.preventDefault();
              if (!chatEnabled) {
                setSendError(chatDisabledReason ?? "Chat tidak tersedia");
                return;
              }
              const t = inputMessage.trim();
              if (!t) return;
              setSendError(null);
              onSendText(t);
              setInputMessage("");
            }}
            disabled={!chatEnabled}
            placeholder="Tulis pesan..."
            title={
              !chatEnabled
                ? (chatDisabledReason ?? "Chat tidak tersedia")
                : undefined
            }
            className={`flex-1 rounded-3xl border border-[#E5E5E5] px-4 py-3 text-[0.9375rem] outline-none ${!chatEnabled ? "cursor-not-allowed opacity-50" : ""}`}
          />
          <button
            type="button"
            disabled={inputMessage.trim() === "" || !chatEnabled}
            onClick={() => {
              if (!chatEnabled) {
                setSendError(chatDisabledReason ?? "Chat tidak tersedia");
                return;
              }
              const t = inputMessage.trim();
              if (!t) return;
              setSendError(null);
              onSendText(t);
              setInputMessage("");
            }}
            title={
              !chatEnabled
                ? (chatDisabledReason ?? "Chat tidak tersedia")
                : undefined
            }
            className={`flex items-center gap-2 rounded-3xl px-6 py-3 text-[0.9375rem] font-semibold text-white transition-colors ${inputMessage.trim() !== "" && chatEnabled ? "cursor-pointer bg-[#42B549] hover:bg-[#2D7F34]" : "cursor-not-allowed bg-[#CCC]"}`}
          >
            <i className="bx bx-send" />
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}

export type ChatPageProps = {
  onLogout: () => void;
};

export function ChatPage({ onLogout }: ChatPageProps) {
  const [rooms, setRooms] = useState(() => initialMessages());
  const [activePartnerUserId, setActivePartnerUserId] = useState<number | null>(
    2,
  );
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  const partnerById = useMemo(() => {
    const m = new Map<number, PartnerInfo>();
    for (const p of MOCK_PARTNERS) m.set(p.id, p);
    return m;
  }, []);

  const chatEnabled = true;

  const ensureRoom = (partnerId: number) => {
    setRooms((prev) => {
      const next = new Map(prev);
      if (!next.has(partnerId)) next.set(partnerId, new Map());
      return next;
    });
  };

  const onPickNewChat = (partnerId: number) => {
    ensureRoom(partnerId);
    setActivePartnerUserId(partnerId);
  };

  const onSendText = (text: string) => {
    if (activePartnerUserId == null) return;
    const partnerId = activePartnerUserId;
    const tracking = Math.floor(Math.random() * 65536);
    const msg: Message = {
      id: null,
      fromUserId: MOCK_USER_ID,
      toUserId: partnerId,
      messageType: "text",
      content: text,
      tracking,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setRooms((prev) => {
      const next = new Map(prev);
      let r = next.get(partnerId);
      if (!r) {
        r = new Map();
        next.set(partnerId, r);
      }
      const r2 = new Map(r);
      r2.set(tracking, msg);
      next.set(partnerId, r2);
      return next;
    });
    window.setTimeout(() => {
      setRooms((prev) => {
        const next = new Map(prev);
        const r = next.get(partnerId);
        if (!r) return prev;
        const r2 = new Map(r);
        const cur = r2.get(tracking);
        if (!cur || cur.id != null) return prev;
        const realId = Math.floor(Math.random() * 1_000_000) + 10_000;
        const saved: Message = {
          ...cur,
          id: realId,
          tracking: null,
        };
        r2.delete(tracking);
        r2.set(realId, saved);
        next.set(partnerId, r2);
        return next;
      });
    }, 400);
  };

  const activePartner = activePartnerUserId
    ? partnerById.get(activePartnerUserId)
    : undefined;
  const room =
    activePartnerUserId != null
      ? (rooms.get(activePartnerUserId) ?? new Map())
      : new Map();

  return (
    <div className="flex h-screen flex-col bg-[#F5F5F5]">
      <div className="flex items-center gap-4 border-b border-[#E5E5E5] bg-white px-6 py-4">
        <h1 className="m-0 flex-1 text-[1.5rem] font-semibold text-[#333]">
          Chat
        </h1>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-sm font-semibold text-[#333] transition-colors hover:bg-[#f4fbf5] hover:text-[#42B549]"
        >
          Keluar
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showNewChatModal ? (
          <NewChatModal
            close={() => setShowNewChatModal(false)}
            userRole={MOCK_USER_ROLE}
            allPartners={MOCK_PARTNERS}
            onPick={onPickNewChat}
          />
        ) : null}
        <ChatSidebar
          userId={MOCK_USER_ID}
          userRole={MOCK_USER_ROLE}
          rooms={rooms}
          partnerById={partnerById}
          activePartnerUserId={activePartnerUserId}
          setActivePartnerUserId={setActivePartnerUserId}
          chatEnabled={chatEnabled}
          onOpenNewChat={() => setShowNewChatModal(true)}
        />
        <ChatDashboard
          userId={MOCK_USER_ID}
          activePartnerUserId={activePartnerUserId}
          setActivePartnerUserId={setActivePartnerUserId}
          partnerInfo={activePartner}
          room={room}
          chatEnabled={chatEnabled}
          onSendText={onSendText}
        />
      </div>
    </div>
  );
}
