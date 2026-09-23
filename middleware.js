import { NextResponse } from "next/server";

// Edge-level guard rails.
//
// Deliberately thin. The real defences against a flood are Vercel's own — the firewall
// runs before this and doesn't bill for what it blocks, and a spend cap is the only
// thing that reliably bounds the damage. What's here handles the cases the firewall
// can't see: oversized bodies aimed at write endpoints, and obviously junk requests.

export const config = {
  // Only API routes. Page requests are cached and cheap; there's nothing to gain from
  // inspecting them, and running middleware on every asset costs invocations.
  matcher: "/api/:path*",
};

// Well above any legitimate request this app makes — the biggest is an email body with
// a few line items. Uploads go straight to Supabase Storage and never pass through here.
const MAX_BODY_BYTES = 1_000_000;

export function middleware(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return new NextResponse("Request too large", { status: 413 });
  }

  // A write to an API route from another origin is either a mistake or an attack; the
  // app only ever calls its own. Checked here rather than per-route so a new endpoint
  // is covered the day it's written.
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("host");
      try {
        if (new URL(origin).host !== host) {
          return new NextResponse("Cross-origin requests are not allowed", { status: 403 });
        }
      } catch (e) {
        return new NextResponse("Bad origin", { status: 403 });
      }
    }
  }

  return NextResponse.next();
}
