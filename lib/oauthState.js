import crypto from "crypto";

// Signed state for OAuth round trips.
//
// The Gmail connect route used to take the user id straight from a query parameter and
// pass it through as the OAuth `state`, then trust it on the way back. That let anyone
// craft a connect link carrying someone else's user id: if the victim completed the
// Google consent screen, their refresh token was stored against the attacker's account,
// and the attacker's session could then read the victim's mail through the app.
//
// State is now signed with a secret only the server knows, and carries a timestamp so a
// captured link can't be replayed weeks later. The signature is verified before the user
// id is trusted for anything.

const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes — a consent screen doesn't take longer

function secret() {
  // CRON_SECRET is already a high-entropy server-only value present in every
  // deployment; reusing it avoids adding another variable people have to remember to
  // set, and a missing one fails closed rather than signing with a known default.
  const value = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET;
  if (!value) throw new Error("No signing secret configured");
  return value;
}

export function signOAuthState(userId) {
  const payload = `${userId}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

// Returns the user id, or null if the state is missing, malformed, expired, or the
// signature doesn't verify.
export function verifyOAuthState(state) {
  try {
    if (!state) return null;
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [userId, issuedAt, signature] = decoded.split(".");
    if (!userId || !issuedAt || !signature) return null;

    const expected = crypto.createHmac("sha256", secret()).update(`${userId}.${issuedAt}`).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    if (Date.now() - Number(issuedAt) > MAX_AGE_MS) return null;
    return userId;
  } catch (e) {
    return null;
  }
}
