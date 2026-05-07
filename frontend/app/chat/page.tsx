"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatPage } from "@/components/chat-page";
import type { StoredAuth } from "@/lib/auth";
import { clearStoredAuth, getStoredAuth } from "@/lib/auth";

export default function ChatRoutePage() {
  const router = useRouter();
  const [auth, setAuth] = useState<StoredAuth | null>(null);

  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) {
      router.replace("/");
      return;
    }
    setAuth(stored);
  }, [router]);

  if (!auth) {
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
      onLogout={() => {
        clearStoredAuth();
        router.replace("/");
      }}
    />
  );
}
