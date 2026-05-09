"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getStoredAuth, setStoredAuth } from "@/lib/auth";
import { useSessionCrypto } from "@/components/session-provider";

export default function Home() {
  const router = useRouter();
  const { privateKeyJwk, setPrivateKeyJwk } = useSessionCrypto();

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth && privateKeyJwk) {
      router.replace("/chat");
    }
  }, [router, privateKeyJwk]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
      <AuthCard
        onAuthenticated={(auth) => {
          setStoredAuth({ token: auth.token, email: auth.email });
          setPrivateKeyJwk(auth.privateKeyJwk);
          router.push("/chat");
        }}
      />
    </div>
  );
}