"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getStoredAuth, setStoredAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (getStoredAuth()) {
      router.replace("/chat");
      return;
    }
    queueMicrotask(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
        <span className="text-sm text-gray-600">Memuat…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
      <AuthCard
        onAuthenticated={(auth) => {
          setStoredAuth(auth);
          router.push("/chat");
        }}
      />
    </div>
  );
}
