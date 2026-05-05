CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  salt VARCHAR NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  kdf_params JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email VARCHAR NOT NULL,
  receiver_email VARCHAR NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  mac TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_email);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages (receiver_email);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages (timestamp);