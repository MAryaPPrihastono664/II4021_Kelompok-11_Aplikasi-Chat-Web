export type StoredAuth = { token: string; email: string };

const TOKEN_KEY = "chatweb.token";
const EMAIL_KEY = "chatweb.email";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const part = document.cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(prefix));
  if (!part) return null;
  return decodeURIComponent(part.slice(prefix.length));
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getStoredAuth(): StoredAuth | null {
  const token = getCookie(TOKEN_KEY);
  const email = getCookie(EMAIL_KEY);
  if (!token || !email) {
    return null;
  }
  return { token, email };
}

export function setStoredAuth(auth: StoredAuth) {
  setCookie(TOKEN_KEY, auth.token, 60 * 60 * 24);
  setCookie(EMAIL_KEY, auth.email, 60 * 60 * 24);
}

export function clearStoredAuth() {
  clearCookie(TOKEN_KEY);
  clearCookie(EMAIL_KEY);
}
