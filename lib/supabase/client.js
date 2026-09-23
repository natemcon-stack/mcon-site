"use client";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// flowType 'implicit' is deliberate, not a leftover.
//
// supabase-js v2 defaults to PKCE, which pairs the link with a code verifier stored in
// the browser that *requested* it. That's fine for a normal sign-in, but it breaks the
// case this app actually needs: an admin generates a set-password link on their own
// machine and sends it to someone else. The recipient's browser has no verifier, so the
// exchange fails and the link appears broken — which is exactly the symptom of an
// invited user who can never get in.
//
// Implicit flow returns the tokens in the URL fragment instead, so the link works in
// whichever browser opens it, on any device.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "implicit",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
