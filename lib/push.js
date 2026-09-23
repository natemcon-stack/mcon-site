"use client";
import { supabase } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registers the service worker, asks permission, and saves the subscription
// against the signed-in user so the daily clock-in/out job can reach them.
// Registers the service worker regardless of whether push is wanted. Offline support
// depends on it, and someone who declines notifications still works in basements.
export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    return null;
  }
}

export async function subscribeToPush() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return; // not configured yet

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  await supabase.from("push_subscriptions").upsert(
    [{ user_id: user.id, subscription: sub.toJSON() }],
    { onConflict: "user_id" }
  );
}
