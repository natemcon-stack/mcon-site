"use client";
import { useState } from "react";

// A photo that removes itself if the file isn't there.
//
// The site is built to deploy before the photography is chosen, which means half these
// files won't exist yet. A plain <img> would show a broken-image icon in that case —
// worse than showing nothing at all, since it looks like a fault rather than a gap.
// This renders nothing until the file is dropped into public/images/.
export default function Photo({ src, alt, caption }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full border border-rule bg-concrete object-cover"
      />
      {caption && (
        <figcaption className="mt-2 text-sm leading-relaxed text-ink/70">{caption}</figcaption>
      )}
    </figure>
  );
}
