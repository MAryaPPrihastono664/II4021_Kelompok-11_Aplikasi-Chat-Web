"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatPage } from "@/components/chat-page";
import { clearStoredAuth, getStoredAuth } from "@/lib/auth";
import { useSessionCrypto } from "@/components/session-provider";

export default function ChatRoutePage() {
  const router = useRouter();
  const { privateKeyJwk, clearSessionCrypto } = useSessionCrypto();
  const auth = getStoredAuth();

  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) {
      router.replace("/");
      return;
    }
    if (!privateKeyJwk) {
      clearStoredAuth();
      router.replace("/");
      return;
    }
  }, [router, privateKeyJwk, clearSessionCrypto]);

  if (!auth || !privateKeyJwk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
        <span className="text-sm text-gray-600">Memuat…</span>
      </div>
    );
  }

  return (
    <ChatPage
      token={auth.token}
      email={auth.email}
      myPrivateKeyJwk={privateKeyJwk}
      onLogout={() => {
        clearStoredAuth();
        clearSessionCrypto();
        router.replace("/");
      }}
    />
  );
}
