// Fungsi untuk generate kunci ECDH
export async function generateChatKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

// Fungsi untuk mengenkripsi private key menggunakan password user
export async function encryptPrivateKey(privateKeyJWK: string, password: string) {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
  // 1. Import password sebagai key material
  const baseKey = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]
  );

  // 2. Derivasi kunci AES-GCM dari password
  const aesKey = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 3. Enkripsi
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

// Fungsi untuk mendekripsi private key saat login
// Perbaikan fungsi decryptPrivateKey agar menerima parameter individual

// lib/crypto.ts

export async function decryptPrivateKey(
  ciphertextB64: string, 
  password: string, 
  ivB64: string, 
  saltB64: string, 
  iterations: number
) {
  const enc = new TextEncoder();
  
  try {
    // Helper untuk memastikan string Base64 bersih
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