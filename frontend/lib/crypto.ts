
const HKDF_SALT_TEXT = "chat-webapp-hkdf-salt-v1";

export function utf8Bytes(v: string) {
  return new TextEncoder().encode(v);
}

export function bufferToHex(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
}

function cleanJwkForImport(jwk: JsonWebKey) {
  const { key_ops: _keyOps, ...cleaned } = jwk;
  void _keyOps;
  return cleaned;
}

export function conversationInfoString(myEmail: string, partnerEmail: string) {
  return `chat:${[myEmail, partnerEmail].sort().join("|")}:aes-256-gcm`;
}

export function conversationHkdfSaltBytes() {
  return utf8Bytes(HKDF_SALT_TEXT);
}

export function conversationHkdfInfoBytes(myEmail: string, partnerEmail: string) {
  return utf8Bytes(conversationInfoString(myEmail, partnerEmail));
}

export async function importEcdhPrivateKey(privateKeyJWK: JsonWebKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    cleanJwkForImport(privateKeyJWK),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

export async function importEcdhPublicKey(publicKeyJWK: JsonWebKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    cleanJwkForImport(publicKeyJWK),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

export async function deriveEcdhSharedSecretBits(
  myPrivateKeyJWK: JsonWebKey,
  partnerPublicKeyJWK: JsonWebKey,
) {
  const privateKey = await importEcdhPrivateKey(myPrivateKeyJWK);
  const publicKey = await importEcdhPublicKey(partnerPublicKeyJWK);
  return window.crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
}

export async function deriveConversationAesKey(
  myPrivateKeyJWK: JsonWebKey,
  partnerPublicKeyJWK: JsonWebKey,
  myEmail: string,
  partnerEmail: string,
) {
  const sharedSecret = await deriveEcdhSharedSecretBits(
    myPrivateKeyJWK,
    partnerPublicKeyJWK,
  );
  const hkdfBaseKey = await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: conversationHkdfSaltBytes(),
      info: conversationHkdfInfoBytes(myEmail, partnerEmail),
    },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveConversationKeyMaterialBits(
  sharedSecret: ArrayBuffer,
  myEmail: string,
  partnerEmail: string,
) {
  const hkdfBaseKey = await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"],
  );
  return window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: conversationHkdfSaltBytes(),
      info: conversationHkdfInfoBytes(myEmail, partnerEmail),
    },
    hkdfBaseKey,
    256,
  );
}

export async function encryptChatPayload(plaintext: string, aesKey: CryptoKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedContent = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encodedContent,
  );

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
    ivHex: bufferToHex(iv),
    ciphertextHex: bufferToHex(ciphertext),
  };
}

export async function decryptChatPayload(
  ciphertextHex: string,
  ivHex: string,
  aesKey: CryptoKey,
) {
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBuffer(ivHex) },
    aesKey,
    hexToBuffer(ciphertextHex),
  );
  return new TextDecoder().decode(decryptedBuffer);
}

export async function generateChatKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
}

export async function encryptPrivateKey(privateKeyJWK: string, password: string) {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
  const baseKey = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(privateKeyJWK)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
    iterations: 100000
  };
}

export async function decryptPrivateKey(
  ciphertextB64: string, 
  password: string, 
  ivB64: string, 
  saltB64: string, 
  iterations: number
) {
  const enc = new TextEncoder();
  
  try {
    const toUint8Array = (b64: string) => {
        const binString = atob(b64.trim().replace(/\s/g, ''));
        return Uint8Array.from(binString, (m) => m.charCodeAt(0));
    };

    const ciphertext = toUint8Array(ciphertextB64);
    const iv = toUint8Array(ivB64);
    const salt = toUint8Array(saltB64);

    const baseKey = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]
    );

    const aesKey = await window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error("Kunci rusak atau password salah:", error);
    throw new Error("Gagal membuka kunci keamanan. Pastikan password benar.");
  }
}