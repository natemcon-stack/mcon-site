import Link from "next/link";
import { PHONE, PHONE_HREF } from "@/lib/services";

// Shared wrapper for a service page, so the nine of them stay consistent and a change
// to the layout is one edit rather than nine.
//
// `photos` names the image files this page expects. They render only once the files
// exist, so the site is deployable before any photography is chosen — and no stock
// imagery is ever substituted.
export default function ServicePage({ title, lede, children, photos = [], rates }) {
  return (
    <>
      <div className="mx-auto max-w-5xl px-5 pt-12 pb-4">
        <Link href="/" className="text-sm text-cedar hover:text-red">
          M-CON Enterprises Inc.
        </Link>
        <h1 className="mt-4 font-display text-4xl font-700 sm:text-5xl">{title}</h1>
        {lede && <p className="mt-5 max-w-prose text-lg leading-relaxed">{lede}</p>}
      </div>

      <div className="mx-auto max-w-5xl px-5 pb-8">
        <div className="max-w-prose space-y-5 text-base leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-600 [&_li]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>

        {photos.length > 0 && (
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {photos.map((p) => (
              <figure key={p.src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.src}
                  alt={p.alt}
                  loading="lazy"
                  className="w-full border border-rule bg-concrete object-cover"
                />
                {p.caption && (
                  <figcaption className="mt-2 text-sm text-cedar">{p.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        {rates && (
          <dl className="mt-12 max-w-sm">
            <h2 className="font-display text-sm font-600 text-cedar">Rates</h2>
            {rates.map((r) => (
              <div key={r.label} className="rule-item flex items-baseline justify-between gap-6 py-3">
                <dt>{r.label}</dt>
                <dd className="figures font-display font-600">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-12">
          <a
            href={PHONE_HREF}
            className="inline-block bg-red px-6 py-3 font-display text-lg font-600 text-paper hover:bg-red-dark"
          >
            Call {PHONE}
          </a>
          <Link href="/contact" className="ml-5 underline hover:text-red">
            or send us a note
          </Link>
        </p>
      </div>
    </>
  );
}
