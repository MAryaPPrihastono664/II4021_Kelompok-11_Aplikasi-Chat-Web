type ApiErrorPayload = {
  detail?: string | unknown[];
  message?: string;
  error?: string;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function apiBaseUrl() {
  const v = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return v.replace(/\/+$/, "");
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromPayload(payload: unknown) {
  if (payload && typeof payload === "object") {
    const p = payload as ApiErrorPayload;
    if (typeof p.detail === "string") return p.detail;
    if (Array.isArray(p.detail)) {
      const parts = p.detail
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const rec = item as { loc?: unknown; msg?: unknown };
          if (typeof rec.msg !== "string") return null;
          const loc = rec.loc;
          const field =
            Array.isArray(loc) &&
            loc.length > 0 &&
            typeof loc[loc.length - 1] === "string"
              ? String(loc[loc.length - 1])
              : null;
          return field ? `${field}: ${rec.msg}` : rec.msg;
        })
        .filter((s): s is string => Boolean(s));
      if (parts.length) return parts.join(" ");
    }
    if (typeof p.message === "string") return p.message;
    if (typeof p.error === "string") return p.error;
  }
  return "Request failed";
}

export async function apiFetch<T>(
  path: string,
  opts?: {
    method?: string;
    token?: string | null;
    body?: unknown;
  },
): Promise<T> {
  const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts?.method ?? (opts?.body != null ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts?.body == null ? undefined : JSON.stringify(opts.body),
  });

  const payload = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(errorMessageFromPayload(payload), res.status, payload);
  }
  return payload as T;
}

export type TokenResponse = { 
  ok: boolean; 
  token: string;
  user?: {
    email: string;
    encrypted_private_key: string;
    kdf_params: {
      iv: string;
      salt: string;
      iterations: number;
    };
  };
};export type ContactListResponse = { contacts: string[] };

export async function login(email: string, password: string) {
  return apiFetch<TokenResponse>("/auth/login", { body: { email, password } });
}

export async function register(input: {
  email: string;
  password: string;
  public_key: string;
  encrypted_private_key: string;
  kdf_params: Record<string, unknown>;
}) {
  return apiFetch<{ ok: boolean }>("/auth/register", { body: input });
}

export async function fetchContacts(token: string) {
  return apiFetch<ContactListResponse>("/users/contacts", { token });
}

// Tambahkan ini di @/lib/api.ts atau file sejenis
export async function fetchPublicKey(email: string, token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${email}/public-key`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Gagal mengambil public key");
  return res.json(); // Mengembalikan { public_key: "..." }
}

export async function sendMessage(token: string, data: { receiver_email: string, ciphertext: string, iv: string }) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal mengirim pesan");
  return res.json();
}

export async function fetchMessages(email: string, token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/messages/${email}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Gagal mengambil pesan");
  return res.json(); // Mengembalikan { messages: [...] }
}