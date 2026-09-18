"use client";
import { useState } from "react";

// The logo, with the wordmark as a fallback.
//
// Falls back rather than breaking, for the same reason as Photo: the site has to look
// right before the image file is in place. If public/logo.png is missing, the company
// name is set in type and nobody can tell anything is absent.
export default function Logo({ className = "" }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`font-display text-lg font-700 leading-none tracking-tight ${className}`}>
        M-CON <span className="text-red">Enterprises Inc.</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="M-CON Enterprises Inc."
      onError={() => setFailed(true)}
      className={`h-11 w-auto ${className}`}
    />
  );
}
