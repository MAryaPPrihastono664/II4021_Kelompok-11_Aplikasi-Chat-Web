export type StoredAuth = { token: string; email: string };

const KEY = "chatweb.auth";

export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.token !== "string" || typeof parsed.email !== "string") {
      return null;
    }
    return { token: parsed.token, email: parsed.email };
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: StoredAuth) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(auth));
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

