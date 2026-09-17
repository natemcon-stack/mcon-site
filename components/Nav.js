"use client";
import Link from "next/link";
import { useState } from "react";
import { SERVICES, PHONE, PHONE_HREF } from "@/lib/services";

// The phone number stays visible at every width. On a trade site it's the primary
// action — most people who decide to get in touch will call rather than fill in a form.
export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="font-display text-lg font-700 leading-none tracking-tight">
          M-CON <span className="text-red">Enterprises Inc.</span>
        </Link>

        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 text-sm md:flex">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="font-display hover:text-red"
            >
              Services
            </button>
            <Link href="/about" className="font-display hover:text-red">About</Link>
            <Link href="/faq" className="font-display hover:text-red">FAQ</Link>
            <Link href="/contact" className="font-display hover:text-red">Contact</Link>
          </nav>

          <a href={PHONE_HREF} className="font-display text-sm font-600 text-red hover:text-red-dark">
            {PHONE}
          </a>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="font-display text-sm md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-rule bg-concrete">
          <div className="mx-auto max-w-5xl px-5 py-4">
            <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/${s.slug}`}
                    onClick={() => setOpen(false)}
                    className="block py-1.5 hover:text-red"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-3 flex gap-5 border-t border-rule pt-3 text-sm md:hidden">
              <li><Link href="/about" onClick={() => setOpen(false)}>About</Link></li>
              <li><Link href="/faq" onClick={() => setOpen(false)}>FAQ</Link></li>
              <li><Link href="/contact" onClick={() => setOpen(false)}>Contact</Link></li>
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
