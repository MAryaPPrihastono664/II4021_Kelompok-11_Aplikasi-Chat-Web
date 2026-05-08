"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getStoredAuth, setStoredAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Cek apakah ada token di session/cookie
    const auth = getStoredAuth();
    
    // Cek juga apakah kunci privat ada di localStorage
    // Jika token ada tapi kunci tidak ada (misal dihapus manual), 
    // user mungkin perlu login ulang agar kunci didekripsi kembali.
    const hasKey = !!localStorage.getItem("my_private_key");

    if (auth && hasKey) {
      router.replace("/chat");
      return;
    } 
    
    // Jika tidak ada auth, biarkan user di halaman ini untuk login
    setChecking(false);
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#42B549] border-t-transparent"></div>
          <span className="text-sm text-gray-600">Memeriksa sesi...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
      <AuthCard
        onAuthenticated={(auth) => {
          // 1. Simpan Token & Email (biasanya di Cookie atau Session)
          setStoredAuth(auth);
          
          // Note: 'my_private_key' sudah disimpan di localStorage 
          // oleh fungsi onLoginSubmit/onRegisterSubmit di dalam AuthCard.
          
          // 2. Pindah ke halaman chat
          router.push("/chat");
        }}
      />
    </div>
  );
}