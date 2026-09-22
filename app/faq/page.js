export const metadata = {
  title: "Frequently asked questions",
  description:
    "How we bill, what we don't do, and who else in Powell River to call for torch-on roofing, seamless gutters, insurance restoration and hazardous materials assessment.",
};

// The referrals are the point of this page.
//
// Sending someone to Nelson Roofing or SJS is a job M-CON doesn't get. It's also the
// most persuasive thing on the site: a contractor who tells you plainly what they don't
// do is a contractor you believe about what they do. It also answers, in public, the
// questions a client would otherwise ask behind their back.

const FAQS = [
  {
    q: "What should I check before hiring any contractor?",
    a: (
      <>
        <p>Three things, and ask for all of them in writing:</p>
        <ul className="list-disc pl-5">
          <li>A WorkSafeBC clearance letter</li>
          <li>Proof of liability insurance</li>
          <li>A business licence</li>
        </ul>
        <p>
          If a contractor can&apos;t produce those, they aren&apos;t in a position to
          stand behind their work — and you&apos;re the one carrying the risk if
          something goes wrong on your property.
        </p>
      </>
    ),
  },
  {
    q: "Do you do cash jobs?",
    a: (
      <>
        <p>
          We accept cash as legal tender, but your method of payment won&apos;t change
          the price of your project. We pay our taxes.
        </p>
        <p>
          The way we view it: if a contractor is willing to cheat the government,
          what&apos;s to stop them acting dishonourably with their clients?
        </p>
      </>
    ),
  },
  {
    q: "Do you build new homes?",
    a: (
      <>
        <p>
          Only if you hold your Owner Builder Certification, and then only a few of the
          main aspects of the contract — as the owner builder, you&apos;re the General
          Contractor.
        </p>
        <p>
          Without an OBC, use a GC licensed through BC Housing who carries New Home
          Warranty coverage (the 2-5-10). Check the registry online for whoever you
          choose: many GCs offer new home builds using someone else&apos;s new home
          warranty information, and that is not a situation you want to be in if your
          project runs into problems.
        </p>
      </>
    ),
  },
  {
    q: "What should I check before hiring any contractor?",
    a: (
      <>
        <p>
          Ask for three things, from us or anyone else: a WorkSafeBC clearance letter,
          proof of insurance, and a business licence.
        </p>
        <p>
          If a contractor doesn&apos;t have them, they aren&apos;t in a position to stand
          behind their work. It isn&apos;t a matter of goodwill — without coverage, there
          is nothing to draw on if something goes wrong on your property.
        </p>
      </>
    ),
  },
  {
    q: "Do you do roofing?",
    a: (
      <p>
        Our own crew installs asphalt shingle and metal cladding on sheds, garages and
        auxiliary buildings — anything not over a living space. For roofs over living
        space we arrange our preferred subcontractors, who carry all the proper insurance.
        We also take on emergency leak mitigation on existing roofs of any type.
      </p>
    ),
  },
  {
    q: "Do you do torch-on roofing?",
    a: (
      <p>
        No. The only contractor in town we&apos;re aware of who&apos;s licensed for it is
        Nelson Roofing. If that&apos;s out of date and you&apos;re a contractor licensed
        to do this work, please reach out so we can update this answer.
      </p>
    ),
  },
  {
    q: "Do you install gutters?",
    a: (
      <p>
        We install European-style gutters. For seamless aluminum, we&apos;d point you to
        Modern Windows or Gutter Shark — both local, both do good work.
      </p>
    ),
  },
  {
    q: "Who else does insurance work in town?",
    a: (
      <p>
        Insurance companies often require multiple quotes. Other than us, your options
        locally are SJS Restorations — we have nothing but good things to say about Jim
        and his crew — or Edeo Restorations, formerly WinMar Powell River, who have all
        the skills required.
      </p>
    ),
  },
  {
    q: "Are you on my insurer's preferred vendor list?",
    a: (
      <p>
        No. Insurers build those lists around Xactimate estimating software, which we
        don&apos;t use. We&apos;re happy to work with your insurer directly and to price
        competitively against the contractors who are on the list.
      </p>
    ),
  },
  {
    q: "What if you can't fit my project into your schedule?",
    a: (
      <>
        <p>
          Then we&apos;ll say so, and we&apos;re happy to recommend another contractor who
          might be able to. Just ask — we&apos;d rather point you somewhere useful than
          hold up your project.
        </p>
        <p>
          qathet Living also published a Home and Hammer insert in 2026 listing local
          contractors and trades. It&apos;s worth a look if you&apos;re gathering
          options.
        </p>
      </>
    ),
  },
  {
    q: "I want my own hazardous materials assessment. Who do you use?",
    a: (
      <p>
        Our number one local option is Assured Asbestos Abatement. If you&apos;d rather
        someone from the island, we recommend Tsolum and Tsable Environmental.
      </p>
    ),
  },
  {
    q: "Who are your plumbers and electricians?",
    a: (
      <p>
        We work with a number of local professionals in both trades. Which one we use on
        your project usually comes down to availability.
      </p>
    ),
  },
  {
    q: "Do you offer after-hours emergency service?",
    a: (
      <p>
        We take on emergency and restoration work, but we can&apos;t guarantee after-hours
        availability. After-hours call-outs are billed at a minimum two hours at $150 per
        man hour.
      </p>
    ),
  },
  {
    q: "How do you bill?",
    a: (
      <>
        <p>
          Wherever the scope is known, we prefer a firm price. Where it isn&apos;t, we
          either build in a set contingency or invoice weekly so you can watch the costs
          as the job runs.
        </p>
        <p>
          Materials, subtrades, engineers, dump fees, permits, architects and
          miscellaneous expenses are billed at a 20% markup, and digital copies of
          receipts are available on request.
        </p>
      </>
    ),
  },
  {
    q: "Do you work as a subcontractor for other contractors?",
    a: (
      <>
        <p>
          Yes. We&apos;ve framed for general contractors on projects where framing was all
          they needed from us &mdash; walls, trusses, roof sheeting, through framing
          inspection and handed off.
        </p>
        <p>If you&apos;re a GC looking for a framing crew, get in touch.</p>
      </>
    ),
  },
  {
    q: "Do you bring your own equipment?",
    a: (
      <p>
        Sometimes. It depends on whether what we own will do the job cost-efficiently for
        you. If it won&apos;t, we bring in rentals rather than making our machine fit the
        work.
      </p>
    ),
  },
  {
    q: "Do I need to supply materials?",
    a: (
      <>
        <p>
          No &mdash; we supply our own, so the right materials go into your project and no
          time is lost to duplicated effort or procurement delays.
        </p>
        <p>
          That said, if there&apos;s something specific you want used &mdash; an antique
          transom window, a vintage farmhouse sink, lumber from a local mill &mdash;
          we&apos;re happy to work with what you have.
        </p>
      </>
    ),
  },
  {
    q: "What about a deposit?",
    a: (
      <p>
        A deposit is taken at the start of your project and applied to your final weekly
        invoice. Anything left over is refunded to you promptly.
      </p>
    ),
  },
  {
    q: "Do you do cash jobs?",
    a: (
      <>
        <p>
          We accept cash as legal tender, but your method of payment won&apos;t change the
          price of your project. We pay our taxes.
        </p>
        <p>
          The way we see it: if a contractor is willing to cheat the government,
          what&apos;s to stop them acting dishonourably with their clients?
        </p>
      </>
    ),
  },
  {
    q: "How do I pay?",
    a: (
      <p>
        We prefer e-transfer, cheque or bank draft. Credit cards are also accepted through
        our online invoicing system.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-display text-4xl font-700 sm:text-5xl">
        Frequently asked questions
      </h1>
      <p className="mt-5 max-w-prose text-lg leading-relaxed">
        Including the work we don&apos;t do, and who to call instead.
      </p>

      <dl className="mt-12 max-w-prose">
        {FAQS.map(({ q, a }) => (
          <div key={q} className="rule-item py-6 first:pt-0">
            <dt className="font-display text-xl font-600">{q}</dt>
            <dd className="mt-3 space-y-4 text-base leading-relaxed">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
