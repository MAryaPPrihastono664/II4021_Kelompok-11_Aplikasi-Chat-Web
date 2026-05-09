"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SessionCryptoContextValue = {
  privateKeyJwk: JsonWebKey | null;
  setPrivateKeyJwk: (key: JsonWebKey | null) => void;
  clearSessionCrypto: () => void;
};

const SessionCryptoContext = createContext<SessionCryptoContextValue | null>(null);

export function SessionCryptoProvider({ children }: { children: ReactNode }) {
  const [privateKeyJwk, setPrivateKeyJwk] = useState<JsonWebKey | null>(null);

  const clearSessionCrypto = useCallback(() => {
    setPrivateKeyJwk(null);
  }, []);

  const value = useMemo<SessionCryptoContextValue>(
    () => ({
      privateKeyJwk,
      setPrivateKeyJwk,
      clearSessionCrypto,
    }),
    [privateKeyJwk, clearSessionCrypto],
  );

  return (
    <SessionCryptoContext.Provider value={value}>
      {children}
    </SessionCryptoContext.Provider>
  );
}

export function useSessionCrypto() {
  const ctx = useContext(SessionCryptoContext);
  if (!ctx) {
    throw new Error("useSessionCrypto must be used inside SessionCryptoProvider");
  }
  return ctx;
}
