"use client";
import { brand } from "@/lib/brand";

// Free geocoding via OpenStreetMap's Nominatim — no API key needed.
// Best-effort: returns null if the address can't be found, rather than throwing.
// A bare street address (no city/province) is genuinely ambiguous — "Maple Avenue"
// exists in dozens of places — so this always appends city/province/country and
// biases results to Canada, rather than trusting whatever text was typed alone.
export async function geocodeAddress(addressLine, city = brand.defaultCity, province = brand.defaultProvince, country = brand.defaultCountry) {
  if (!addressLine || !addressLine.trim()) return null;
  const fullQuery = [addressLine, city, province, country].filter(Boolean).join(", ");
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(fullQuery)}`,
      { headers: { "Accept-Language": "en" } }
    );
    const results = await res.json();
    if (results && results[0]) {
      return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
    }
  } catch (e) {
    // ignore — geocoding is best-effort
  }
  return null;
}

// Wraps the browser's GPS prompt in a promise. Resolves null if denied/unavailable.
export function getCurrentPosition() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}
