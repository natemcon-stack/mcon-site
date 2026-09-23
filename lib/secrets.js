import crypto from "crypto";

// Encryption for third-party secrets held on behalf of other companies.
//
// The app stores each company's PayPal secret so their client payments go to their own
// account rather than the platform owner's. That secret is not ours — it can move money
// out of someone else's business — so it is never written to the database in plain text.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather than
// silently returning garbage that we'd then send to PayPal as credentials.
//
// SECRET_ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Rotating that key makes every stored secret unreadable — companies would have to
// re-enter them. Set it once and keep it somewhere you won't lose it.

function key() {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRET_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("SECRET_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

// Returns "v1:<iv>:<tag>:<ciphertext>", all base64. The version prefix means a future
// change of algorithm can still read what's already stored.
export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

// Returns null rather than throwing on anything malformed. A failed decrypt should read
// as "no credentials configured" — which disables the payment button — instead of
// crashing the pay page in front of a client.
export function decryptSecret(stored) {
  try {
    if (!stored) return null;
    const [version, ivB64, tagB64, dataB64] = String(stored).split(":");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (e) {
    return null;
  }
}

// For showing an admin that a secret is set without revealing it.
export function maskSecret(plain) {
  if (!plain) return null;
  const s = String(plain);
  return s.length <= 8 ? "••••" : `••••••••${s.slice(-4)}`;
}
