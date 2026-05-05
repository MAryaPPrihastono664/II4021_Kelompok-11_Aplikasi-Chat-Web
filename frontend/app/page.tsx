"use client";

import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { ChatPage } from "@/components/chat-page";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-gray-900">
        <AuthCard onAuthenticated={() => setLoggedIn(true)} />
      </div>
    );
  }

  return <ChatPage onLogout={() => setLoggedIn(false)} />;
}
