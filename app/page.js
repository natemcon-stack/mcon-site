import Link from "next/link";
import { SERVICES, RATES, QUOTE_FEES, PHONE, PHONE_HREF } from "@/lib/services";
import Photo from "@/components/Photo";

// The hero is the rate card.
//
// Every contractor site in the country opens with a photograph of a finished deck and a
// sentence about quality craftsmanship. Leading with published prices instead does two
// useful things: it's the genuinely unusual fact about how this business works, and it
// filters out the people who were never going to pay these rates before they reach the
// phone.

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pt-14 pb-16 sm:pt-20">
        <h1 className="font-display text-[2.6rem] font-700 leading-[0.98] sm:text-6xl">
          We renovate, we build,
          <br />
          we restore.
        </h1>

        <p className="mt-7 max-w-prose text-lg leading-relaxed">
          M-CON Enterprises Inc. is run by our founder Nate Muth, a red seal carpenter by
          trade. We work across Powell River, the qathet region and the surrounding
          islands, and take on remote and rollout projects throughout British Columbia.
        </p>

        {/* Rates set as a quote sheet. The figures align on their own column and the
            heavier rule above the last row is the one an invoice uses above a total. */}
        <div className="mt-12 max-w-xl">
          <h2 className="font-display text-sm font-600 text-cedar">What we charge</h2>
          <dl className="mt-3">
            {RATES.map((r) => (
              <div key={r.label} className="rule-item flex items-baseline justify-between gap-6 py-3">
                <dt className="text-base">{r.label}</dt>
                <dd className="figures shrink-0 text-right">
                  <span className="font-display text-xl font-700">{r.value}</span>
                  <span className="ml-2 text-sm text-cedar">{r.unit}</span>
                </dd>
              </div>
            ))}
            <div className="rule-total flex items-baseline justify-between gap-6 pt-3">
              <dt className="text-base">
                Materials, subtrades, engineers, dump fees, permits, architects and
                miscellaneous expenses
              </dt>
              <dd className="figures shrink-0 text-right">
                <span className="font-display text-xl font-700">+20%</span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-ink/80">
            Digital copies of receipts are available on request. Where the scope is known
            we prefer a firm price — what we quote is what we charge.{" "}
            <Link href="/faq" className="text-red underline hover:text-red-dark">
              How we bill
            </Link>
          </p>
        </div>

        <p className="mt-10">
          <a
            href={PHONE_HREF}
            className="inline-block bg-red px-6 py-3 font-display text-lg font-600 text-paper hover:bg-red-dark"
          >
            Call {PHONE}
          </a>
        </p>
      </section>

      {/* Work, shown after the rates. The rate card is still the hero — these are the
          evidence behind it rather than a decorative header image. */}
      <section className="mx-auto max-w-5xl px-5 pb-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Photo src="/images/home-1.jpg" alt="A finished home with new siding and stone facing in Powell River" />
          <Photo src="/images/home-2.jpg" alt="A renovated kitchen with navy cabinets and a stone island" />
          <Photo src="/images/home-3.jpg" alt="A timber-framed pavilion under construction, showing exposed beams" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-12">
        <a href="/gallery" className="font-display text-red underline hover:text-red-dark">
          See more of our work
        </a>
      </section>

      <section className="border-t border-rule bg-concrete">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="font-display text-3xl font-700">What we do</h2>
          <ul className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {SERVICES.map((s) => (
              <li key={s.slug} className="rule-item py-4">
                <Link href={`/${s.slug}`} className="group block">
                  <span className="font-display text-xl font-600 group-hover:text-red">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-base leading-relaxed text-ink/80">
                    {s.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-12 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-700">How we bill</h2>
            <div className="mt-4 max-w-prose space-y-4 text-base leading-relaxed">
              <p>
                How a project is billed depends on the project. Wherever possible we
                prefer to give firm pricing, so your budget is respected and you know the
                number before we start.
              </p>
              <p>
                We aren&apos;t the kind of contractors who give unrealistically low
                pricing to secure a job and then pile on extras once your project is half
                complete.
              </p>
              <p>
                On hourly and materials contracts we invoice every week, so you can keep
                track of costs as the work runs rather than finding out at the end.
              </p>
              <p>
                A deposit is taken at the start of your project and applied to your final
                weekly invoice. Anything left over is refunded to you promptly.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl font-700">Out-of-town quotes</h2>
            <dl className="mt-4 max-w-sm">
              {QUOTE_FEES.map((q) => (
                <div key={q.label} className="rule-item flex items-baseline justify-between gap-6 py-3">
                  <dt>{q.label}</dt>
                  <dd className="figures font-display font-600">{q.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/80">
              We supply our own materials, so the right products go into your project and
              no time is lost to duplicated effort or procurement delays.
            </p>
            <p className="mt-6 text-sm text-cedar">
              $5 million liability insurance · Up-to-date WorkSafeBC coverage
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
