import Link from "next/link";
import { SERVICES, PHONE, PHONE_HREF, EMAIL } from "@/lib/services";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-rule bg-concrete">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-[1.2fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
              Renovations, builds and restoration on the Upper Sunshine Coast — Powell
              River, the qathet region and the surrounding islands. Remote and rollout
              work throughout British Columbia.
            </p>
            <p className="mt-4 text-sm">
              <a href={PHONE_HREF} className="font-display font-600 text-red hover:text-red-dark">{PHONE}</a>
              <br />
              <a href={`mailto:${EMAIL}`} className="hover:text-red">{EMAIL}</a>
            </p>
            <p className="mt-4 text-sm text-cedar">
              $5 million liability insurance · WorkSafeBC coverage
            </p>
          </div>

          <nav aria-label="Services">
            <ul className="columns-2 gap-6 text-sm">
              {SERVICES.map((s) => (
                <li key={s.slug} className="mb-1.5">
                  <Link href={`/${s.slug}`} className="hover:text-red">{s.title}</Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 border-t border-rule pt-3 text-sm">
              <li className="mb-1.5"><Link href="/about" className="hover:text-red">About</Link></li>
              <li className="mb-1.5"><Link href="/faq" className="hover:text-red">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-red">Contact</Link></li>
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-rule pt-5 text-sm text-cedar">
          Est. 2015 as Muth Construction · M-CON Enterprises Inc. since 2024 · Powell River, BC
        </p>
      </div>
    </footer>
  );
}
